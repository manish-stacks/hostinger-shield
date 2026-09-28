const axios = require('axios');
const cheerio = require('cheerio');

// ─── THREAT PATTERNS ─────────────────────────────────────────────────────────
const THREAT_PATTERNS = {
  casino_spam: {
    keywords: [
      'casino', 'slots', 'jackpot', 'poker', 'blackjack', 'roulette',
      'bet365', 'betway', 'sportsbet', 'gambling', 'free spins',
      'win big', 'live casino', 'sbobet', '1xbet', 'w88', '188bet'
    ],
    titlePatterns: [
      /casino/i,
      /\bslots?\b/i,
      /gambling/i,
      /poker/i,
      /jackpot/i,
      /\bbets?\b|\bbetting\b/i,
      /roulette/i,
      /blackjack/i,
      /sportsbet/i,
      /bet365/i,
      /betway/i,
      /live casino/i,
      /sbobet/i,
      /1xbet/i
    ],
    score: 85,
    severity: 'critical',
  },

  gambling_spam: {
    keywords: [
      'slot gacor',
      'judi online',
      'situs slot',
      'rtp slot',
      'pragmatic play',
      'maxwin',
      'deposit pulsa',
      'link alternatif',
      'agen judi',
      'bandar togel',
      'joker123'
    ],
    titlePatterns: [
      /slot gacor/i,
      /judi online/i,
      /maxwin/i,
      /togel/i,
      /joker123/i
    ],
    score: 85,
    severity: 'critical',
  },

  pharma_spam: {
    keywords: [
      'viagra',
      'cialis',
      'levitra',
      'buy pills',
      'cheap meds',
      'online pharmacy',
      'prescription drugs',
      'erectile dysfunction',
      'sildenafil'
    ],
    titlePatterns: [
      /online pharmacy/i,
      /buy pills|cheap pills/i,
      /cheap medication/i,
      /\bcheap drugs?\b/i,
      /viagra/i,
      /cialis/i
    ],
    score: 75,
    severity: 'high',
  },

  japanese_seo_spam: {
    keywords: [
      'ブランドコピー',
      'スーパーコピー',
      '激安通販',
      'ロレックスコピー',
      'コピー時計',
      '高級時計'
    ],
    titlePatterns: [
      /ブランドコピー/i,
      /スーパーコピー/i,
      /コピー時計/i,
      /ロレックスコピー/i
    ],
    score: 70,
    severity: 'high',
  },

  chinese_seo_spam: {
    keywords: [
      '仿牌',
      '高仿',
      '精仿',
      '代购',
      '淘宝',
      '天猫',
      '高仿手表',
      '名牌包',
      '奢侈品',
      '复刻表',
      '微信购买'
    ],
    titlePatterns: [
      /仿牌/u,
      /高仿/u,
      /代购/u,
      /复刻表/u
    ],
    score: 70,
    severity: 'high',
  },

  korean_spam: {
    keywords: [
      '카지노',
      '슬롯',
      '바카라',
      '먹튀',
      '토토사이트'
    ],
    titlePatterns: [
      /카지노/i,
      /바카라/i,
      /토토사이트/i
    ],
    score: 80,
    severity: 'critical',
  },

  crypto_scam: {
    keywords: [
      'crypto investment',
      'bitcoin doubler',
      'ethereum giveaway',
      'nft airdrop',
      'defi yield',
      'rug pull',
      'pump and dump',
      'usdt giveaway',
      'free bitcoin',
      'crypto bonus',
      'earn usdt',
      'double your bitcoin',
      'guaranteed profit',
      'trading signal vip',
      'binance giveaway'
    ],
    titlePatterns: [
      /crypto (investment|bonus|giveaway)/i,
      /free bitcoin|bitcoin (doubler|giveaway)/i,
      /nft airdrop|crypto airdrop/i,
      /usdt giveaway|earn usdt/i,
      /free bitcoin/i,
      /binance giveaway/i
    ],
    score: 78,
    severity: 'critical',
  },

  adult_content: {
    keywords: [
      'xxx',
      'porn',
      'nude',
      'escort',
      'cam girls',
      'onlyfans',
      'live sex',
      'adult video',
      'camgirl',
      'dating hookup',
      'hentai'
    ],
    titlePatterns: [
      /xxx/i,
      /porn/i,
      /\badult (video|content|dating)/i,
      /\bnude\b/i,
      /onlyfans/i,
      /\bescort (service|girls?)\b/i
    ],
    score: 85,
    severity: 'critical',
  },

  seo_spam: {
    keywords: [
      'cheap flights',
      'payday loan',
      'loan approval',
      'insurance quote',
      'weight loss pills',
      'essay writing service',
      'buy backlinks'
    ],
    titlePatterns: [
      /payday loan|loan approval/i,
      /insurance quote/i,
      /cheap flights/i,
      /essay writing/i,
      /weight loss pills/i
    ],
    score: 75,
    severity: 'high',
  },
};

const SUSPICIOUS_REDIRECT_PATTERNS = [
  /casino/i, /gambling/i, /porn/i, /pharma/i, /\bslots?\b/i, /bet\d/i, /\d{2,}\.xyz$/i,
];

const SUSPICIOUS_META_KEYWORDS = [
  'casino',
  'gambling',
  'slots',
  'poker',
  'viagra',
  'cialis',
  'porn',
  'xxx',
  'joker123',
  'slot gacor',
  'maxwin',
  'pragmatic play',
  'rtp live',
  'judi online',
  'agen judi',
  'bitcoin giveaway',
  'usdt giveaway',
  'onlyfans'
];

const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const UA_GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// Which threat types each scan type is allowed to auto-resolve
const CONTENT_TYPES = [
  ...Object.keys(THREAT_PATTERNS),
  'suspicious_redirect', 'unexpected_meta', 'defacement', 'keyword_missing',
  'seo_link_injection', 'hidden_injection',
];
const COVERAGE = {
  light: CONTENT_TYPES,
  cloak: ['cloaking'],
  full: [
    ...CONTENT_TYPES,
    'exposed_env', 'directory_listing', 'debug_mode',
    'spam_sitemap', 'wp_new_user', 'wp_new_plugin', 'blacklisted',
  ],
};
// Threat types that mean "site is compromised" (vs. just a weakness)
const HACK_TYPES = [
  'casino_spam', 'gambling_spam', 'pharma_spam', 'suspicious_redirect', 'defacement',
  'crypto_scam', 'adult_content', 'japanese_seo_spam', 'chinese_seo_spam', 'korean_spam',
  'seo_link_injection', 'hidden_injection', 'cloaking', 'spam_sitemap', 'blacklisted', 'seo_spam',
];

const stripWww = (h) => String(h || '').replace(/^www\./i, '').toLowerCase();
const hostOf = (u, base) => { try { return stripWww(new URL(u, base).hostname); } catch { return ''; } };
const sameSite = (a, b) => !a || !b || a === b || a.endsWith('.' + b) || b.endsWith('.' + a);

async function fetchPage(domain, { ua = UA_BROWSER, referer, timeout = 15000 } = {}) {
  const headers = { 'User-Agent': ua, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' };
  if (referer) headers.Referer = referer;
  const res = await axios.get(`https://${domain}`, {
    timeout, maxRedirects: 5, headers, validateStatus: (s) => s < 600,
    maxContentLength: 3 * 1024 * 1024, responseType: 'text', transformResponse: (d) => d,
  });
  return {
    status: res.status,
    html: String(res.data || ''),
    finalUrl: res.request?.res?.responseUrl || `https://${domain}`,
  };
}

// Pure analysis of one HTML page → list of threats (no I/O)
function analyzeContent(html, website, finalUrl) {
  const threats = [];
  const allow = new Set(website.threatAllowlist || []);
  const add = (t) => { if (!allow.has(t.type)) threats.push(t); };

  const $ = cheerio.load(html);
  const pageTitle = $('title').first().text().trim();
  const metaDescription = $('meta[name="description"]').attr('content') || '';
  const metaKeywords = $('meta[name="keywords"]').attr('content') || '';
  const bodyText = $('body').text().toLowerCase();
  const domainHost = stripWww(website.domain);

  const links = [];
  $('a[href]').each((_, el) => links.push($(el).attr('href') || ''));

  const snippet = bodyText.replace(/\s+/g, ' ').trim().slice(0, 400);
  const meta = { pageTitle, metaDescription, metaKeywords, finalUrl, snippet };

  // 1. Spam content
  for (const [threatType, config] of Object.entries(THREAT_PATTERNS)) {
    const foundKeywords = config.keywords.filter((kw) => bodyText.includes(kw.toLowerCase()));
    const titleMatch = config.titlePatterns.some((p) => p.test(pageTitle));
    const metaMatch = SUSPICIOUS_META_KEYWORDS.some((k) => (metaKeywords + metaDescription).toLowerCase().includes(k));
    // Title alone is no longer enough (was: "Better Life" → casino_spam)
    if (foundKeywords.length >= 2 || (titleMatch && foundKeywords.length >= 1) || (foundKeywords.length >= 1 && metaMatch)) {
      add({
        type: threatType, severity: config.severity, score: config.score,
        description: `Detected ${foundKeywords.length} spam keyword(s) on page`,
        evidence: { foundKeywords, titleMatch, pageTitle, snippet },
      });
    }
  }

  // 2. Redirects (HTTP final URL, meta refresh, JS)
  const finalHost = hostOf(finalUrl, `https://${website.domain}`);
  if (finalHost && !sameSite(finalHost, domainHost)) {
    const bad = SUSPICIOUS_REDIRECT_PATTERNS.some((p) => p.test(finalUrl));
    add({
      type: 'suspicious_redirect', severity: bad ? 'critical' : 'high', score: bad ? 90 : 62,
      description: `Homepage redirects to another domain: ${finalUrl}`,
      evidence: { originalUrl: `https://${website.domain}`, finalUrl },
    });
  }
  const refresh = $('meta[http-equiv="refresh" i]').attr('content') || '';
  const refUrl = (refresh.match(/url\s*=\s*['"]?([^'"\s>]+)/i) || [])[1];
  if (refUrl && !sameSite(hostOf(refUrl, `https://${website.domain}`), domainHost)) {
    add({ type: 'suspicious_redirect', severity: 'critical', score: 88, description: `Meta refresh redirects to ${refUrl}`, evidence: { refUrl } });
  }
  let jsRedirect = null;
  $('script:not([src])').each((_, el) => {
    const code = $(el).html() || '';
    const m = code.match(/(?:window|document|top|self)\.location(?:\.href)?\s*=\s*['"](https?:\/\/[^'"]+)['"]/i)
           || code.match(/location\.(?:replace|assign)\(\s*['"](https?:\/\/[^'"]+)['"]/i);
    if (m && !sameSite(hostOf(m[1]), domainHost)) jsRedirect = m[1];
  });
  if (jsRedirect) {
    add({ type: 'suspicious_redirect', severity: 'critical', score: 85, description: `JavaScript redirect to ${jsRedirect}`, evidence: { jsRedirect } });
  }

  // 3. Hidden injections (invisible spam links / hidden iframes)
  const hiddenSel = '[style*="display:none"],[style*="display: none"],[style*="visibility:hidden"],[style*="visibility: hidden"],[style*="-9999px"],[style*="text-indent:-"]';
  let hiddenExternalLinks = 0;
  const hiddenSamples = [];
  $(hiddenSel).each((_, el) => {
    $(el).find('a[href]').each((__, a) => {
      const href = $(a).attr('href') || '';
      if (/^https?:/i.test(href) && !sameSite(hostOf(href), domainHost)) {
        hiddenExternalLinks++;
        if (hiddenSamples.length < 5) hiddenSamples.push(href);
      }
    });
  });
  const hiddenIframes = [];
  $('iframe[src]').each((_, el) => {
    const src = $(el).attr('src') || '';
    const w = parseInt($(el).attr('width')); const h = parseInt($(el).attr('height'));
    const st = ($(el).attr('style') || '').replace(/\s/g, '').toLowerCase();
    const hidden = w <= 2 || h <= 2 || /display:none|visibility:hidden|-9999px/.test(st);
    if (hidden && /^(https?:)?\/\//i.test(src) && !sameSite(hostOf(src, `https://${website.domain}`), domainHost)) hiddenIframes.push(src);
  });
  if (hiddenExternalLinks >= 5 || hiddenIframes.length > 0) {
    add({
      type: 'hidden_injection', severity: 'critical', score: hiddenIframes.length ? 88 : 85,
      description: hiddenIframes.length ? `Hidden iframe to external site: ${hiddenIframes[0]}` : `${hiddenExternalLinks} hidden external links injected`,
      evidence: { hiddenExternalLinks, samples: hiddenSamples, hiddenIframes },
    });
  }

  // 4. Meta injection (only when nothing else found)
  const metaBad = SUSPICIOUS_META_KEYWORDS.some((k) => (metaKeywords + metaDescription + pageTitle).toLowerCase().includes(k));
  if (metaBad && threats.length === 0) {
    add({ type: 'unexpected_meta', severity: 'high', score: 60, description: 'Suspicious keywords found in meta tags', evidence: { metaKeywords, metaDescription, pageTitle } });
  }

  // 5. Defacement vs baseline
  if (website.isBaselinesSet && website.contentBaseline?.title && pageTitle) {
    const exp = website.contentBaseline.title;
    if (!pageTitle.includes(exp.substring(0, 10))) {
      add({ type: 'defacement', severity: 'high', score: 72, description: `Homepage title changed from "${exp}" to "${pageTitle}"`, evidence: { expected: exp, found: pageTitle } });
    }
  }

  // 6. Expected keywords
  if (website.expectedKeywords?.length) {
    const missing = website.expectedKeywords.filter((kw) => !bodyText.includes(kw.toLowerCase()));
    if (missing.length) {
      add({ type: 'keyword_missing', severity: 'medium', score: 40, description: `Expected content keywords missing: ${missing.join(', ')}`, evidence: { missingKeywords: missing } });
    }
  }

  // 7. Spam link injection (word-boundary; was matching "better", "slot" inside normal URLs)
  const spamLinks = links.filter((l) => /(casino|\bslot|judi|togel|poker|\bbet\b|viagra|porn|joker123|1xbet|sbobet)/i.test(l));
  if (spamLinks.length >= 3) {
    add({ type: 'seo_link_injection', severity: 'critical', score: 88, description: `${spamLinks.length} suspicious spam links detected`, evidence: { suspiciousLinks: spamLinks.slice(0, 10) } });
  }

  return { threats, meta };
}

module.exports = {
  THREAT_PATTERNS, COVERAGE, HACK_TYPES, CONTENT_TYPES,
  UA_BROWSER, UA_GOOGLEBOT, UA_MOBILE,
  fetchPage, analyzeContent, hostOf, sameSite, stripWww,
};
