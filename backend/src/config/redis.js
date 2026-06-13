const { createClient } = require('redis');
const logger = require('../utils/logger');

let client = null;

const getRedisClient = async () => {
  if (client && client.isOpen) return client;

  client = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          logger.error('Redis: max reconnection attempts reached');
          return new Error('Max retries');
        }
        return Math.min(retries * 100, 3000);
      },
    },
  });

  client.on('error', (err) => logger.error(`Redis error: ${err.message}`));
  client.on('connect', () => logger.info('Redis connected'));
  client.on('reconnecting', () => logger.warn('Redis reconnecting...'));

  await client.connect();
  return client;
};

module.exports = { getRedisClient };
