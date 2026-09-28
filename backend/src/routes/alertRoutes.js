const router = require('express').Router();
const monitoringController = require('../controllers/monitoringController');
const { protect } = require('../middleware');

router.use(protect);
router.get('/', monitoringController.getNotifications);
router.patch('/read-all', monitoringController.markAllNotificationsRead);
router.patch('/:id/read', monitoringController.markNotificationRead);
router.get('/unread-count', monitoringController.getUnreadCount);
module.exports = router;
