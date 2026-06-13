const router = require('express').Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh', authController.refreshToken);
router.post('/logout', protect, authController.logout);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password/:token', authController.resetPassword);
router.get('/me', protect, authController.getMe);
router.patch('/update-password', protect, authController.updatePassword);

module.exports = router;