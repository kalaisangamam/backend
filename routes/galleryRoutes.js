const router = require('express').Router();
const ctrl = require('../controllers/galleryController');
const { requireAuth, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/', ctrl.listPublic);
router.get('/admin', requireAuth, requireRole('admin'), ctrl.listAdmin);
router.post('/', requireAuth, requireRole('admin'), upload.single('media'), ctrl.createGalleryItem);
router.put('/reorder', requireAuth, requireRole('admin'), ctrl.reorderGallery);
router.put('/:id', requireAuth, requireRole('admin'), ctrl.updateGalleryItem);
router.delete('/:id', requireAuth, requireRole('admin'), ctrl.deleteGalleryItem);

module.exports = router;
