const XLSX = require('xlsx');
const { jsPDF } = require('jspdf');
require('jspdf-autotable');
const { Website, ThreatLog, SSLLog, DNSLog, IncidentLog, RestoreLog } = require('../models');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');

const EXPORT_DIR = path.join(process.cwd(), 'exports');
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

// Build accountId filter — if accountId provided, find websites for that account
async function accountFilter(userId, accountId) {
  const base = { user: userId };
  if (accountId) base.hostingerAccount = accountId;
  return base;
}

// ─── WEBSITE INVENTORY EXPORT ────────────────────────────────────────────────
async function exportWebsiteInventory(userId, format = 'xlsx', accountId = null) {
  const query = await accountFilter(userId, accountId);
  const websites = await Website.find(query)
    .populate('hostingerAccount', 'accountName email')
    .lean();

  const rows = websites.map(site => ({
    'Domain': site.domain,
    'Hosting Account': site.hostingerAccount?.accountName || '—',
    'Account Email': site.hostingerAccount?.email || '—',
    'Status': site.status,
    'Threat Score': site.threatScore,
    'Threat Level': site.threatLevel,
    'SSL Status': site.sslStatus,
    'SSL Expiry': site.sslExpiry ? new Date(site.sslExpiry).toLocaleDateString() : '—',
    'SSL Days Left': site.sslDaysLeft ?? '—',
    'Hosting Plan': site.hostingPlan || '—',
    'Hosting Username': site.hostingUsername || '—',
    'Domain Expiry': site.domainExpiry ? new Date(site.domainExpiry).toLocaleDateString() : '—',
    'Technology': site.technology?.detected?.join(', ') || '—',
    'HTTP Status': site.httpStatus ?? '—',
    'Response Time (ms)': site.responseTime ?? '—',
    'Last Scan': site.lastThreatScan ? new Date(site.lastThreatScan).toLocaleString() : '—',
    'Last Health Check': site.lastHealthCheck ? new Date(site.lastHealthCheck).toLocaleString() : '—',
    'Last Backup': site.lastBackup ? new Date(site.lastBackup).toLocaleString() : '—',
  }));

  const filename = `website-inventory-${Date.now()}.${format}`;
  const filepath = path.join(EXPORT_DIR, filename);

  if (format === 'csv') return exportCSV(rows, filepath, filename);
  if (format === 'xlsx') return exportXLSX([{ sheetName: 'Website Inventory', data: rows }], filepath, filename);
  return exportPDF({
    title: 'Website Inventory Report',
    subtitle: `Generated: ${new Date().toLocaleString()} | Total: ${rows.length} websites`,
    columns: ['Domain', 'Account', 'Status', 'Threat Score', 'SSL Status', 'SSL Days Left', 'Last Scan'],
    rows: rows.map(r => [r.Domain, r['Hosting Account'], r.Status, r['Threat Score'], r['SSL Status'], r['SSL Days Left'], r['Last Scan']]),
    filepath, filename,
  });
}

// ─── THREAT REPORT EXPORT ────────────────────────────────────────────────────
async function exportThreatReport(userId, format = 'xlsx', accountId = null) {
  const websiteQuery = await accountFilter(userId, accountId);
  // If accountId filter — get website IDs first
  let threatQuery = { user: userId };
  if (accountId) {
    const siteIds = await Website.find(websiteQuery).distinct('_id');
    threatQuery.website = { $in: siteIds };
  }

  const threats = await ThreatLog.find(threatQuery)
    .populate({ path: 'website', select: 'domain', populate: { path: 'hostingerAccount', select: 'accountName' } })
    .sort({ detectedAt: -1 })
    .lean();

  const rows = threats.map(t => ({
    'Domain': t.website?.domain || '—',
    'Account': t.website?.hostingerAccount?.accountName || '—',
    'Threat Type': (t.threatType || '').replace(/_/g, ' ').toUpperCase(),
    'Severity': t.severity?.toUpperCase() || '—',
    'Score': t.score,
    'Title': t.title || '—',
    'Description': t.description || '—',
    'Detected At': new Date(t.detectedAt).toLocaleString(),
    'Status': t.isResolved ? 'RESOLVED' : 'ACTIVE',
    'Resolved At': t.resolvedAt ? new Date(t.resolvedAt).toLocaleString() : '—',
  }));

  const filename = `threat-report-${Date.now()}.${format}`;
  const filepath = path.join(EXPORT_DIR, filename);

  if (format === 'pdf') {
    return exportPDF({
      title: 'Threat Detection Report',
      subtitle: `Generated: ${new Date().toLocaleString()} | Total threats: ${rows.length}`,
      columns: ['Domain', 'Account', 'Threat Type', 'Severity', 'Score', 'Detected At', 'Status'],
      rows: rows.map(r => [r.Domain, r.Account, r['Threat Type'], r.Severity, r.Score, r['Detected At'], r.Status]),
      filepath, filename, headerColor: [220, 50, 50],
    });
  }
  if (format === 'xlsx') return exportXLSX([{ sheetName: 'Threat Report', data: rows }], filepath, filename);
  return exportCSV(rows, filepath, filename);
}

// ─── SSL REPORT EXPORT ───────────────────────────────────────────────────────
async function exportSSLReport(userId, format = 'xlsx', accountId = null) {
  const query = await accountFilter(userId, accountId);
  query.isActive = true;

  const websites = await Website.find(query)
    .populate('hostingerAccount', 'accountName')
    .lean();

  const rows = websites.map(site => ({
    'Domain': site.domain,
    'Account': site.hostingerAccount?.accountName || '—',
    'SSL Status': site.sslStatus || '—',
    'SSL Expiry': site.sslExpiry ? new Date(site.sslExpiry).toLocaleDateString() : '—',
    'Days Until Expiry': site.sslDaysLeft ?? '—',
    'Alert Level': site.sslDaysLeft <= 0 ? 'EXPIRED'
      : site.sslDaysLeft <= 3 ? 'CRITICAL (3d)'
      : site.sslDaysLeft <= 7 ? 'URGENT (7d)'
      : site.sslDaysLeft <= 15 ? 'WARNING (15d)'
      : site.sslDaysLeft <= 30 ? 'NOTICE (30d)'
      : 'OK',
  })).sort((a, b) => (a['Days Until Expiry'] || 999) - (b['Days Until Expiry'] || 999));

  const filename = `ssl-report-${Date.now()}.${format}`;
  const filepath = path.join(EXPORT_DIR, filename);

  if (format === 'pdf') {
    return exportPDF({
      title: 'SSL Certificate Report',
      subtitle: `Generated: ${new Date().toLocaleString()} | Total: ${rows.length}`,
      columns: ['Domain', 'Account', 'SSL Status', 'SSL Expiry', 'Days Left', 'Alert Level'],
      rows: rows.map(r => [r.Domain, r.Account, r['SSL Status'], r['SSL Expiry'], r['Days Until Expiry'], r['Alert Level']]),
      filepath, filename, headerColor: [50, 100, 200],
    });
  }
  if (format === 'xlsx') return exportXLSX([{ sheetName: 'SSL Report', data: rows }], filepath, filename);
  return exportCSV(rows, filepath, filename);
}

// ─── DNS REPORT EXPORT ───────────────────────────────────────────────────────
async function exportDNSReport(userId, format = 'xlsx', accountId = null) {
  const websiteQuery = await accountFilter(userId, accountId);
  let dnsQuery = {};
  if (accountId) {
    const siteIds = await Website.find(websiteQuery).distinct('_id');
    dnsQuery.website = { $in: siteIds };
  }

  const logs = await DNSLog.find(dnsQuery)
    .populate({ path: 'website', select: 'domain', populate: { path: 'hostingerAccount', select: 'accountName' } })
    .sort({ checkedAt: -1 })
    .lean();

  const rows = logs.map(l => ({
    'Domain': l.website?.domain || '—',
    'Account': l.website?.hostingerAccount?.accountName || '—',
    'Has Changed': l.hasChanged ? 'YES' : 'NO',
    'A Records': l.records?.A?.join(', ') || '—',
    'MX Records': l.records?.MX?.join(', ') || '—',
    'NS Records': l.records?.NS?.join(', ') || '—',
    'TXT Records': (l.records?.TXT || []).join(', ').substring(0, 100) || '—',
    'Checked At': l.checkedAt ? new Date(l.checkedAt).toLocaleString() : '—',
  }));

  const filename = `dns-logs-${Date.now()}.${format}`;
  const filepath = path.join(EXPORT_DIR, filename);
  if (format === 'xlsx') return exportXLSX([{ sheetName: 'DNS Logs', data: rows }], filepath, filename);
  return exportCSV(rows, filepath, filename);
}

// ─── INCIDENTS EXPORT ────────────────────────────────────────────────────────
async function exportIncidentsReport(userId, format = 'xlsx', accountId = null) {
  const websiteQuery = await accountFilter(userId, accountId);
  let incidentQuery = { user: userId };
  if (accountId) {
    const siteIds = await Website.find(websiteQuery).distinct('_id');
    incidentQuery.website = { $in: siteIds };
  }

  const incidents = await IncidentLog.find(incidentQuery)
    .populate({ path: 'website', select: 'domain', populate: { path: 'hostingerAccount', select: 'accountName' } })
    .sort({ detectionTime: -1 })
    .lean();

  const rows = incidents.map(i => ({
    'Title': i.title || '—',
    'Domain': i.website?.domain || '—',
    'Account': i.website?.hostingerAccount?.accountName || '—',
    'Type': i.incidentType || '—',
    'Severity': i.severity?.toUpperCase() || '—',
    'Status': (i.status || '').toUpperCase(),
    'Detection Time': i.detectionTime ? new Date(i.detectionTime).toLocaleString() : '—',
    'Resolution Time': i.resolutionTime ? new Date(i.resolutionTime).toLocaleString() : '—',
    'Description': i.description || '—',
  }));

  const filename = `incidents-${Date.now()}.${format}`;
  const filepath = path.join(EXPORT_DIR, filename);
  if (format === 'xlsx') return exportXLSX([{ sheetName: 'Incidents', data: rows }], filepath, filename);
  return exportCSV(rows, filepath, filename);
}

// ─── RESTORE LOGS EXPORT ─────────────────────────────────────────────────────
async function exportRestoreLogs(userId, format = 'xlsx', accountId = null) {
  const websiteQuery = await accountFilter(userId, accountId);
  let query = { user: userId };
  if (accountId) {
    const siteIds = await Website.find(websiteQuery).distinct('_id');
    query.website = { $in: siteIds };
  }

  const logs = await RestoreLog.find(query)
    .populate({ path: 'website', select: 'domain', populate: { path: 'hostingerAccount', select: 'accountName' } })
    .sort({ startedAt: -1 })
    .lean();

  const rows = logs.map(log => ({
    'Domain': log.website?.domain || '—',
    'Account': log.website?.hostingerAccount?.accountName || '—',
    'Restore Type': log.restoreType || '—',
    'Backup Date': log.backupDate ? new Date(log.backupDate).toLocaleDateString() : '—',
    'Status': (log.status || '').toUpperCase(),
    'Started At': log.startedAt ? new Date(log.startedAt).toLocaleString() : '—',
    'Completed At': log.completedAt ? new Date(log.completedAt).toLocaleString() : '—',
    'Verification': log.verificationStatus || '—',
    'Verification Score': log.verificationThreatScore ?? '—',
    'Notes': log.notes || '—',
  }));

  const filename = `restore-logs-${Date.now()}.${format}`;
  const filepath = path.join(EXPORT_DIR, filename);
  if (format === 'xlsx') return exportXLSX([{ sheetName: 'Restore Logs', data: rows }], filepath, filename);
  return exportCSV(rows, filepath, filename);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function exportCSV(rows, filepath, filename) {
  if (!rows.length) {
    fs.writeFileSync(filepath, 'No data\n', 'utf8');
    return { filepath, filename, mimeType: 'text/csv' };
  }
  const headers = Object.keys(rows[0]);
  const csvRows = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => `"${(row[h] ?? '').toString().replace(/"/g, '""')}"`).join(',')
    )
  ];
  fs.writeFileSync(filepath, csvRows.join('\n'), 'utf8');
  return { filepath, filename, mimeType: 'text/csv' };
}

function exportXLSX(sheets, filepath, filename) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.data.length ? sheet.data : [{ 'No Data': 'No records found' }]);
    // Auto column width
    const cols = Object.keys(sheet.data[0] || {}).map(k => ({ wch: Math.max(k.length + 2, 14) }));
    ws['!cols'] = cols;
    XLSX.utils.book_append_sheet(wb, ws, sheet.sheetName);
  }
  XLSX.writeFile(wb, filepath);
  return { filepath, filename, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}

function exportPDF({ title, subtitle, columns, rows, filepath, filename, headerColor = [26, 32, 53] }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFillColor(...headerColor);
  doc.rect(0, 0, 300, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Hostinger Shield Pro', 14, 12);
  doc.setFontSize(11);
  doc.text(title, 14, 20);
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(8);
  doc.text(subtitle, 14, 30);

  doc.autoTable({
    head: [columns],
    body: rows.length ? rows : [columns.map(() => '—')],
    startY: 35,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: headerColor, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 14, right: 14 },
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${pageCount} | Hostinger Shield Pro | ${new Date().toLocaleString()}`,
      14, doc.internal.pageSize.height - 5
    );
  }

  doc.save(filepath);
  return { filepath, filename, mimeType: 'application/pdf' };
}

module.exports = {
  exportWebsiteInventory,
  exportThreatReport,
  exportSSLReport,
  exportDNSReport,
  exportIncidentsReport,
  exportRestoreLogs,
  EXPORT_DIR,
};