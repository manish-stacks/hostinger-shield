const axios = require('axios');
const cheerio = require('cheerio');
const { Website, ThreatLog, IncidentLog, Notification } = require('../models');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

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
      /slot/i,
      /gambling/i,
      /poker/i,
      /jackpot/i,
      /bet/i,
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
      /pharmacy/i,
      /pills/i,
      /medication/i,
      /drug/i,
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
      /crypto/i,
      /bitcoin/i,
      /airdrop/i,
      /usdt/i,
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
      /adult/i,
      /nude/i,
      /onlyfans/i,
      /escort/i
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
      /loan/i,
      /insurance/i,
      /cheap flights/i,
      /essay writing/i,
      /weight loss/i
    ],
    score: 75,
    severity: 'high',
  },
};

const SUSPICIOUS_REDIRECT_PATTERNS = [
  /casino/i, /gambling/i, /porn/i, /pharma/i, /slots/i, /bet\d/i, /\d{2,}\.xyz$/i,
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
// ─── MAIN THREAT ANALYSIS ────────────────────────────────────────────────────
async function analyzeWebsite(website) {
  const results = {
    website: website._id,
    domain: website.domain,
    threats: [],
    overallScore: 0,
    isHacked: false,
    rawData: {},
  };

  try {
    const response = await axios.get(`https://${website.domain}`, {
      timeout: 15000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      validateStatus: (status) => status < 600,
    });

    const html = String(response.data || '');
    const $ = cheerio.load(html);
    const pageTitle = $('title').text().trim();
    const metaDescription = $('meta[name="description"]').attr('content') || '';
    const metaKeywords = $('meta[name="keywords"]').attr('content') || '';
    const bodyText = $('body').text().toLowerCase();
    const allLinks = [];
    $('a[href]').each((_, el) => allLinks.push($(el).attr('href')));

    results.rawData = { pageTitle, metaDescription, metaKeywords, finalUrl: response.request?.res?.responseUrl || `https://${website.domain}` };

    // ── 1. Content-based threat scanning ──
    for (const [threatType, config] of Object.entries(THREAT_PATTERNS)) {
      const foundKeywords = config.keywords.filter(kw => bodyText.includes(kw.toLowerCase()));
      const titleMatch = config.titlePatterns.some(p => p.test(pageTitle));
      const metaMatch = SUSPICIOUS_META_KEYWORDS.some(k => (metaKeywords + metaDescription).toLowerCase().includes(k));

      if (foundKeywords.length >= 2 || titleMatch || (foundKeywords.length >= 1 && metaMatch)) {
        const evidence = { foundKeywords, titleMatch, pageTitle, metaKeywords };
        results.threats.push({
          type: threatType,
          severity: config.severity,
          score: config.score,
          description: `Detected ${foundKeywords.length} spam keyword(s) on page`,
          evidence,
        });
      }
    }

    // ── 2. Redirect attack detection ──
    const finalUrl = results.rawData.finalUrl;
    if (finalUrl !== `https://${website.domain}` && finalUrl !== `http://${website.domain}`) {
      const isSuspiciousRedirect = SUSPICIOUS_REDIRECT_PATTERNS.some(p => p.test(finalUrl));
      if (isSuspiciousRedirect) {
        results.threats.push({
          type: 'suspicious_redirect',
          severity: 'critical',
          score: 90,
          description: `Homepage redirecting to suspicious URL: ${finalUrl}`,
          evidence: { originalUrl: `https://${website.domain}`, finalUrl },
        });
      }
    }

    // ── 3. Meta tag injection ──
    const suspiciousMeta = SUSPICIOUS_META_KEYWORDS.some(k =>
      (metaKeywords + metaDescription + pageTitle).toLowerCase().includes(k)
    );
    if (suspiciousMeta && results.threats.length === 0) {
      results.threats.push({
        type: 'unexpected_meta',
        severity: 'high',
        score: 60,
        description: 'Suspicious keywords found in meta tags',
        evidence: { metaKeywords, metaDescription, pageTitle },
      });
    }

    // ── 4. Defacement detection ──
    if (website.isBaselinesSet && website.contentBaseline) {
      const expectedTitle = website.contentBaseline.title;
      if (expectedTitle && pageTitle && !pageTitle.includes(expectedTitle.substring(0, 10))) {
        results.threats.push({
          type: 'defacement',
          severity: 'high',
          score: 72,
          description: `Homepage title changed from "${expectedTitle}" to "${pageTitle}"`,
          evidence: { expected: expectedTitle, found: pageTitle },
        });
      }
    }

    // ── 5. Expected keyword check ──
    if (website.expectedKeywords && website.expectedKeywords.length > 0) {
      const missingKeywords = website.expectedKeywords.filter(
        kw => !bodyText.includes(kw.toLowerCase())
      );
      if (missingKeywords.length > 0) {
        results.threats.push({
          type: 'keyword_missing',
          severity: 'medium',
          score: 40,
          description: `Expected content keywords missing: ${missingKeywords.join(', ')}`,
          evidence: { missingKeywords, expectedKeywords: website.expectedKeywords },
        });
      }
    }

    // ── 6. Vulnerability scan ──
    const vulnResults = await scanVulnerabilities(website.domain);
    results.threats.push(...vulnResults);

    // ── 7. Suspicious link injection (SEO spam) ──
    const suspiciousLinks = allLinks.filter(link =>
      /(casino|slot|judi|togel|poker|bet|viagra|porn|joker123|1xbet|sbobet)/i.test(link || '')
    );

    if (suspiciousLinks.length >= 3) {
      results.threats.push({
        type: 'seo_link_injection',
        severity: 'critical',
        score: 88,
        description: `${suspiciousLinks.length} suspicious spam links detected`,
        evidence: { suspiciousLinks }
      });
    }
  } catch (err) {
    logger.error(`Threat scan error for ${website.domain}: ${err.message}`);
    results.error = err.message;
  }

  // Calculate overall threat score
  if (results.threats.length > 0) {
    const maxScore = Math.max(...results.threats.map(t => t.score));
    const bonusScore = Math.min(results.threats.length * 5, 20);
    results.overallScore = Math.min(maxScore + bonusScore, 100);
    results.isHacked = results.overallScore >= 60 ||
      results.threats.some(t => ['casino_spam', 'gambling_spam', 'pharma_spam', 'suspicious_redirect', 'defacement', 'crypto_scam', 'adult_content'].includes(t.type));
  }

  return results;
}

// ─── VULNERABILITY SCANNER ───────────────────────────────────────────────────
async function scanVulnerabilities(domain) {
  const threats = [];

  // Check exposed .env
  try {
    const envRes = await axios.get(`https://${domain}/.env`, { timeout: 5000, validateStatus: s => s < 600 });
    if (envRes.status === 200 && envRes.data.includes('=')) {
      threats.push({
        type: 'exposed_env',
        severity: 'critical',
        score: 95,
        description: '.env file is publicly accessible — credentials may be exposed',
        evidence: {},
      });
    }
  } catch { }

  // Check directory listing
  const dirsToCheck = ['/uploads', '/backup', '/tmp', '/logs', '/admin'];
  for (const dir of dirsToCheck) {
    try {
      const res = await axios.get(`https://${domain}${dir}`, { timeout: 3000, validateStatus: s => s < 600 });
      if (res.status === 200 && res.data.toLowerCase().includes('index of')) {
        threats.push({
          type: 'directory_listing',
          severity: 'high',
          score: 65,
          description: `Directory listing enabled at ${dir}`,
          evidence: { path: dir },
        });
        break;
      }
    } catch { }
  }

  // Check debug mode (WordPress)
  try {
    const wpDebug = await axios.get(`https://${domain}/wp-content/debug.log`, { timeout: 3000, validateStatus: s => s < 600 });
    if (wpDebug.status === 200) {
      threats.push({
        type: 'debug_mode',
        severity: 'high',
        score: 60,
        description: 'WordPress debug.log is publicly accessible',
        evidence: {},
      });
    }
  } catch { }

  return threats;
}

// ─── SAVE THREAT RESULTS ─────────────────────────────────────────────────────
async function saveThreatResults(website, results, io) {
  try {
    const newThreats = [];

    for (const threat of results.threats) {
      // Check if same threat type already active (unresolved)
      const existing = await ThreatLog.findOne({
        website: website._id,
        threatType: threat.type,
        isResolved: false,
        detectedAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) },
      });
      if (existing) continue;

      const log = await ThreatLog.create({
        website: website._id,
        user: website.user,
        threatType: threat.type,
        severity: threat.severity,
        score: threat.score,
        title: `${threat.type.replace(/_/g, ' ').toUpperCase()} detected on ${website.domain}`,
        description: threat.description,
        evidence: threat.evidence,
      });
      newThreats.push(log);
    }

    // Update website threat score and status
    const newStatus = results.isHacked ? 'hacked'
      : results.overallScore >= 50 ? 'warning'
        : results.overallScore >= 30 ? 'warning'
          : 'healthy';

    const newLevel = results.overallScore >= 75 ? 'critical'
      : results.overallScore >= 50 ? 'high_risk'
        : results.overallScore >= 25 ? 'warning'
          : 'safe';

    await Website.findByIdAndUpdate(website._id, {
      threatScore: results.overallScore,
      threatLevel: newLevel,
      status: newStatus,
      lastThreatScan: new Date(),
    });

    // Create incident + send alerts for hacked websites
    if (results.isHacked && newThreats.length > 0) {
      await createHackIncident(website, newThreats, results, io);
    }

    return newThreats;
  } catch (err) {
    logger.error(`Save threat results error: ${err.message}`);
  }
}

// ─── CREATE HACK INCIDENT ────────────────────────────────────────────────────
async function createHackIncident(website, threats, results, io) {
  const primaryThreat = [...threats].sort((a, b) => b.score - a.score)[0];

  const incident = await IncidentLog.create({
    website: website._id,
    user: website.user,
    incidentType: primaryThreat.threatType,
    severity: 'critical',
    title: `Website Hacked: ${website.domain}`,
    description: `${threats.length} threat(s) detected. Primary: ${primaryThreat.title}`,
    detectionTime: new Date(),
    relatedThreats: threats.map(t => t._id),
    timeline: [{
      event: 'threat_detected',
      description: `${threats.length} threats detected by automated scanner`,
      timestamp: new Date(),
    }],
  });

  // Send notifications
  await notificationService.sendHackAlert({
    website,
    incident,
    threats,
    threatScore: results.overallScore,
  });

  // Emit socket event
  if (io) {
    io.to(`user:${website.user}`).emit('website:hacked', {
      website: website._id,
      domain: website.domain,
      threatScore: results.overallScore,
      incidentId: incident._id,
      primaryThreat: primaryThreat.threatType,
    });
  }

  logger.warn(`HACK DETECTED: ${website.domain} — Score: ${results.overallScore} — Threats: ${threats.map(t => t.threatType).join(', ')}`);
}

module.exports = {
  analyzeWebsite,
  saveThreatResults,
  scanVulnerabilities,
};
