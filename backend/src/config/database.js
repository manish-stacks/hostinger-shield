const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Safely align existing MongoDB TTL indexes with current env retention values
async function syncTTLIndexes(db) {
  const healthDays = Math.max(1, parseInt(process.env.RETAIN_HEALTH_DAYS) || 7);
  const notifDays  = Math.max(1, parseInt(process.env.RETAIN_NOTIF_DAYS) || 10);

  const targets = [
    { collection: 'websitehealths', key: { checkedAt: 1 }, expireAfterSeconds: healthDays * 86400 },
    { collection: 'notifications',  key: { createdAt: 1 }, expireAfterSeconds: notifDays * 86400 },
  ];

  for (const t of targets) {
    try {
      const exists = await db.listCollections({ name: t.collection }).hasNext();
      if (!exists) continue;
      await db.command({
        collMod: t.collection,
        index: { keyPattern: t.key, expireAfterSeconds: t.expireAfterSeconds },
      });
      logger.info(`[DB] Synced TTL on ${t.collection} → ${t.expireAfterSeconds / 86400}d`);
    } catch (err) {
      // Index may not exist yet (Mongoose will create it) — ignore safely
      if (!/not found|IndexNotFound|NamespaceNotFound/i.test(err.message)) {
        logger.warn(`[DB] TTL sync note (${t.collection}): ${err.message}`);
      }
    }
  }
}

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 45000,
    });
    logger.info(`MongoDB connected: ${conn.connection.host}`);

    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected. Reconnecting...');
    });

    // Align TTL indexes with .env retention settings (prevents 90d legacy bloat)
    await syncTTLIndexes(conn.connection.db);

    // Seed default admin on first boot only if zero users exist
    const { seedAdmin } = require('../utils/seedAdmin');
    await seedAdmin();
  } catch (err) {
    logger.error(`MongoDB connection failed: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
