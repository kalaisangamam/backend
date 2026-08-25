const router = require('express').Router();
const createGenericController = require('../controllers/genericController');
const { submitStudentTestimonial } = require('../controllers/testimonialsController');
const { requireAuth, requireRole } = require('../middleware/auth');

const ctrl = createGenericController('testimonials', { orderBy: 'display_order' });

router.get('/', ctrl.listPublic);
router.get('/admin', requireAuth, requireRole('admin'), ctrl.listAdmin);
router.post('/submit', requireAuth, requireRole('student'), submitStudentTestimonial);
router.post('/', requireAuth, requireRole('admin'), ctrl.create);
router.put('/:id', requireAuth, requireRole('admin'), ctrl.update);
router.delete('/:id', requireAuth, requireRole('admin'), ctrl.remove);

module.exports = router;
