// ─── AUTH MIDDLEWARE ─────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { AppError } = require('../utils/errors');

exports.protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Not authenticated. Please login.', 401);
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') throw new AppError('Session expired. Please refresh token.', 401);
      throw new AppError('Invalid token.', 401);
    }

    const user = await User.findById(decoded.id).select('-password');
    if (!user) throw new AppError('User no longer exists.', 401);
    if (!user.isActive) throw new AppError('Account disabled.', 403);

    req.user = user;
    next();
  } catch (err) { next(err); }
};

exports.restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new AppError('You do not have permission to perform this action.', 403));
  }
  next();
};

// ─── ERROR HANDLER ────────────────────────────────────────────────────────────
const logger = require('../utils/logger');

exports.errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    err = new AppError(`${field} already exists.`, 400);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    err = new AppError(messages.join('. '), 400);
  }

  // Mongoose cast error
  if (err.name === 'CastError') {
    err = new AppError(`Invalid ${err.path}: ${err.value}`, 400);
  }

  if (err.statusCode >= 500) {
    logger.error(`[${req.method}] ${req.path} — ${err.message}`, { stack: err.stack });
  }

  res.status(err.statusCode).json({
    success: false,
    error: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

// ─── VALIDATORS ───────────────────────────────────────────────────────────────
const { body, validationResult } = require('express-validator');

exports.validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map(e => e.msg).join('. ');
    return next(new AppError(messages, 400));
  }
  next();
};

exports.authValidators = {
  register: [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  login: [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
};

exports.websiteValidators = {
  create: [
    body('domain').trim().notEmpty().withMessage('Domain is required')
      .matches(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}/).withMessage('Valid domain required'),
    body('hostingerAccount').isMongoId().withMessage('Valid Hostinger account ID required'),
  ],
};
