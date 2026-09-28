const axios = require('axios');
const { HostingerAccount, Website, BackupRecord } = require('../models');

const HOSTINGER_API_BASE = 'https://developers.hostinger.com';

class HostingerSyncService {
  constructor() {
    this.timeout = 30000;
  }

  _client(apiToken) {
    return axios.create({
      baseURL: HOSTINGER_API_BASE,
      timeout: this.timeout,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  // ── Token Validation ────────────────────────────────────────────────────────
  // Hostinger API returns 401 for invalid token, 200 for valid
  // We use /api/hosting/v1/websites as a lightweight probe
  async validateToken(apiToken) {
    try {
      const client = this._client(apiToken);
      await client.get('/api/hosting/v1/websites', { params: { per_page: 1 } });
      return { valid: true };
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) {
        return { valid: false, error: 'Invalid or expired API token' };
      }
      // Any other error (network, 5xx) — treat as network issue, not bad token
      return { valid: false, error: err.response?.data?.error || err.message };
    }
  }

  // ── Fetch all websites accessible to the token ──────────────────────────────
  // GET /api/hosting/v1/websites  → paginated { data: [...], meta: { total, per_page, current_page } }
  // Each item: { domain, vhost_type, is_enabled, username, client_id, order_id, created_at }
  async fetchAllWebsites(apiToken) {
    const client = this._client(apiToken);
    const websites = [];
    let page = 1;

    try {
      while (true) {
        const res = await client.get('/api/hosting/v1/websites', {
          params: { per_page: 50, page },
        });

        const items = res.data?.data || [];
        websites.push(...items);

        const meta = res.data?.meta;
        const total = meta?.total ?? items.length;
        if (websites.length >= total || items.length === 0) break;
        page++;
      }
    } catch (err) {
      console.error('[HostingerSync] fetchAllWebsites error:', err.response?.data || err.message);
    }

    return websites;
  }

  // ── Fetch all orders ─────────────────────────────────────────────────────────
  // GET /api/hosting/v1/orders → { data: [...], meta: {...} }
  // Each item: { id, subscription_id, plan: { name }, status, created_at }
  async fetchAllOrders(apiToken) {
    const client = this._client(apiToken);
    const orders = [];
    let page = 1;

    try {
      while (true) {
        const res = await client.get('/api/hosting/v1/orders', {
          params: { per_page: 50, page },
        });

        const items = res.data?.data || [];
        orders.push(...items);

        const meta = res.data?.meta;
        const total = meta?.total ?? items.length;
        if (orders.length >= total || items.length === 0) break;
        page++;
      }
    } catch (err) {
      console.error('[HostingerSync] fetchAllOrders error:', err.response?.data || err.message);
    }

    return orders;
  }

  // ── Fetch all domains with expiry info ───────────────────────────────────────
  // GET /api/domains/v1/portfolio → array of { domain, status, created_at, expires_at }
  async fetchAllDomains(apiToken) {
    const client = this._client(apiToken);
    try {
      const res = await client.get('/api/domains/v1/portfolio');
      return res.data || [];
    } catch (err) {
      console.error('[HostingerSync] fetchAllDomains error:', err.response?.data || err.message);
      return [];
    }
  }

  // ── Sync a single account ────────────────────────────────────────────────────
  async syncAccount(accountId) {
    const account = await HostingerAccount.findById(accountId).select('+apiToken');
    if (!account || !account.isActive) {
      return { synced: 0, errors: ['Account not found or inactive'] };
    }

    account.syncStatus = 'syncing';
    await account.save();

    const errors = [];
    let syncedCount = 0;
    console.log('Synced Hostinger account:', account.apiToken);

    try {
      // Fetch websites, orders and domains in parallel
      const [rawWebsites, rawOrders, rawDomains] = await Promise.all([
        this.fetchAllWebsites(account.apiToken),
        this.fetchAllOrders(account.apiToken),
        this.fetchAllDomains(account.apiToken),
      ]);

      // Build lookup maps
      // order_id → { plan_name, subscription_id }
      const orderMap = {};
      for (const o of rawOrders) {
        orderMap[o.id] = {
          planName: o.plan?.name || 'Unknown',
          subscriptionId: o.subscription_id || null,
        };
      }

      // domain → expires_at
      const domainExpiryMap = {};
      for (const d of rawDomains) {
        if (d.domain) {
          domainExpiryMap[d.domain.toLowerCase()] = d.expires_at ? new Date(d.expires_at) : null;
        }
      }

      console.log(`[HostingerSync] Account: ${account.accountName}`);
      console.log(`[HostingerSync] Websites: ${rawWebsites.length}, Orders: ${rawOrders.length}, Domains: ${rawDomains.length}`);

      // Update account website count
      account.websiteCount = rawWebsites.filter(w => w.vhost_type === 'main').length;

      for (const site of rawWebsites) {
        const domain = site.domain?.toLowerCase().trim();
        if (!domain) continue;

        const orderInfo = orderMap[site.order_id] || {};
        const domainExpiry = domainExpiryMap[domain] || null;

        try {
          await Website.findOneAndUpdate(
            { domain, hostingerAccount: account._id },
            {
              $set: {
                hostingerAccount: account._id,
                user: account.user,
                hostingPlan: orderInfo.planName || 'Unknown',
                hostingUsername: site.username || '',
                orderId: site.order_id || null,
                subscriptionId: orderInfo.subscriptionId || null,
                vhostType: site.vhost_type || 'main',
                isEnabled: site.is_enabled !== false,
                hostingClientId: site.client_id || null,
                domainExpiry: domainExpiry,
                lastSync: new Date(),
              },
              $setOnInsert: {
                domain,
                status: 'unknown',
                threatScore: 0,
                threatLevel: 'safe',
                isActive: true,
                isMonitoringEnabled: true,
              },
            },
            { upsert: true, new: true }
          );
          syncedCount++;
        } catch (e) {
          console.error(`[HostingerSync] upsert failed for ${domain}:`, e.message);
          errors.push(`${domain}: ${e.message}`);
        }
      }

      account.syncStatus = 'success';
      account.lastSync = new Date();
      account.syncError = null;
      account.isTokenValid = true;
      account.tokenValidationError = null;
    } catch (err) {
      console.error('[HostingerSync] syncAccount error:', err.message);
      account.syncStatus = 'error';
      account.syncError = err.message;
      errors.push(err.message);
    }

    await account.save();
    return { synced: syncedCount, errors };
  }

  // ── Sync all active accounts ─────────────────────────────────────────────────
  async syncAllAccounts() {
    const accounts = await HostingerAccount.find({ isActive: true });
    const results = [];

    for (const account of accounts) {
      const result = await this.syncAccount(account._id);
      results.push({ accountId: account._id, accountName: account.accountName, ...result });
    }

    return results;
  }

  // ── Discover backups for a website ───────────────────────────────────────────
  // NOTE: Hostinger shared hosting API v1 does NOT expose a backup list endpoint.
  // Backups are managed via hPanel only. This method is a no-op stub that returns
  // an empty array to prevent crashes. VPS backup endpoint exists but is separate.
  async discoverBackups(websiteId) {
    console.warn('[HostingerSync] discoverBackups: Hostinger shared hosting API does not expose backup list. Returning empty.');
    return [];
  }

  // ── Execute restore ──────────────────────────────────────────────────────────
  // Same situation — shared hosting restore is not available via API v1.
  async executeRestore(websiteId, backupId, userId) {
    return {
      success: false,
      error: 'Hostinger shared hosting restore is not available via API. Please use hPanel.',
    };
  }
}

module.exports = new HostingerSyncService();
