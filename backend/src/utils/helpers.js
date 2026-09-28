const crypto = require('crypto');

/**
 * Async wrapper to avoid try/catch boilerplate in controllers
 */
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Send standardised JSON success response
 */
const sendSuccess = (res, data = {}, message = 'Success', statusCode = 200) => {
  res.status(statusCode).json({ status: 'success', message, ...data });
};

/**
 * Send standardised paginated response
 */
const sendPaginated = (res, data, total, page, limit) => {
  res.status(200).json({
    status: 'success',
    results: data.length,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / limit),
    },
    data,
  });
};

/**
 * Parse pagination params from query string
 */
const getPagination = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

/**
 * Generate a secure random token
 */
const generateToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

/**
 * Hash a token for safe DB storage
 */
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Sleep helper for async delays
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Strip protocol from URL for display
 */
const stripProtocol = (url) => url.replace(/^https?:\/\//, '');

/**
 * Check if a URL is valid
 */
const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Safely parse JSON (returns null on failure)
 */
const safeJsonParse = (str) => {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
};

module.exports = {
  catchAsync,
  sendSuccess,
  sendPaginated,
  getPagination,
  generateToken,
  hashToken,
  sleep,
  stripProtocol,
  isValidUrl,
  safeJsonParse,
};
