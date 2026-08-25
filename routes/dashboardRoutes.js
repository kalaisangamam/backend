const router = require('express').Router();
const ctrl = require('../controllers/dashboardController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/overview', requireAuth, requireRole('admin'), ctrl.getOverview);

module.exports = router;
