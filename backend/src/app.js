require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const { createServer } = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');

const connectDB = require('./config/database');
const logger = require('./utils/logger');
const { setupSocket } = require('./socket/socketHandler');
const { initCronJobs } = require('./jobs/cronManager');
const swaggerSpec = require('./config/swagger');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const accountRoutes = require('./routes/accountRoutes');
const websiteRoutes = require('./routes/websiteRoutes');
const monitoringRoutes = require('./routes/monitoringRoutes');
const threatRoutes = require('./routes/threatRoutes');
const sslRoutes = require('./routes/sslRoutes');
const dnsRoutes = require('./routes/dnsRoutes');
const backupRoutes = require('./routes/backupRoutes');
const restoreRoutes = require('./routes/restoreRoutes');
const exportRoutes = require('./routes/exportRoutes');
const reportRoutes = require('./routes/reportRoutes');
const alertRoutes = require('./routes/alertRoutes');
const incidentRoutes = require('./routes/incidentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const userRoutes = require('./routes/userRoutes');
const screenshotRoutes = require('./routes/screenshotRoutes');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_URL, credentials: true }
});

// Connect Database
connectDB();

// Global rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(compression());
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve screenshot files statically (protected — only if logged in check is done in controller)
const screenshotDir = process.env.SCREENSHOT_DIR || require('path').join(__dirname, '../screenshots');
app.use('/screenshots', require('./middleware').protect, require('express').static(screenshotDir));
app.use('/api', limiter);

// Swagger docs
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/websites', websiteRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/threats', threatRoutes);
app.use('/api/ssl', sslRoutes);
app.use('/api/dns', dnsRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/restore', restoreRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/screenshots', screenshotRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Socket.IO setup
setupSocket(io);
app.set('io', io);

// Error handler (must be last)
app.use(errorHandler);

// Init cron jobs
initCronJobs(io);

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  logger.info(`Shield Pro API running on port ${PORT}`);
  logger.info(`Swagger docs at http://localhost:${PORT}/api/docs`);
});

module.exports = { app, io };