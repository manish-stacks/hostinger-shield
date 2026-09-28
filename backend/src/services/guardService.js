const axios = require('axios');
const cheerio = require('cheerio');
const dns = require('dns').promises;
const { Website } = require('../models');
const logger = require('../utils/logger');
const {
  COVERAGE, UA_BROWSER, UA_GOOGLEBOT, UA_MOBILE,
  fetchPage, analyzeContent, hostOf, sameSite, stripWww,
} = require('./contentAnalyzer');

const http = (url, opts = {}) => axios.get(url, {
  timeout: 8000, maxRedirects: 3, validateStatus: (s) => s < 600,
  headers: { 'User-Agent': UA_BROWSER }, responseType: 'text', transformResponse: (d) => d,
  maxContentLength: 2 * 1024 * 1024, ...opts,
});
const isHtml = (r) => /html/i.test(r.headers?.['content-type'] || '') || /^\s*<(!doctype|html)/i.test(String(r.data || '').slice(0, 200));

// ─── 1. Vulnerability probes (soft-404 safe) ────────────────────────────────
async function scanVulnerabilities(domain) {
  const threats = [];

  try {
    const r = await http(`https://${domain}/.env`, { timeout: 5000 });
    if (r.status === 200 && !isHtml(r) && /^[A-Z][A-Z0-9_]{2,}\s*=/m.test(String(r.data))) {
      threats.push({ type: 'exposed_env', severity: 'critical', score: 95, description: '.env file is publicly accessible — credentials may be exposed', evidence: {} });
    }
  } catch {}

  for (const dir of ['/uploads', '/backup', '/tmp', '/logs']) {
    try {
      const r = await http(`https://${domain}${dir}/`, { timeout: 4000 });
      if (r.status === 200 && /<title>\s*index of/i.test(String(r.data))) {
        threats.push({ type: 'directory_listing', severity: 'high', score: 65, description: `Directory listing enabled at ${dir}`, evidence: { path: dir } });
        break;
      }
    } catch {}
  }

  try {
    const r = await http(`https://${domain}/wp-content/debug.log`, { timeout: 4000 });
    if (r.status === 200 && !isHtml(r) && /PHP (Notice|Warning|Fatal|Deprecated)/i.test(String(r.data).slice(0, 5000))) {
      threats.push({ type: 'debug_mode', severity: 'high', score: 60, description: 'WordPress debug.log is publicly accessible', evidence: {} });
    }
  } catch {}

  return threats;
}

// ─── 2. Cloaking: spam shown only to Google / mobile-from-Google visitors ───
async function cloakingScan(website) {
  const variants = [
    { name: 'browser',   opts: { ua: UA_BROWSER } },
    { name: 'googlebot', opts: { ua: UA_GOOGLEBOT } },
    { name: 'google-mobile', opts: { ua: UA_MOBILE, referer: 'https://www.google.com/' } },
  ];
  const seen = {};
  for (const v of variants) {
    try {
      const page = await fetchPage(website.domain, { ...v.opts, timeout: 12000 });
      if (page.status >= 400) continue;
      const { threats } = analyzeContent(page.html, { ...website, isBaselinesSet: false, expectedKeywords: [] }, page.finalUrl);
      seen[v.name] = { types: new Set(threats.filter((t) => t.score >= 60).map((t) => t.type)), host: hostOf(page.finalUrl), threats };
    } catch {}
  }
  const base = seen.browser;
  if (!base) return [];

  const out = [];
  for (const name of ['googlebot', 'google-mobile']) {
    const v = seen[name];
    if (!v) continue;
    const extra = [...v.types].filter((t) => !base.types.has(t));
    const redirected = !sameSite(v.host, base.host);
    if (extra.length || redirected) {
      out.push({
        type: 'cloaking', severity: 'critical', score: 92,
        description: `Hidden content served only to ${name} visitors${extra.length ? ': ' + extra.join(', ') : ' (different redirect target)'}`,
        evidence: { variant: name, extraThreats: extra, redirectHost: redirected ? v.host : null },
      });
      break;
    }
  }
  return out;
}

// ─── 3. WordPress checks (new users / plugins / spam sitemap) ───────────────
async function wpChecks(website) {
  const threats = [];
  const d = website.domain;
  const prev = website.wpBaseline || null;
  const next = { users: prev?.users || [], plugins: prev?.plugins || [], sitemapCount: prev?.sitemapCount || 0, at: new Date() };
  let isWp = !!prev?.isWp;

  // Users (public REST enumeration — many sites expose it)
  try {
    const r = await http(`https://${d}/wp-json/wp/v2/users?per_page=100`, { timeout: 6000 });
    if (r.status === 200) {
      const list = JSON.parse(String(r.data));
      if (Array.isArray(list)) {
        isWp = true;
        const slugs = list.map((u) => u.slug).filter(Boolean).sort();
        if (prev?.users?.length) {
          const added = slugs.filter((s) => !prev.users.includes(s));
          if (added.length) threats.push({ type: 'wp_new_user', severity: 'high', score: 68, description: `New WordPress user(s) appeared: ${added.join(', ')}`, evidence: { added } });
        }
        next.users = slugs;
      }
    }
  } catch {}

  // Plugins detected from homepage HTML
  try {
    const page = await fetchPage(d, { timeout: 12000 });
    const found = [...new Set([...page.html.matchAll(/\/wp-content\/plugins\/([a-z0-9._-]+)\//gi)].map((m) => m[1].toLowerCase()))].sort();
    if (found.length || /wp-content|wp-includes/i.test(page.html)) isWp = true;
    if (prev?.plugins?.length) {
      const added = found.filter((p) => !prev.plugins.includes(p));
      if (added.length) threats.push({ type: 'wp_new_plugin', severity: 'medium', score: 45, description: `New plugin(s) detected: ${added.join(', ')}`, evidence: { added } });
    }
    next.plugins = [...new Set([...(prev?.plugins || []), ...found])].sort();
  } catch {}

  // Sitemap spam
  for (const path of ['/wp-sitemap.xml', '/sitemap_index.xml', '/sitemap.xml']) {
    try {
      const r = await http(`https://${d}${path}`, { timeout: 6000 });
      if (r.status !== 200 || !/<(urlset|sitemapindex)/i.test(String(r.data))) continue;
      const $ = cheerio.load(String(r.data), { xmlMode: true });
      let urls = $('url > loc').map((_, e) => $(e).text()).get();
      const subs = $('sitemap > loc').map((_, e) => $(e).text()).get().slice(0, 5);
      for (const sm of subs) {
        try {
          const s = await http(sm, { timeout: 6000 });
          const $$ = cheerio.load(String(s.data), { xmlMode: true });
          urls = urls.concat($$('url > loc').map((_, e) => $$(e).text()).get());
        } catch {}
      }
      const spam = urls.filter((u) => /(casino|\bslot|judi|togel|poker|viagra|cialis|porn|joker123|1xbet|sbobet|gacor|maxwin)/i.test(u));
      const jumped = next.sitemapCount > 0 && urls.length > next.sitemapCount * 2 && urls.length - next.sitemapCount > 100;
      if (spam.length >= 3 || jumped) {
        threats.push({
          type: 'spam_sitemap', severity: 'critical', score: 86,
          description: spam.length >= 3 ? `${spam.length} spam URLs in ${path}` : `Sitemap grew from ${next.sitemapCount} to ${urls.length} URLs`,
          evidence: { sitemap: path, spamSamples: spam.slice(0, 5), count: urls.length },
        });
      }
      next.sitemapCount = spam.length >= 3 || jumped ? next.sitemapCount : urls.length;
      break;
    } catch {}
  }

  if (isWp) {
    next.isWp = true;
    await Website.findByIdAndUpdate(website._id, { wpBaseline: next }).catch(() => {});
  }
  return threats;
}

// ─── 4. Blacklists ──────────────────────────────────────────────────────────
// Spamhaus DBL over DNS (127.255.x.x = resolver blocked, ignore)
async function spamhausCheck(domain) {
  try {
    const ips = await dns.resolve4(`${stripWww(domain)}.dbl.spamhaus.org`);
    if (ips.some((ip) => ip.startsWith('127.0.1.') || ip.startsWith('127.0.0.'))) {
      return [{ type: 'blacklisted', severity: 'critical', score: 90, description: 'Domain is listed on Spamhaus DBL', evidence: { list: 'spamhaus', ips } }];
    }
  } catch {}
  return [];
}

// Google Safe Browsing — one API call per 500 sites. Needs GOOGLE_SAFE_BROWSING_KEY
async function safeBrowsingBatch(websites) {
  const key = process.env.GOOGLE_SAFE_BROWSING_KEY;
  const result = new Map(); // websiteId → threats[]
  if (!key || !websites.length) return result;
  for (let i = 0; i < websites.length; i += 500) {
    const chunk = websites.slice(i, i + 500);
    try {
      const { data } = await axios.post(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${key}`, {
        client: { clientId: 'shield-pro', clientVersion: '1.0' },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
          platformTypes: ['ANY_PLATFORM'], threatEntryTypes: ['URL'],
          threatEntries: chunk.flatMap((w) => [{ url: `https://${w.domain}/` }, { url: `http://${w.domain}/` }]),
        },
      }, { timeout: 20000 });
      for (const m of data?.matches || []) {
        const host = stripWww(new URL(m.threat.url).hostname);
        const site = chunk.find((w) => stripWww(w.domain) === host);
        if (!site) continue;
        const list = result.get(String(site._id)) || [];
        if (!list.length) list.push({ type: 'blacklisted', severity: 'critical', score: 95, description: `Flagged by Google Safe Browsing: ${m.threatType}`, evidence: { list: 'google_safe_browsing', threatType: m.threatType } });
        result.set(String(site._id), list);
      }
    } catch (err) {
      logger.error(`[SafeBrowsing] ${err.message}`);
    }
  }
  return result;
}

module.exports = { scanVulnerabilities, cloakingScan, wpChecks, spamhausCheck, safeBrowsingBatch, COVERAGE };
