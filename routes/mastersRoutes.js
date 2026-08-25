const router = require('express').Router();
const ctrl = require('../controllers/mastersController');
const { requireAuth, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/', ctrl.listPublic);
router.get('/admin', requireAuth, requireRole('admin'), ctrl.listAdmin);
router.post('/', requireAuth, requireRole('admin'), upload.single('photo'), ctrl.createMaster);
router.put('/reorder', requireAuth, requireRole('admin'), ctrl.reorderMasters);
router.put('/:id', requireAuth, requireRole('admin'), upload.single('photo'), ctrl.updateMaster);
router.delete('/:id', requireAuth, requireRole('admin'), ctrl.deleteMaster);

module.exports = router;
