const router = require('express').Router();
const ctrl = require('../controllers/feesController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/me', requireAuth, requireRole('student'), ctrl.getMyFees);
router.get('/students', requireAuth, requireRole('admin'), ctrl.listStudentsByProgramme);
router.get('/history', requireAuth, requireRole('admin'), ctrl.getMonthlyHistory);
router.get('/history/:month/pdf', requireAuth, requireRole('admin'), ctrl.downloadMonthlyPdf);
router.get('/', requireAuth, requireRole('admin'), ctrl.listFees);
router.post('/', requireAuth, requireRole('admin'), ctrl.upsertFee);
router.post('/bulk', requireAuth, requireRole('admin'), ctrl.upsertFeesBulk);
router.patch('/:id/status', requireAuth, requireRole('admin'), ctrl.updateFeeStatus);

module.exports = router;
