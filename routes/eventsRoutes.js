const router = require('express').Router();
const ctrl = require('../controllers/eventsController');
const { requireAuth, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/', ctrl.listPublic);
router.get('/hero', ctrl.getHeroEvent);
router.get('/admin', requireAuth, requireRole('admin'), ctrl.listAdmin);
router.post('/', requireAuth, requireRole('admin'), upload.single('image'), ctrl.createEvent);
router.put('/:id', requireAuth, requireRole('admin'), upload.single('image'), ctrl.updateEvent);
router.patch('/:id/close-registration', requireAuth, requireRole('admin'), ctrl.closeRegistration);
router.patch('/:id/archive', requireAuth, requireRole('admin'), ctrl.archiveEvent);
router.delete('/:id', requireAuth, requireRole('admin'), ctrl.deleteEvent);

module.exports = router;
