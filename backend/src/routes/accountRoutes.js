const router = require('express').Router();
const accountController = require('../controllers/accountController');
const { protect } = require('../middleware');

router.use(protect);

router.get('/', accountController.getAccounts);
router.post('/', accountController.createAccount);
router.get('/:id', accountController.getAccount);
router.patch('/:id', accountController.updateAccount);
router.delete('/:id', accountController.deleteAccount);
router.post('/:id/sync', accountController.syncAccount);
router.post('/:id/validate', accountController.validateToken);
router.patch('/:id/toggle', accountController.toggleActive);

module.exports = router;
