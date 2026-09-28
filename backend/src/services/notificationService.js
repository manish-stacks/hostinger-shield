const axios = require('axios');
const nodemailer = require('nodemailer');
const { Notification, User } = require('../models');
const logger = require('../utils/logger');

// ─── EMAIL TRANSPORTER ────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

// ─── WHATSAPP ─────────────────────────────────────────────────────────────────
async function sendWhatsApp(phoneNumber, message) {
  try {
    const res = await axios.post(
      `${process.env.WAAPI_URL}/api/sendText`,
      { chatId: `${phoneNumber}@c.us`, text: message },
      { headers: { Authorization: `Bearer ${process.env.WAAPI_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    if (typeof res.data === 'string' && res.data.toLowerCase().includes('error')) throw new Error(res.data);
    if (res.data?.success === false) throw new Error(res.data.message || 'WA failed');
    logger.info(`WhatsApp sent to ${phoneNumber}`);
    return true;
  } catch (err) {
    logger.error(`WhatsApp error: ${err.message}`);
    throw err;
  }
}

// ─── EMAIL ────────────────────────────────────────────────────────────────────
async function sendEmail(to, subject, html) {
  try {
    await transporter.sendMail({
      from: `"Hostinger Shield Pro" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to, subject, html,
    });
    logger.info(`Email sent to ${to}: ${subject}`);
    return true;
  } catch (err) {
    logger.error(`Email error to ${to}: ${err.message}`);
    throw err;
  }
}

// ─── IN-APP NOTIFICATION ──────────────────────────────────────────────────────
// Used by screenshotService, sslService, monitoringService etc.
async function createNotification({ user, website, type, title, message, severity = 'medium', actionUrl }) {
  try {
    if (!user) return;
    return await Notification.create({
      user, website: website || undefined,
      type, title, message, severity,
      actionUrl: actionUrl || undefined,
      isRead: false,
      channels: { inApp: { sent: true } },
    });
  } catch (err) {
    logger.error(`createNotification error: ${err.message}`);
  }
}

// ─── TEMPLATES ────────────────────────────────────────────────────────────────
function hackWhatsApp({ domain, threatScore, primaryThreat, incidentId }) {
  return `🚨 *WEBSITE HACKED — Shield Pro*\n\n🌐 Domain: ${domain}\n⚠️ Score: ${threatScore}/100\n🦠 Threat: ${primaryThreat.replace(/_/g,' ').toUpperCase()}\n🆔 Incident: ${incidentId}\n🕐 ${new Date().toLocaleString()}\n\nLogin to restore backup:\n🔗 ${process.env.FRONTEND_URL}/incidents/${incidentId}\n\n— Hostinger Shield Pro`;
}

function hackEmail({ domain, threatScore, primaryThreat, incidentId, threats }) {
  const rows = threats.map(t => `<tr><td style="padding:8px;border-bottom:1px solid #21262d;color:#ef4444;font-weight:600">${t.threatType?.replace(/_/g,' ').toUpperCase()}</td><td style="padding:8px;border-bottom:1px solid #21262d;color:#8b949e">${t.description||''}</td></tr>`).join('');
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#0d1117;color:#e6edf3;margin:0;padding:0">
<div style="max-width:600px;margin:0 auto;padding:24px">
  <div style="background:linear-gradient(135deg,#3b5bdb,#7b5fff);padding:20px;border-radius:10px;text-align:center;margin-bottom:20px">
    <h1 style="color:#fff;margin:0;font-size:20px">🛡️ Shield Pro Security Alert</h1>
  </div>
  <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:20px;margin-bottom:16px">
    <h2 style="color:#ef4444;margin:0 0 12px">🚨 Website Hacked: ${domain}</h2>
    <table style="width:100%">
      <tr><td style="color:#8b949e;padding:4px 0">Threat Score</td><td style="color:#ef4444;font-weight:700">${threatScore}/100 — CRITICAL</td></tr>
      <tr><td style="color:#8b949e;padding:4px 0">Primary Threat</td><td>${primaryThreat.replace(/_/g,' ').toUpperCase()}</td></tr>
      <tr><td style="color:#8b949e;padding:4px 0">Incident ID</td><td style="font-size:12px">${incidentId}</td></tr>
      <tr><td style="color:#8b949e;padding:4px 0">Detected</td><td>${new Date().toLocaleString()}</td></tr>
    </table>
  </div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
    <thead><tr><th style="text-align:left;padding:8px;color:#8b949e;border-bottom:1px solid #30363d">Threat Type</th><th style="text-align:left;padding:8px;color:#8b949e;border-bottom:1px solid #30363d">Details</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="text-align:center;margin:24px 0">
    <a href="${process.env.FRONTEND_URL}/incidents/${incidentId}" style="background:linear-gradient(135deg,#3b5bdb,#7b5fff);color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">🔄 View Incident &amp; Restore</a>
  </div>
  <p style="color:#8b949e;font-size:11px;text-align:center">Hostinger Shield Pro — Automated Alert<br><a href="${process.env.FRONTEND_URL}/settings" style="color:#3b5bdb">Manage alert preferences</a></p>
</div></body></html>`;
}

function sslWhatsApp({ domain, daysLeft, expiry }) {
  const icon = daysLeft <= 0 ? '🔴 EXPIRED' : daysLeft <= 3 ? '🔴 CRITICAL' : daysLeft <= 7 ? '🟠 URGENT' : '🟡 WARNING';
  return `${icon} *SSL Certificate Alert — Shield Pro*\n\n🌐 Domain: ${domain}\n🔒 Status: ${daysLeft <= 0 ? 'EXPIRED' : `Expires in ${daysLeft} days`}\n📅 Expiry: ${new Date(expiry).toLocaleDateString()}\n\nRenew SSL immediately:\n🔗 ${process.env.FRONTEND_URL}/ssl-monitor\n\n— Hostinger Shield Pro`;
}

function sslEmail({ domain, daysLeft, expiry }) {
  const color = daysLeft <= 7 ? '#ef4444' : '#f59e0b';
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#0d1117;color:#e6edf3;margin:0;padding:0">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:linear-gradient(135deg,#3b5bdb,#7b5fff);padding:20px;border-radius:10px;text-align:center;margin-bottom:20px">
    <h1 style="color:#fff;margin:0;font-size:20px">🔒 SSL Certificate Alert</h1>
  </div>
  <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:20px;margin-bottom:20px">
    <h2 style="color:${color};margin:0 0 12px">${daysLeft <= 0 ? '❌ SSL Expired' : `⚠️ SSL Expiring in ${daysLeft} days`}: ${domain}</h2>
    <table style="width:100%">
      <tr><td style="color:#8b949e;padding:4px 0">Domain</td><td>${domain}</td></tr>
      <tr><td style="color:#8b949e;padding:4px 0">Status</td><td style="color:${color};font-weight:700">${daysLeft <= 0 ? 'EXPIRED' : `${daysLeft} days remaining`}</td></tr>
      <tr><td style="color:#8b949e;padding:4px 0">Expiry Date</td><td>${new Date(expiry).toLocaleDateString()}</td></tr>
    </table>
  </div>
  <div style="text-align:center">
    <a href="${process.env.FRONTEND_URL}/ssl-monitor" style="background:linear-gradient(135deg,#3b5bdb,#7b5fff);color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">View SSL Monitor</a>
  </div>
  <p style="color:#8b949e;font-size:11px;text-align:center;margin-top:20px">Hostinger Shield Pro — Automated Alert</p>
</div></body></html>`;
}

function downWhatsApp({ domain, httpStatus, responseTime }) {
  return `🔴 *Website Down — Shield Pro*\n\n🌐 Domain: ${domain}\n❌ Status: ${httpStatus || 'No response'}\n⏱️ Response: ${responseTime ? `${responseTime}ms` : 'Timed out'}\n🕐 ${new Date().toLocaleString()}\n\n🔗 ${process.env.FRONTEND_URL}\n\n— Hostinger Shield Pro`;
}

function downEmail({ domain, httpStatus, responseTime }) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#0d1117;color:#e6edf3;margin:0;padding:0">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:linear-gradient(135deg,#ef4444,#b91c1c);padding:20px;border-radius:10px;text-align:center;margin-bottom:20px">
    <h1 style="color:#fff;margin:0;font-size:20px">🔴 Website Down Alert</h1>
  </div>
  <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:20px">
    <h2 style="color:#ef4444;margin:0 0 12px">${domain} is unreachable</h2>
    <table style="width:100%">
      <tr><td style="color:#8b949e;padding:4px 0">HTTP Status</td><td style="color:#ef4444;font-weight:700">${httpStatus || 'No response'}</td></tr>
      <tr><td style="color:#8b949e;padding:4px 0">Response Time</td><td>${responseTime ? `${responseTime}ms` : 'Timed out'}</td></tr>
      <tr><td style="color:#8b949e;padding:4px 0">Detected</td><td>${new Date().toLocaleString()}</td></tr>
    </table>
  </div>
  <p style="color:#8b949e;font-size:11px;text-align:center;margin-top:20px">Hostinger Shield Pro — Automated Alert</p>
</div></body></html>`;
}

// ─── ALERT DISPATCHERS ────────────────────────────────────────────────────────
async function sendHackAlert({ website, incident, threats, threatScore }) {
  const user = await User.findById(website.user);
  if (!user) return;

  const primaryThreat = [...threats].sort((a, b) => b.score - a.score)[0];
  const params = { domain: website.domain, threatScore, primaryThreat: primaryThreat.threatType, incidentId: incident._id, threats };
  const channels = {};

  // WhatsApp
  if (user.alertPreferences?.whatsapp && user.alertPreferences?.phoneNumber) {
    try {
      await sendWhatsApp(user.alertPreferences.phoneNumber, hackWhatsApp(params));
      channels.whatsapp = { sent: true, sentAt: new Date() };
    } catch (e) { channels.whatsapp = { sent: false, error: e.message }; }
  }

  // Email
  if (user.alertPreferences?.email !== false) {
    const to = user.alertPreferences?.alertEmail || user.email;
    try {
      await sendEmail(to, `🚨 HACKED: ${website.domain} — Shield Pro Alert`, hackEmail(params));
      channels.email = { sent: true, sentAt: new Date() };
    } catch (e) { channels.email = { sent: false, error: e.message }; }
  }

  channels.inApp = { sent: true };
  await Notification.create({
    user: user._id, website: website._id,
    type: 'threat',
    title: `Website Hacked: ${website.domain}`,
    message: `${threats.length} threat(s) detected. Score: ${threatScore}/100`,
    severity: 'critical',
    actionUrl: `/incidents/${incident._id}`,
    channels,
    isRead: false,
  });
}

async function sendSSLAlert({ website, daysLeft, expiry }) {
  const user = await User.findById(website.user);
  if (!user) return;

  const channels = {};
  const params   = { domain: website.domain, daysLeft, expiry };

  if (user.alertPreferences?.whatsapp && user.alertPreferences?.phoneNumber) {
    try {
      await sendWhatsApp(user.alertPreferences.phoneNumber, sslWhatsApp(params));
      channels.whatsapp = { sent: true, sentAt: new Date() };
    } catch (e) { channels.whatsapp = { sent: false, error: e.message }; }
  }

  if (user.alertPreferences?.email !== false) {
    const to = user.alertPreferences?.alertEmail || user.email;
    try {
      await sendEmail(to, `🔒 SSL ${daysLeft <= 0 ? 'Expired' : `Expiring in ${daysLeft}d`}: ${website.domain}`, sslEmail(params));
      channels.email = { sent: true, sentAt: new Date() };
    } catch (e) { channels.email = { sent: false, error: e.message }; }
  }

  channels.inApp = { sent: true };
  await Notification.create({
    user: user._id, website: website._id,
    type: 'ssl',
    title: `SSL ${daysLeft <= 0 ? 'Expired' : `Expiring (${daysLeft}d)`}: ${website.domain}`,
    message: `Certificate ${daysLeft <= 0 ? 'has expired' : `expires in ${daysLeft} days on ${new Date(expiry).toLocaleDateString()}`}`,
    severity: daysLeft <= 3 ? 'critical' : daysLeft <= 7 ? 'high' : 'medium',
    channels, isRead: false,
  });
}

async function sendDownAlert({ website, httpStatus, responseTime }) {
  const user = await User.findById(website.user);
  if (!user) return;

  const channels = {};
  const params   = { domain: website.domain, httpStatus, responseTime };

  if (user.alertPreferences?.whatsapp && user.alertPreferences?.phoneNumber) {
    try {
      await sendWhatsApp(user.alertPreferences.phoneNumber, downWhatsApp(params));
      channels.whatsapp = { sent: true, sentAt: new Date() };
    } catch (e) { channels.whatsapp = { sent: false, error: e.message }; }
  }

  if (user.alertPreferences?.email !== false) {
    const to = user.alertPreferences?.alertEmail || user.email;
    try {
      await sendEmail(to, `🔴 Site Down: ${website.domain}`, downEmail(params));
      channels.email = { sent: true, sentAt: new Date() };
    } catch (e) { channels.email = { sent: false, error: e.message }; }
  }

  channels.inApp = { sent: true };
  await Notification.create({
    user: user._id, website: website._id,
    type: 'down',
    title: `Website Down: ${website.domain}`,
    message: `HTTP ${httpStatus || 'timeout'} — site unreachable`,
    severity: 'high',
    channels, isRead: false,
  });
}

module.exports = { sendHackAlert, sendSSLAlert, sendDownAlert, sendWhatsApp, sendEmail, createNotification };