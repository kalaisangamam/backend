const router = require('express').Router();
const ctrl = require('../controllers/contactEnquiriesController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.post('/', ctrl.createEnquiry);
router.get('/', requireAuth, requireRole('admin'), ctrl.listEnquiries);
router.patch('/:id/status', requireAuth, requireRole('admin'), ctrl.updateEnquiryStatus);
router.delete('/:id', requireAuth, requireRole('admin'), ctrl.deleteEnquiry);

module.exports = router;
