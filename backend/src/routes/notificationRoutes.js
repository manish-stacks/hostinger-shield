const router = require('express').Router();
const monitoringController = require('../controllers/monitoringController');
const { protect } = require('../middleware');

router.use(protect);
router.get('/', monitoringController.getNotifications);
router.get('/unread-count', monitoringController.getUnreadCount);

// Support both paths — frontend uses mark-all-read
router.patch('/mark-all-read', monitoringController.markAllNotificationsRead);
router.patch('/read-all', monitoringController.markAllNotificationsRead);

router.delete('/clear-read', monitoringController.clearReadNotifications);
router.delete('/:id', monitoringController.deleteNotification);
router.patch('/:id/read', monitoringController.markNotificationRead);

module.exports = router;