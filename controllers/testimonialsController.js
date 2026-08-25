const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');
const ApiError = require('../utils/ApiError');

// POST /api/testimonials/submit (student)
// Student identity and programme are derived from the authenticated profile,
// rather than trusting values provided by the browser.
const submitStudentTestimonial = asyncHandler(async (req, res) => {
  const message = req.body.message?.trim();
  if (!message) throw ApiError.badRequest('A testimonial message is required');

  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('full_name, program_names, student_programs(status, programs(name))')
    .eq('user_id', req.user.id)
    .single();
  if (studentError || !student) throw ApiError.notFound('Student profile not found');

  const enrolledPrograms = (student.student_programs || [])
    .filter((enrollment) => enrollment.status === 'active' || !enrollment.status)
    .map((enrollment) => enrollment.programs?.name)
    .filter(Boolean);
  const programNames = enrolledPrograms.length ? enrolledPrograms : (student.program_names || []);
  const program = programNames.length ? programNames.join(', ') : null;

  const designation = req.body.designation?.trim() || null;

  const { data, error } = await supabase
    .from('testimonials')
    .insert({ student_name: student.full_name, message, program, designation, display_order: 0, status: 'active' })
    .select()
    .single();
  if (error) throw ApiError.badRequest(error.message);

  sendResponse(res, 201, data, 'Thank you for sharing your testimonial');
});

module.exports = { submitStudentTestimonial };
