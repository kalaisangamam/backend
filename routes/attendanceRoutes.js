const router = require('express').Router();
const ctrl = require('../controllers/attendanceController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/me', requireAuth, requireRole('student'), ctrl.getMyAttendance);
router.post('/', requireAuth, requireRole('admin'), ctrl.markAttendance);
router.post('/bulk', requireAuth, requireRole('admin'), ctrl.markAttendanceBulk);
router.get('/student/:studentId', requireAuth, requireRole('admin'), ctrl.getStudentAttendance);

module.exports = router;
