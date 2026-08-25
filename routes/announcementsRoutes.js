const router = require('express').Router();
const ctrl = require('../controllers/announcementsController');
const { requireAuth, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/', ctrl.listPublic);
router.get('/hero', ctrl.getHeroAnnouncement);
router.get('/admin', requireAuth, requireRole('admin'), ctrl.listAdmin);
router.post('/', requireAuth, requireRole('admin'), upload.single('image'), ctrl.createAnnouncement);
router.put('/:id', requireAuth, requireRole('admin'), upload.single('image'), ctrl.updateAnnouncement);
router.delete('/:id', requireAuth, requireRole('admin'), ctrl.deleteAnnouncement);

module.exports = router;
