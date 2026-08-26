const router = require('express').Router();
const ctrl = require('../controllers/studentsController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Student self-service (must come before /:id to avoid collision)
router.get('/me/profile', requireAuth, requireRole('student'), ctrl.getMyProfile);
router.post('/register', ctrl.registerStudentRequest);

// Admin management
router.get('/requests', requireAuth, requireRole('admin'), ctrl.listRegistrationRequests);
router.post('/requests/:id/approve', requireAuth, requireRole('admin'), ctrl.approveRegistrationRequest);
router.post('/requests/:id/reject', requireAuth, requireRole('admin'), ctrl.rejectRegistrationRequest);
router.get('/level-enrollments', requireAuth, requireRole('admin'), ctrl.listLevelEnrollments);
router.post('/levels/assign', requireAuth, requireRole('admin'), ctrl.assignLevelsBulk);
router.get('/', requireAuth, requireRole('admin'), ctrl.listStudents);
router.get('/:id', requireAuth, requireRole('admin'), ctrl.getStudent);
router.post('/', requireAuth, requireRole('admin'), ctrl.createStudent);
router.put('/:id', requireAuth, requireRole('admin'), ctrl.updateStudent);
router.delete('/:id/permanent', requireAuth, requireRole('admin'), ctrl.deleteStudentPermanently);
router.delete('/:id', requireAuth, requireRole('admin'), ctrl.deactivateStudent);
router.post('/:id/programs', requireAuth, requireRole('admin'), ctrl.assignProgram);

module.exports = router;
