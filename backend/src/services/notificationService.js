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

// Clean phone number to digits only (WAAPI requires 919999999999@c.us without '+' or spaces)
const cleanPhone = (p) => String(p || '').replace(/\D/g, '');

// ─── WHATSAPP ─────────────────────────────────────────────────────────────────
async function sendWhatsApp(phoneNumber, message) {
  const digits = cleanPhone(phoneNumber);
  if (!digits) throw new Error('Invalid phone number');
  try {
    const res = await axios.post(
      `${process.env.WAAPI_URL}/api/sendText`,
      { chatId: `${digits}@c.us`, text: message },
      { headers: { Authorization: `Bearer ${process.env.WAAPI_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    if (typeof res.data === 'string' && res.data.toLowerCase().includes('error')) throw new Error(res.data);
    if (res.data?.success === false) throw new Error(res.data.message || 'WA failed');
    logger.info(`WhatsApp sent to ${digits}`);
    return true;
  } catch (err) {
    logger.error(`WhatsApp error: ${err.message}`);
    throw err;
  }
}

// ─── TELEGRAM ─────────────────────────────────────────────────────────────────
async function sendTelegram(chatId, message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const target = chatId || process.env.TELEGRAM_CHAT_ID;
  if (!token || !target) throw new Error('Telegram bot token or chat ID not configured');
  try {
    await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      { chat_id: target, text: message, parse_mode: 'HTML', disable_web_page_preview: true },
      { timeout: 10000 }
    );
    logger.info(`Telegram sent to ${target}`);
    return true;
  } catch (err) {
    logger.error(`Telegram error: ${err.message}`);
    throw err;
  }
}

// ─── WEBHOOK (SLACK / DISCORD / CUSTOM) ───────────────────────────────────────
async function sendWebhook(webhookUrl, { title, message, severity = 'high', domain }) {
  const url = webhookUrl || process.env.ALERT_WEBHOOK_URL;
  if (!url) throw new Error('Webhook URL not configured');

  const colorMap = { critical: 0xef4444, high: 0xf97316, medium: 0xeab308, low: 0x10b981 };
  const hexMap   = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#10b981' };

  const isDiscord = /discord(app)?\.com\/api\/webhooks/i.test(url);
  const isSlack   = /hooks\.slack\.com/i.test(url);

  let payload;
  if (isDiscord) {
    payload = {
      username: 'Shield Pro Monitor',
      embeds: [{
        title,
        description: message,
        color: colorMap[severity] || 0x6366f1,
        fields: domain ? [{ name: 'Domain', value: domain, inline: true }, { name: 'Severity', value: severity.toUpperCase(), inline: true }] : [],
        timestamp: new Date().toISOString(),
        footer: { text: 'Hostinger Shield Pro' },
      }],
    };
  } else if (isSlack) {
    payload = {
      attachments: [{
        color: hexMap[severity] || '#6366f1',
        title,
        text: message,
        footer: 'Hostinger Shield Pro',
        ts: Math.floor(Date.now() / 1000),
      }],
    };
  } else {
    payload = { title, message, severity, domain, timestamp: new Date().toISOString(), source: 'hostinger-shield-pro' };
  }

  try {
    await axios.post(url, payload, { timeout: 10000 });
    logger.info(`Webhook alert sent (${isDiscord ? 'Discord' : isSlack ? 'Slack' : 'Custom'})`);
    return true;
  } catch (err) {
    logger.error(`Webhook error: ${err.message}`);
    throw err;
  }
}

// ─── EMAIL ────────────────────────────────────────────────────────────────────
async function sendEmail(to, subject, html) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"Hostinger Shield Pro" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
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
async function createNotification({ user, website, type, title, message, severity = 'medium', actionUrl, channels }) {
  try {
    if (!user) return;
    const notif = await Notification.create({
      user,
      website: website || undefined,
      type,
      title,
      message,
      severity,
      actionUrl: actionUrl || undefined,
      isRead: false,
      channels: channels || { inApp: { sent: true } },
    });
    global.__io?.to(`user:${user}`).emit('notification:new', {
      _id: notif._id, type, title, message, severity,
    });
    return notif;
  } catch (err) {
    logger.error(`createNotification error: ${err.message}`);
  }
}

// ─── TEMPLATES ────────────────────────────────────────────────────────────────
const frontUrl = () => (process.env.FRONTEND_URL || 'http://localhost:3012').replace(/\/$/, '');

function hackWhatsApp({ domain, threatScore, primaryThreat, incidentId, reminder, detail }) {
  const head = reminder ? `🔔 *REMINDER #${reminder} — NOT ACKNOWLEDGED*\n` : '';
  return `${head}🚨 *WEBSITE HACKED — Shield Pro*\n\n🌐 Domain: ${domain}\n⚠️ Score: ${threatScore}/100\n🦠 Threat: ${primaryThreat.replace(/_/g, ' ').toUpperCase()}\n${detail ? `📝 ${String(detail).slice(0, 140)}\n` : ''}🆔 Incident: ${incidentId}\n🕐 ${new Date().toLocaleString()}\n\nOpen Dashboard:\n🔗 ${frontUrl()}/incidents\n\n— Hostinger Shield Pro`;
}

function hackEmail({ domain, threatScore, primaryThreat, incidentId, threats }) {
  const rows = threats.map(t => `<tr><td style="padding:8px;border-bottom:1px solid #21262d;color:#ef4444;font-weight:600">${t.threatType?.replace(/_/g, ' ').toUpperCase()}</td><td style="padding:8px;border-bottom:1px solid #21262d;color:#8b949e">${t.description || ''}</td></tr>`).join('');
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#070b14;color:#e6edf3;margin:0;padding:0">
<div style="max-width:600px;margin:0 auto;padding:24px">
  <div style="background:linear-gradient(135deg,#4f46e5,#06b6d4);padding:20px;border-radius:12px;text-align:center;margin-bottom:20px">
    <h1 style="color:#fff;margin:0;font-size:20px">🛡️ Shield Pro Security Alert</h1>
  </div>
  <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:20px;margin-bottom:16px">
    <h2 style="color:#ef4444;margin:0 0 12px">🚨 Website Hacked: ${domain}</h2>
    <table style="width:100%">
      <tr><td style="color:#8b949e;padding:4px 0">Threat Score</td><td style="color:#ef4444;font-weight:700">${threatScore}/100 — CRITICAL</td></tr>
      <tr><td style="color:#8b949e;padding:4px 0">Primary Threat</td><td>${primaryThreat.replace(/_/g, ' ').toUpperCase()}</td></tr>
      <tr><td style="color:#8b949e;padding:4px 0">Incident ID</td><td style="font-size:12px">${incidentId}</td></tr>
      <tr><td style="color:#8b949e;padding:4px 0">Detected</td><td>${new Date().toLocaleString()}</td></tr>
    </table>
  </div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
    <thead><tr><th style="text-align:left;padding:8px;color:#8b949e;border-bottom:1px solid #30363d">Threat Type</th><th style="text-align:left;padding:8px;color:#8b949e;border-bottom:1px solid #30363d">Details</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="text-align:center;margin:24px 0">
    <a href="${frontUrl()}/incidents" style="background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">🔄 View Incidents &amp; Restore</a>
  </div>
  <p style="color:#8b949e;font-size:11px;text-align:center">Hostinger Shield Pro — Automated Alert<br><a href="${frontUrl()}/settings" style="color:#6366f1">Manage alert preferences</a></p>
</div></body></html>`;
}

function sslWhatsApp({ domain, daysLeft, expiry }) {
  const icon = daysLeft <= 0 ? '🔴 EXPIRED' : daysLeft <= 3 ? '🔴 CRITICAL' : daysLeft <= 7 ? '🟠 URGENT' : '🟡 WARNING';
  return `${icon} *SSL Certificate Alert — Shield Pro*\n\n🌐 Domain: ${domain}\n🔒 Status: ${daysLeft <= 0 ? 'EXPIRED' : `Expires in ${daysLeft} days`}\n📅 Expiry: ${new Date(expiry).toLocaleDateString()}\n\nRenew SSL immediately:\n🔗 ${frontUrl()}/ssl-monitor\n\n— Hostinger Shield Pro`;
}

function sslEmail({ domain, daysLeft, expiry }) {
  const color = daysLeft <= 7 ? '#ef4444' : '#f59e0b';
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#070b14;color:#e6edf3;margin:0;padding:0">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:linear-gradient(135deg,#4f46e5,#06b6d4);padding:20px;border-radius:12px;text-align:center;margin-bottom:20px">
    <h1 style="color:#fff;margin:0;font-size:20px">🔒 SSL Certificate Alert</h1>
  </div>
  <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:20px;margin-bottom:20px">
    <h2 style="color:${color};margin:0 0 12px">${daysLeft <= 0 ? '❌ SSL Expired' : `⚠️ SSL Expiring in ${daysLeft} days`}: ${domain}</h2>
    <table style="width:100%">
      <tr><td style="color:#8b949e;padding:4px 0">Domain</td><td>${domain}</td></tr>
      <tr><td style="color:#8b949e;padding:4px 0">Status</td><td style="color:${color};font-weight:700">${daysLeft <= 0 ? 'EXPIRED' : `${daysLeft} days remaining`}</td></tr>
      <tr><td style="color:#8b949e;padding:4px 0">Expiry Date</td><td>${new Date(expiry).toLocaleDateString()}</td></tr>
    </table>
  </div>
  <div style="text-align:center">
    <a href="${frontUrl()}/ssl-monitor" style="background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">View SSL Monitor</a>
  </div>
  <p style="color:#8b949e;font-size:11px;text-align:center;margin-top:20px">Hostinger Shield Pro — Automated Alert</p>
</div></body></html>`;
}

function downWhatsApp({ domain, httpStatus, responseTime, error }) {
  return `🔴 *Website Down — Shield Pro*\n\n🌐 Domain: ${domain}\n❌ Status: ${httpStatus || 'Unreachable'}\n${error ? `⚠️ Error: ${String(error).slice(0, 120)}\n` : ''}⏱️ Response: ${responseTime ? `${responseTime}ms` : 'Timed out'}\n🕐 ${new Date().toLocaleString()}\n\n🔗 ${frontUrl()}/websites\n\n— Hostinger Shield Pro`;
}

function downEmail({ domain, httpStatus, responseTime, error }) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#070b14;color:#e6edf3;margin:0;padding:0">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:linear-gradient(135deg,#ef4444,#b91c1c);padding:20px;border-radius:12px;text-align:center;margin-bottom:20px">
    <h1 style="color:#fff;margin:0;font-size:20px">🔴 Website Down Alert</h1>
  </div>
  <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:20px">
    <h2 style="color:#ef4444;margin:0 0 12px">${domain} is unreachable</h2>
    <table style="width:100%">
      <tr><td style="color:#8b949e;padding:4px 0">HTTP Status</td><td style="color:#ef4444;font-weight:700">${httpStatus || 'No response'}</td></tr>
      ${error ? `<tr><td style="color:#8b949e;padding:4px 0">Error</td><td style="color:#fca5a5">${error}</td></tr>` : ''}
      <tr><td style="color:#8b949e;padding:4px 0">Response Time</td><td>${responseTime ? `${responseTime}ms` : 'Timed out'}</td></tr>
      <tr><td style="color:#8b949e;padding:4px 0">Detected</td><td>${new Date().toLocaleString()}</td></tr>
    </table>
  </div>
  <p style="color:#8b949e;font-size:11px;text-align:center;margin-top:20px">Hostinger Shield Pro — Automated Alert</p>
</div></body></html>`;
}

// Helper: dispatch Telegram + Webhook if user enabled them
async function dispatchInstantChannels(prefs, { title, message, severity, domain }, channels) {
  if (prefs.telegram && (prefs.telegramChatId || process.env.TELEGRAM_CHAT_ID)) {
    try {
      await sendTelegram(prefs.telegramChatId, `<b>${title}</b>\n\n${message}`);
      channels.telegram = { sent: true, sentAt: new Date() };
    } catch (e) { channels.telegram = { sent: false, error: e.message }; }
  }
  if (prefs.webhook && (prefs.webhookUrl || process.env.ALERT_WEBHOOK_URL)) {
    try {
      await sendWebhook(prefs.webhookUrl, { title, message, severity, domain });
      channels.webhook = { sent: true, sentAt: new Date() };
    } catch (e) { channels.webhook = { sent: false, error: e.message }; }
  }
}

// ─── ALERT DISPATCHERS ────────────────────────────────────────────────────────
async function sendHackAlert({ website, incident, threats, threatScore, reminder = 0, escalate = false }) {
  const user = await User.findById(website.user);
  if (!user) return;

  const primaryThreat = [...threats].sort((a, b) => b.score - a.score)[0];
  const params = {
    domain: website.domain, threatScore, primaryThreat: primaryThreat.threatType,
    incidentId: incident._id, threats, reminder, detail: primaryThreat.description,
  };
  const prefs = user.alertPreferences || {};
  const channels = {};
  const tag = reminder ? `🔔 REMINDER #${reminder} — ` : '';

  // Recipients: main contact + site-specific contact; escalation from 2nd reminder
  const phones = [prefs.phoneNumber, website.alertPhone];
  const emails = [prefs.alertEmail || user.email, website.alertEmail];
  if (escalate) { phones.push(prefs.escalationPhone); emails.push(prefs.escalationEmail); }

  if (prefs.whatsapp) {
    for (const ph of [...new Set(phones.filter(Boolean))]) {
      try {
        await sendWhatsApp(ph, hackWhatsApp(params));
        channels.whatsapp = { sent: true, sentAt: new Date() };
      } catch (e) { channels.whatsapp = { sent: false, error: e.message }; }
    }
  }

  if (prefs.email !== false) {
    for (const to of [...new Set(emails.filter(Boolean))]) {
      try {
        await sendEmail(to, `${tag}🚨 HACKED: ${website.domain} — Shield Pro Alert`, hackEmail(params));
        channels.email = { sent: true, sentAt: new Date() };
      } catch (e) { channels.email = { sent: false, error: e.message }; }
    }
  }

  await dispatchInstantChannels(prefs, {
    title: `${tag}🚨 HACKED: ${website.domain}`,
    message: `Threat: ${primaryThreat.threatType.replace(/_/g, ' ').toUpperCase()} (Score ${threatScore}/100)\n${primaryThreat.description || ''}\n${frontUrl()}/incidents`,
    severity: 'critical',
    domain: website.domain,
  }, channels);

  if (!reminder) {
    channels.inApp = { sent: true };
    await createNotification({
      user: user._id, website: website._id, type: 'threat',
      title: `Website Hacked: ${website.domain}`,
      message: `${threats.length} threat(s) detected. Score: ${threatScore}/100`,
      severity: 'critical', actionUrl: '/incidents', channels,
    });
  }
}

async function sendGenericAlert({ website, type = 'warning', severity = 'high', title, message }) {
  const user = await User.findById(website.user);
  if (!user) return;
  const prefs = user.alertPreferences || {};
  const channels = { inApp: { sent: true } };

  const phones = [...new Set([prefs.phoneNumber, website.alertPhone].filter(Boolean))];
  const emails = [...new Set([prefs.alertEmail || user.email, website.alertEmail].filter(Boolean))];

  if (prefs.whatsapp) {
    for (const ph of phones) {
      try {
        await sendWhatsApp(ph, `⚠️ *${title}*\n\n${message}\n🕐 ${new Date().toLocaleString()}\n\n— Hostinger Shield Pro`);
        channels.whatsapp = { sent: true, sentAt: new Date() };
      } catch (e) { channels.whatsapp = { sent: false, error: e.message }; }
    }
  }
  if (prefs.email !== false) {
    for (const to of emails) {
      try {
        await sendEmail(to, `⚠️ ${title}`, `<div style="font-family:Arial;padding:20px;background:#070b14;color:#e6edf3;border-radius:10px"><h2 style="color:#6366f1">${title}</h2><p>${message}</p><p style="color:#8b949e;font-size:12px">${new Date().toLocaleString()} — Hostinger Shield Pro</p></div>`);
        channels.email = { sent: true, sentAt: new Date() };
      } catch (e) { channels.email = { sent: false, error: e.message }; }
    }
  }
  await dispatchInstantChannels(prefs, { title, message, severity, domain: website.domain }, channels);

  await createNotification({ user: user._id, website: website._id, type, title, message, severity, channels });
}

async function sendSSLAlert({ website, daysLeft, expiry }) {
  const user = await User.findById(website.user);
  if (!user) return;

  const prefs = user.alertPreferences || {};
  const channels = {};
  const params = { domain: website.domain, daysLeft, expiry };

  if (prefs.whatsapp && (prefs.phoneNumber || website.alertPhone)) {
    try {
      await sendWhatsApp(prefs.phoneNumber || website.alertPhone, sslWhatsApp(params));
      channels.whatsapp = { sent: true, sentAt: new Date() };
    } catch (e) { channels.whatsapp = { sent: false, error: e.message }; }
  }

  if (prefs.email !== false) {
    const to = website.alertEmail || prefs.alertEmail || user.email;
    try {
      await sendEmail(to, `🔒 SSL ${daysLeft <= 0 ? 'Expired' : `Expiring in ${daysLeft}d`}: ${website.domain}`, sslEmail(params));
      channels.email = { sent: true, sentAt: new Date() };
    } catch (e) { channels.email = { sent: false, error: e.message }; }
  }

  const severity = daysLeft <= 3 ? 'critical' : daysLeft <= 7 ? 'high' : 'medium';
  await dispatchInstantChannels(prefs, {
    title: `🔒 SSL ${daysLeft <= 0 ? 'Expired' : `Expiring (${daysLeft}d)`}: ${website.domain}`,
    message: `Certificate ${daysLeft <= 0 ? 'has expired' : `expires in ${daysLeft} days (${new Date(expiry).toLocaleDateString()})`}`,
    severity,
    domain: website.domain,
  }, channels);

  channels.inApp = { sent: true };
  await createNotification({
    user: user._id, website: website._id,
    type: 'ssl',
    title: `SSL ${daysLeft <= 0 ? 'Expired' : `Expiring (${daysLeft}d)`}: ${website.domain}`,
    message: `Certificate ${daysLeft <= 0 ? 'has expired' : `expires in ${daysLeft} days on ${new Date(expiry).toLocaleDateString()}`}`,
    severity, actionUrl: '/ssl-monitor', channels,
  });
}

async function sendDownAlert({ website, httpStatus, responseTime, error }) {
  const user = await User.findById(website.user);
  if (!user) return;

  const prefs = user.alertPreferences || {};
  const channels = {};
  const params = { domain: website.domain, httpStatus, responseTime, error };

  const phones = [...new Set([prefs.phoneNumber, website.alertPhone].filter(Boolean))];
  const emails = [...new Set([prefs.alertEmail || user.email, website.alertEmail].filter(Boolean))];

  if (prefs.whatsapp) {
    for (const ph of phones) {
      try {
        await sendWhatsApp(ph, downWhatsApp(params));
        channels.whatsapp = { sent: true, sentAt: new Date() };
      } catch (e) { channels.whatsapp = { sent: false, error: e.message }; }
    }
  }

  if (prefs.email !== false) {
    for (const to of emails) {
      try {
        await sendEmail(to, `🔴 Site Down: ${website.domain}`, downEmail(params));
        channels.email = { sent: true, sentAt: new Date() };
      } catch (e) { channels.email = { sent: false, error: e.message }; }
    }
  }

  await dispatchInstantChannels(prefs, {
    title: `🔴 Site Down: ${website.domain}`,
    message: `Status: ${httpStatus || 'Unreachable'}${error ? ` — ${error}` : ''} (${responseTime ? `${responseTime}ms` : 'timeout'})`,
    severity: 'critical',
    domain: website.domain,
  }, channels);

  channels.inApp = { sent: true };
  await createNotification({
    user: user._id, website: website._id,
    type: 'down',
    title: `Website Down: ${website.domain}`,
    message: `${httpStatus ? `HTTP ${httpStatus}` : 'Unreachable'}${error ? ` — ${String(error).slice(0, 120)}` : ''}`,
    severity: 'critical', actionUrl: `/websites/${website._id}`, channels,
  });
}

module.exports = {
  sendHackAlert, sendGenericAlert, sendSSLAlert, sendDownAlert,
  sendWhatsApp, sendEmail, sendTelegram, sendWebhook, createNotification,
};
