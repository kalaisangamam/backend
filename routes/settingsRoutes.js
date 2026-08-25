const router = require('express').Router();
const ctrl = require('../controllers/settingsController');
const { requireAuth, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/branches/list', ctrl.listBranches);
router.post('/branches', requireAuth, requireRole('admin'), ctrl.createBranch);
router.put('/branches/:id', requireAuth, requireRole('admin'), ctrl.updateBranch);
router.get('/:key', ctrl.getSetting);
router.put('/:key', requireAuth, requireRole('admin'), ctrl.updateSetting);
router.post('/payment-qr', requireAuth, requireRole('admin'), upload.single('qr'), ctrl.uploadPaymentQr);

module.exports = router;
