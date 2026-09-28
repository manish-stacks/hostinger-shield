const exportService = require('../services/exportService');
const reportService = require('../services/reportService');
const { Report } = require('../models');
const { AppError } = require('../utils/errors');

// ── Helper ────────────────────────────────────────────────────────────────────
const sendExport = async (res, next, fn, userId, format, accountId) => {
  try {
    const result = await fn(userId, format, accountId || null);
    if (!result) return next(new AppError('No data to export', 404));
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Type', result.mimeType || 'application/octet-stream');
    res.download(result.filepath, result.filename, (err) => {
      if (err && !res.headersSent) next(err);
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/exports/websites?format=xlsx&accountId=...
exports.exportWebsites = (req, res, next) => {
  const { format = 'xlsx', accountId } = req.query;
  sendExport(res, next, exportService.exportWebsiteInventory.bind(exportService), req.user._id, format, accountId);
};

// POST /api/exports/threats
exports.exportThreats = (req, res, next) => {
  const { format = 'xlsx', accountId } = req.query;
  sendExport(res, next, exportService.exportThreatReport.bind(exportService), req.user._id, format, accountId);
};

// POST /api/exports/ssl
exports.exportSSL = (req, res, next) => {
  const { format = 'xlsx', accountId } = req.query;
  sendExport(res, next, exportService.exportSSLReport.bind(exportService), req.user._id, format, accountId);
};

// POST /api/exports/dns
exports.exportDNS = (req, res, next) => {
  const { format = 'xlsx', accountId } = req.query;
  sendExport(res, next, exportService.exportDNSReport.bind(exportService), req.user._id, format, accountId);
};

// POST /api/exports/incidents
exports.exportIncidents = (req, res, next) => {
  const { format = 'xlsx', accountId } = req.query;
  sendExport(res, next, exportService.exportIncidentsReport.bind(exportService), req.user._id, format, accountId);
};

// ── REPORTS ───────────────────────────────────────────────────────────────────

exports.getReports = async (req, res, next) => {
  try {
    const { type, page = 1, limit = 20 } = req.query;
    const query = { user: req.user._id };
    if (type) query.reportType = type;
    const [reports, total] = await Promise.all([
      Report.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(+limit).lean(),
      Report.countDocuments(query),
    ]);
    res.json({
      success: true,
      data: reports,
      pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) },
    });
  } catch (err) { next(err); }
};

exports.getReport = async (req, res, next) => {
  try {
    const report = await Report.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!report) return next(new AppError('Report not found', 404));
    res.json({ success: true, data: report });
  } catch (err) { next(err); }
};

// POST /api/reports/generate  { type: 'daily' | 'weekly' | 'monthly' }
exports.generateReport = async (req, res, next) => {
  try {
    const { type = 'daily' } = req.body;
    // Pass req.user._id so Report.create gets a valid user
    const userId = req.user._id;
    let result;
    switch (type) {
      case 'weekly':  result = await reportService.generateWeeklySummary(userId);  break;
      case 'monthly': result = await reportService.generateMonthlySummary(userId); break;
      default:        result = await reportService.generateDailySummary(userId);
    }
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

exports.downloadReport = async (req, res, next) => {
  try {
    const { format = 'pdf' } = req.query;
    const result = await reportService.exportReport(req.params.id, format);
    res.download(result.filepath, result.filename, (err) => { if (err) next(err); });
  } catch (err) { next(err); }
};