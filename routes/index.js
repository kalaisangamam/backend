const router = require('express').Router();

router.use('/auth', require('./authRoutes'));
router.use('/students', require('./studentsRoutes'));
router.use('/programs', require('./programsRoutes'));
router.use('/masters', require('./mastersRoutes'));
router.use('/achievements', require('./achievementsRoutes'));
router.use('/gallery', require('./galleryRoutes'));
router.use('/announcements', require('./announcementsRoutes'));
router.use('/events', require('./eventsRoutes'));
router.use('/testimonials', require('./testimonialsRoutes'));
router.use('/faqs', require('./faqRoutes'));
router.use('/attendance', require('./attendanceRoutes'));
router.use('/fees', require('./feesRoutes'));
router.use('/settings', require('./settingsRoutes'));
router.use('/dashboard', require('./dashboardRoutes'));
router.use('/contact-enquiries', require('./contactEnquiriesRoutes'));

module.exports = router;
