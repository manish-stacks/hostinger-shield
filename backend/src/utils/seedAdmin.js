const mongoose = require('mongoose');
const { User } = require('../models');
const logger = require('./logger');

const DEFAULT_ADMIN = {
  name: 'Super Admin',
  email: process.env.ADMIN_EMAIL || 'admin@shieldpro.com',
  password: process.env.ADMIN_PASSWORD || 'Admin@123456',
  role: 'super_admin',
  isActive: true,
};

/**
 * Seeds the default super_admin account if no users exist.
 * Called once after DB connection is established.
 */
async function seedAdmin() {
  try {
    const count = await User.countDocuments();
    if (count > 0) {
      logger.info(`[Seed] ${count} user(s) already exist — skipping admin seed`);
      return;
    }

    const admin = await User.create(DEFAULT_ADMIN);
    logger.info(`[Seed] Default super_admin created`);
    logger.info(`[Seed] Email   : ${admin.email}`);
    logger.info(`[Seed] Password: ${DEFAULT_ADMIN.password}`);
    logger.info(`[Seed] ⚠️  Change the default password after first login!`);
  } catch (err) {
    logger.error(`[Seed] Admin seed failed: ${err.message}`);
  }
}

module.exports = { seedAdmin };