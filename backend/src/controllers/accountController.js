const { HostingerAccount, Website } = require('../models');
const hostingerSyncService = require('../services/hostingerSyncService');
const { AppError } = require('../utils/errors');


// ── GET /api/accounts ────────────────────────────────────────────────────────
exports.getAccounts = async (req, res, next) => {
  try {
    const accounts = await HostingerAccount.find({ user: req.user._id })
      .select('-apiToken')
      .sort({ createdAt: -1 })
      .lean();

    const normalized = accounts.map(a => ({
      ...a,
      label: a.accountName,
      lastSyncAt: a.lastSync,
    }));

    res.json({ success: true, data: normalized });
  } catch (err) { next(err); }
};

// ── GET /api/accounts/:id ────────────────────────────────────────────────────
exports.getAccount = async (req, res, next) => {
  try {
    const account = await HostingerAccount.findOne({ _id: req.params.id, user: req.user._id })
      .select('-apiToken');
    if (!account) return next(new AppError('Account not found', 404));
    res.json({ success: true, data: account });
  } catch (err) { next(err); }
};

// ── POST /api/accounts ───────────────────────────────────────────────────────
exports.createAccount = async (req, res, next) => {
  try {
    const { accountName, label, email, apiToken, notes } = req.body;
    const name = accountName || label;

    if (!name || !email || !apiToken) {
      return next(new AppError('accountName, email, and apiToken are required', 400));
    }

    // Validate token with real Hostinger API
    const validation = await hostingerSyncService.validateToken(apiToken);
    if (!validation.valid) {
      return next(new AppError(`Invalid Hostinger API token: ${validation.error}`, 400));
    }

    const account = await HostingerAccount.create({
      accountName: name,
      email,
      apiToken,
      notes,
      isActive: true,
      isTokenValid: true,
      user: req.user._id,
    });

    // Trigger a background sync (non-blocking)
    hostingerSyncService.syncAccount(account._id).catch(e =>
      console.error('[AccountController] Background sync error:', e.message)
    );

    const safeAccount = account.toObject();
    delete safeAccount.apiToken;

    res.status(201).json({ success: true, data: safeAccount });
  } catch (err) { next(err); }
};

// ── PATCH /api/accounts/:id ──────────────────────────────────────────────────
exports.updateAccount = async (req, res, next) => {
  try {
    const account = await HostingerAccount.findOne({ _id: req.params.id, user: req.user._id })
      .select('+apiToken');
    if (!account) return next(new AppError('Account not found', 404));

    const { accountName, label, email, apiToken, notes, isActive } = req.body;

    if (accountName || label) account.accountName = accountName || label;
    if (email !== undefined) account.email = email;
    if (notes !== undefined) account.notes = notes;
    if (isActive !== undefined) account.isActive = isActive;

    if (apiToken) {
      const validation = await hostingerSyncService.validateToken(apiToken);
      if (!validation.valid) {
        return next(new AppError(`Invalid Hostinger API token: ${validation.error}`, 400));
      }
      account.apiToken = apiToken;
      account.isTokenValid = true;
      account.tokenValidationError = null;
    }

    await account.save();

    const safeAccount = account.toObject();
    delete safeAccount.apiToken;

    res.json({ success: true, data: safeAccount });
  } catch (err) { next(err); }
};

// ── DELETE /api/accounts/:id ─────────────────────────────────────────────────
exports.deleteAccount = async (req, res, next) => {
  try {
    const account = await HostingerAccount.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!account) return next(new AppError('Account not found', 404));

    // Also clean up websites that belonged to this account
    await Website.deleteMany({ hostingerAccount: req.params.id });

    res.json({ success: true, message: 'Account and associated websites deleted' });
  } catch (err) { next(err); }
};

// ── POST /api/accounts/:id/sync ──────────────────────────────────────────────
exports.syncAccount = async (req, res, next) => {
  try {
    const account = await HostingerAccount.findOne({ _id: req.params.id, user: req.user._id });
    if (!account) return next(new AppError('Account not found', 404));
    if (!account.isActive) return next(new AppError('Account is inactive', 400));

    const result = await hostingerSyncService.syncAccount(account._id);

    if (result.errors.length > 0 && result.synced === 0) {
      return next(new AppError(`Sync failed: ${result.errors[0]}`, 500));
    }

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

// ── POST /api/accounts/sync-all ──────────────────────────────────────────────
exports.syncAllAccounts = async (req, res, next) => {
  try {
    const results = await hostingerSyncService.syncAllAccounts();
    res.json({ success: true, data: results });
  } catch (err) { next(err); }
};

// ── POST /api/accounts/:id/validate ─────────────────────────────────────────
exports.validateToken = async (req, res, next) => {
  try {
    const account = await HostingerAccount.findOne({ _id: req.params.id, user: req.user._id })
      .select('+apiToken');
    if (!account) return next(new AppError('Account not found', 404));

    const validation = await hostingerSyncService.validateToken(account.apiToken);

    // Update token validity status in DB
    account.isTokenValid = validation.valid;
    account.tokenValidationError = validation.valid ? null : validation.error;
    account.lastValidated = new Date();
    await account.save({ validateBeforeSave: false });

    res.json({ success: true, data: validation });
  } catch (err) { next(err); }
};

// ── PATCH /api/accounts/:id/toggle ───────────────────────────────────────────
exports.toggleAccount = async (req, res, next) => {
  try {
    const account = await HostingerAccount.findOne({ _id: req.params.id, user: req.user._id });
    if (!account) return next(new AppError('Account not found', 404));

    account.isActive = !account.isActive;
    await account.save();

    res.json({ success: true, data: { isActive: account.isActive } });
  } catch (err) { next(err); }
};

// Alias
exports.toggleActive = exports.toggleAccount;
