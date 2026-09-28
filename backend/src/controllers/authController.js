const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User } = require('../models');
const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

const signAccessToken = (userId, role) =>
  jwt.sign({ id: userId, role }, process.env.JWT_SECRET, { expiresIn: '15m' });

const signRefreshToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

// POST /api/auth/register
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    const existing = await User.findOne({ email });
    if (existing) throw new AppError('Email already registered', 400);

    const assignedRole = role === 'super_admin' ? 'admin' : (role || 'admin');
    const user = await User.create({ name, email, password, role: assignedRole });

    const accessToken = signAccessToken(user._id, user.role);
    const refreshToken = signRefreshToken(user._id);
    user.refreshTokens.push({ token: refreshToken, createdAt: new Date() });
    await user.save({ validateBeforeSave: false });

    res.status(201).json({
      success: true,
      data: {
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
        accessToken,
        refreshToken,
      },
    });
  } catch (err) { next(err); }
};

// POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) throw new AppError('Email and password required', 400);

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      if (user) {
        user.loginAttempts = (user.loginAttempts || 0) + 1;
        if (user.loginAttempts >= 5) {
          user.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
        }
        await user.save({ validateBeforeSave: false });
      }
      throw new AppError('Invalid email or password', 401);
    }

    if (user.isLocked) throw new AppError('Account locked. Try again in 30 minutes.', 423);
    if (!user.isActive) throw new AppError('Account disabled. Contact administrator.', 403);

    // Reset failed attempts
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLogin = new Date();

    const accessToken = signAccessToken(user._id, user.role);
    const refreshToken = signRefreshToken(user._id);

    // Keep last 5 refresh tokens
    user.refreshTokens = (user.refreshTokens || []).slice(-4);
    user.refreshTokens.push({ token: refreshToken, createdAt: new Date() });
    await user.save({ validateBeforeSave: false });

    logger.info(`Login success: ${user.email}`);

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (err) { next(err); }
};

// POST /api/auth/refresh
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError('Refresh token required', 400);

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    const user = await User.findOne({
      _id: decoded.id,
      'refreshTokens.token': refreshToken,
    });
    if (!user) throw new AppError('Invalid refresh token', 401);

    // Rotate
    user.refreshTokens = user.refreshTokens.filter(t => t.token !== refreshToken);
    const newRefreshToken = signRefreshToken(user._id);
    user.refreshTokens.push({ token: newRefreshToken, createdAt: new Date() });
    await user.save({ validateBeforeSave: false });

    const accessToken = signAccessToken(user._id, user.role);
    res.json({ success: true, data: { accessToken, refreshToken: newRefreshToken } });
  } catch (err) { next(err); }
};

// POST /api/auth/logout  (protected)
exports.logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await User.updateOne(
        { _id: req.user._id },
        { $pull: { refreshTokens: { token: refreshToken } } }
      );
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) { next(err); }
};

// GET /api/auth/me  (protected)
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password -refreshTokens -twoFactorSecret');
    if (!user) throw new AppError('User not found', 404);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

// PATCH /api/auth/update-password  (protected)
exports.updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) throw new AppError('Both passwords required', 400);
    if (newPassword.length < 8) throw new AppError('Password min 8 characters', 400);

    const user = await User.findById(req.user._id).select('+password');
    if (!user) throw new AppError('User not found', 404);

    if (!(await user.comparePassword(currentPassword))) {
      throw new AppError('Current password is incorrect', 401);
    }

    user.password = newPassword;
    user.refreshTokens = [];
    await user.save();

    const accessToken = signAccessToken(user._id, user.role);
    const refreshToken = signRefreshToken(user._id);
    user.refreshTokens.push({ token: refreshToken, createdAt: new Date() });
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, message: 'Password updated', data: { accessToken, refreshToken } });
  } catch (err) { next(err); }
};

// POST /api/auth/forgot-password
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.json({ success: true, message: 'If email exists, reset link sent.' });

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    // Email sending — non-blocking, don't fail login flow
    const resetURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    logger.info(`Password reset URL for ${email}: ${resetURL}`);

    res.json({ success: true, message: 'If email exists, reset link sent.' });
  } catch (err) { next(err); }
};

// POST /api/auth/reset-password/:token
exports.resetPassword = async (req, res, next) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });
    if (!user) throw new AppError('Invalid or expired reset token', 400);

    user.password = req.body.password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.refreshTokens = [];
    await user.save();

    res.json({ success: true, message: 'Password reset successful' });
  } catch (err) { next(err); }
};