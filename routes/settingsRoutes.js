const router = require('express').Router();
const ctrl = require('../controllers/settingsController');
const { requireAuth, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/:key', ctrl.getSetting);
router.put('/:key', requireAuth, requireRole('admin'), ctrl.updateSetting);
router.post('/payment-qr', requireAuth, requireRole('admin'), upload.single('qr'), ctrl.uploadPaymentQr);

module.exports = router;
