const router = require('express').Router();
const exportController = require('../controllers/exportController');
const { protect } = require('../middleware');

router.use(protect);

// Frontend sends POST with responseType: 'blob'
// format and accountId come as query params
router.post('/websites',        exportController.exportWebsites);
router.post('/threats',         exportController.exportThreats);
router.post('/ssl',             exportController.exportSSL);
router.post('/dns',             exportController.exportDNS);
router.post('/incidents',       exportController.exportIncidents);

// GET aliases — keep for any direct browser/curl calls
router.get('/websites',         exportController.exportWebsites);
router.get('/threats',          exportController.exportThreats);
router.get('/ssl',              exportController.exportSSL);

module.exports = router;