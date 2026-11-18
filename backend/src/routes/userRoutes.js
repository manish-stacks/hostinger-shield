const router = require('express').Router();
const { protect, restrictTo } = require('../middleware');
const { User } = require('../models');
const { catchAsync, sendSuccess, sendPaginated, getPagination } = require('../utils/helpers');
const { AppError } = require('../utils/errors');

router.use(protect);

// Current user: get own profile (defined BEFORE /:id routes!)
router.get('/me', catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select('-password -refreshTokens').lean();
  sendSuccess(res, { data: user });
}));

// Current user: update profile
router.patch('/me', catchAsync(async (req, res) => {
  const { name, avatar } = req.body;
  const update = {};
  if (name) update.name = name;
  if (avatar) update.avatar = avatar;
  const user = await User.findByIdAndUpdate(req.user._id, update, { new: true }).select('-password -refreshTokens');
  sendSuccess(res, { data: user }, 'Profile updated');
}));

// Current user: update alert preferences
router.patch('/me/alert-preferences', catchAsync(async (req, res) => {
  const {
    whatsapp, email, inApp, telegram, webhook, soundAlerts,
    phoneNumber, alertEmail, escalationPhone, escalationEmail,
    telegramChatId, webhookUrl,
  } = req.body;

  const update = {};
  if (whatsapp !== undefined)        update['alertPreferences.whatsapp']        = whatsapp;
  if (email !== undefined)           update['alertPreferences.email']           = email;
  if (inApp !== undefined)           update['alertPreferences.inApp']           = inApp;
  if (telegram !== undefined)        update['alertPreferences.telegram']        = telegram;
  if (webhook !== undefined)         update['alertPreferences.webhook']         = webhook;
  if (soundAlerts !== undefined)     update['alertPreferences.soundAlerts']     = soundAlerts;
  if (phoneNumber !== undefined)     update['alertPreferences.phoneNumber']     = phoneNumber;
  if (alertEmail !== undefined)      update['alertPreferences.alertEmail']      = alertEmail;
  if (escalationPhone !== undefined) update['alertPreferences.escalationPhone'] = escalationPhone;
  if (escalationEmail !== undefined) update['alertPreferences.escalationEmail'] = escalationEmail;
  if (telegramChatId !== undefined)  update['alertPreferences.telegramChatId']  = telegramChatId;
  if (webhookUrl !== undefined)      update['alertPreferences.webhookUrl']      = webhookUrl;

  const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true }).select('-password -refreshTokens');
  sendSuccess(res, { data: user }, 'Alert preferences updated');
}));

// Test alert (email, whatsapp, telegram, webhook)
router.post('/me/test-alert', catchAsync(async (req, res) => {
  const { channel } = req.body;
  const user = await User.findById(req.user._id);
  const notifService = require('../services/notificationService');

  if (channel === 'email') {
    const to = user.alertPreferences?.alertEmail || user.email;
    await notifService.sendEmail(
      to,
      '✅ Shield Pro — Test Alert',
      `<div style="font-family:Arial,sans-serif;padding:24px;background:#070b14;color:#e6edf3;border-radius:12px"><h2 style="color:#6366f1">Test Alert Working ✅</h2><p>Your email alerts are configured correctly and ready to notify you immediately.</p><p style="color:#8b949e;font-size:12px">Hostinger Shield Pro</p></div>`
    );
    return sendSuccess(res, {}, 'Test email sent');
  }

  if (channel === 'whatsapp') {
    if (!user.alertPreferences?.phoneNumber) throw new AppError('Phone number not set', 400);
    await notifService.sendWhatsApp(user.alertPreferences.phoneNumber, '✅ Shield Pro test alert — your WhatsApp notifications are working!');
    return sendSuccess(res, {}, 'Test WhatsApp sent');
  }

  if (channel === 'telegram') {
    const chatId = user.alertPreferences?.telegramChatId || process.env.TELEGRAM_CHAT_ID;
    if (!chatId) throw new AppError('Telegram Chat ID not set', 400);
    await notifService.sendTelegram(chatId, '<b>✅ Shield Pro — Test Alert</b>\n\nYour Telegram instant alerts are active and working!');
    return sendSuccess(res, {}, 'Test Telegram message sent');
  }

  if (channel === 'webhook') {
    const url = user.alertPreferences?.webhookUrl || process.env.ALERT_WEBHOOK_URL;
    if (!url) throw new AppError('Webhook URL not set', 400);
    await notifService.sendWebhook(url, {
      title: '✅ Shield Pro — Test Alert',
      message: 'Your webhook alert integration is configured and receiving instant notifications!',
      severity: 'low',
    });
    return sendSuccess(res, {}, 'Test webhook sent');
  }

  throw new AppError('Invalid channel', 400);
}));

// Admin only: list all users
router.get('/', restrictTo('super_admin', 'admin'), catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const [users, total] = await Promise.all([
    User.find().select('-password -refreshTokens').skip(skip).limit(limit).lean(),
    User.countDocuments(),
  ]);
  sendPaginated(res, users, total, page, limit);
}));

// Admin: toggle user active status
router.patch('/:id/toggle', restrictTo('super_admin', 'admin'), catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  user.isActive = !user.isActive;
  await user.save({ validateBeforeSave: false });
  sendSuccess(res, { data: { isActive: user.isActive } }, `User ${user.isActive ? 'activated' : 'deactivated'}`);
}));

// Admin: change user role
router.patch('/:id/role', restrictTo('super_admin', 'admin'), catchAsync(async (req, res) => {
  const { role } = req.body;
  if (!['super_admin', 'admin', 'viewer'].includes(role)) throw new AppError('Invalid role', 400);
  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password -refreshTokens');
  if (!user) throw new AppError('User not found', 404);
  sendSuccess(res, { data: user }, 'Role updated');
}));

// Admin: delete user
router.delete('/:id', restrictTo('super_admin', 'admin'), catchAsync(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) throw new AppError('Cannot delete yourself', 400);
  await User.findByIdAndDelete(req.params.id);
  sendSuccess(res, {}, 'User deleted');
}));

module.exports = router;
