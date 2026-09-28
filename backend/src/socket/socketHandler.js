const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

function setupSocket(io) {
  // Auth middleware for socket
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.userRole = decoded.role;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id} (user: ${socket.userId})`);

    // Join user-specific room
    socket.join(`user:${socket.userId}`);

    // Join website-specific rooms on request
    socket.on('subscribe:website', (websiteId) => {
      socket.join(`website:${websiteId}`);
    });

    socket.on('unsubscribe:website', (websiteId) => {
      socket.leave(`website:${websiteId}`);
    });

    // Real-time monitoring ping
    socket.on('ping:website', () => {
      socket.emit('pong:website', { timestamp: Date.now() });
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  // Helper to emit to user
  io.emitToUser = (userId, event, data) => {
    io.to(`user:${userId}`).emit(event, data);
  };

  // Helper to emit website update
  io.emitWebsiteUpdate = (websiteId, data) => {
    io.to(`website:${websiteId}`).emit('website:updated', data);
  };

  logger.info('Socket.IO initialized');
}

// Event constants
const SOCKET_EVENTS = {
  WEBSITE_HACKED: 'website:hacked',
  WEBSITE_DOWN: 'website:down',
  WEBSITE_RESTORED: 'website:restored',
  SSL_EXPIRING: 'ssl:expiring',
  DNS_CHANGED: 'dns:changed',
  SCAN_STARTED: 'scan:started',
  SCAN_COMPLETED: 'scan:completed',
  BACKUP_AVAILABLE: 'backup:available',
  NOTIFICATION_NEW: 'notification:new',
  WEBSITE_UPDATED: 'website:updated',
};

module.exports = { setupSocket, SOCKET_EVENTS };
