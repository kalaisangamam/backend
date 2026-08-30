const router = require('express').Router();
const ctrl = require('../controllers/programsController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', ctrl.listPublic);
router.get('/admin', requireAuth, requireRole('admin'), ctrl.listAdmin);
router.get('/slug/:slug', ctrl.getBySlug);
router.get('/:id', ctrl.getOne);
router.post('/', requireAuth, requireRole('admin'), ctrl.create);
router.put('/:id/levels', requireAuth, requireRole('admin'), ctrl.updateLevels);
router.put('/:id', requireAuth, requireRole('admin'), ctrl.update);
router.delete('/:id', requireAuth, requireRole('admin'), ctrl.remove);

module.exports = router;
