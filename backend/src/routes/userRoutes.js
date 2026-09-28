const router = require('express').Router();
const { protect, restrictTo } = require('../middleware');
const { User } = require('../models');
const { catchAsync, sendSuccess, sendPaginated, getPagination } = require('../utils/helpers');
const { AppError } = require('../utils/errors');

router.use(protect);

// Admin only: list all users
router.get('/', restrictTo('admin'), catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const [users, total] = await Promise.all([
    User.find().select('-password -refreshToken').skip(skip).limit(limit).lean(),
    User.countDocuments(),
  ]);
  sendPaginated(res, users, total, page, limit);
}));

// Admin: toggle user active status
router.patch('/:id/toggle', restrictTo('admin'), catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  user.isActive = !user.isActive;
  await user.save({ validateBeforeSave: false });
  sendSuccess(res, { data: { isActive: user.isActive } }, `User ${user.isActive ? 'activated' : 'deactivated'}`);
}));

// Admin: change user role
router.patch('/:id/role', restrictTo('admin'), catchAsync(async (req, res) => {
  const { role } = req.body;
  if (!['admin', 'manager', 'viewer'].includes(role)) throw new AppError('Invalid role', 400);
  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password');
  if (!user) throw new AppError('User not found', 404);
  sendSuccess(res, { data: user }, 'Role updated');
}));

// Admin: delete user
router.delete('/:id', restrictTo('admin'), catchAsync(async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  sendSuccess(res, {}, 'User deleted');
}));


// Current user: update alert preferences
router.patch('/me/alert-preferences', catchAsync(async (req, res) => {
  const { whatsapp, email, inApp, phoneNumber, alertEmail } = req.body;
  const update = {};
  if (whatsapp  !== undefined) update['alertPreferences.whatsapp']  = whatsapp;
  if (email     !== undefined) update['alertPreferences.email']     = email;
  if (inApp     !== undefined) update['alertPreferences.inApp']     = inApp;
  if (phoneNumber !== undefined) update['alertPreferences.phoneNumber'] = phoneNumber;
  if (alertEmail  !== undefined) update['alertPreferences.alertEmail']  = alertEmail;
  const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true }).select('-password -refreshTokens');
  sendSuccess(res, { data: user }, 'Alert preferences updated');
}));

// Current user: get own profile
router.get('/me', catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select('-password -refreshTokens').lean();
  sendSuccess(res, { data: user });
}));

// Current user: update profile
router.patch('/me', catchAsync(async (req, res) => {
  const { name, avatar } = req.body;
  const update = {};
  if (name)   update.name   = name;
  if (avatar) update.avatar = avatar;
  const user = await User.findByIdAndUpdate(req.user._id, update, { new: true }).select('-password -refreshTokens');
  sendSuccess(res, { data: user }, 'Profile updated');
}));


// Test alert (email or whatsapp)
router.post('/me/test-alert', catchAsync(async (req, res) => {
  const { channel } = req.body;
  const user = await User.findById(req.user._id);
  const notifService = require('../services/notificationService');

  if (channel === 'email') {
    const to = user.alertPreferences?.alertEmail || user.email;
    await notifService.sendEmail(to, '✅ Shield Pro — Test Alert', `<div style="font-family:Arial,sans-serif;padding:20px;background:#0d1117;color:#e6edf3"><h2 style="color:#3b5bdb">Test Alert Working ✅</h2><p>Your email alerts are configured correctly.</p><p style="color:#8b949e;font-size:12px">Hostinger Shield Pro</p></div>`);
    return sendSuccess(res, {}, 'Test email sent');
  }

  if (channel === 'whatsapp') {
    if (!user.alertPreferences?.phoneNumber) throw new AppError('Phone number not set', 400);
    await notifService.sendWhatsApp(user.alertPreferences.phoneNumber, '✅ Shield Pro test alert — your WhatsApp notifications are working!');
    return sendSuccess(res, {}, 'Test WhatsApp sent');
  }

  throw new AppError('Invalid channel', 400);
}));

module.exports = router;