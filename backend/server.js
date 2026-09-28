require('dotenv').config();
require('./src/app'); // app.js starts the server internally
const logger = require('./src/utils/logger');

const shutdown = (signal) => {
  logger.info(`${signal} received. Shutting down...`);
  setTimeout(() => process.exit(0), 500); // let logs flush
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Log only — one failed request/job must not take the whole API down
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled rejection: ${err && err.message ? err.message : err}`);
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.message}`);
  // State may be corrupt: exit so pm2 restarts cleanly
  setTimeout(() => process.exit(1), 500);
});
