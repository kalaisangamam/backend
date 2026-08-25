const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');
const ApiError = require('../utils/ApiError');

// POST /api/attendance (admin) — mark or update a single day
// body: { student_id, program_id, date, status }
const markAttendance = asyncHandler(async (req, res) => {
  const { student_id, program_id, date, status } = req.body;
  if (!student_id || !date || !status) throw ApiError.badRequest('student_id, date and status are required');

  const { data, error } = await supabase
    .from('attendance')
    .upsert(
      { student_id, program_id: program_id || null, date, status, marked_by: req.user.id },
      { onConflict: 'student_id,date' }
    )
    .select()
    .single();
  if (error) throw ApiError.badRequest(error.message);
  sendResponse(res, 200, data, 'Attendance recorded');
});

// POST /api/attendance/bulk (admin) — updates one attendance record per selected student/date.
const markAttendanceBulk = asyncHandler(async (req, res) => {
  const { studentIds, programId, date, status } = req.body;
  if (!Array.isArray(studentIds) || studentIds.length === 0 || !date || !['present', 'absent', 'leave'].includes(status)) {
    throw ApiError.badRequest('studentIds, date and a valid status are required');
  }
  const uniqueStudentIds = [...new Set(studentIds)];
  if (!programId) throw ApiError.badRequest('programId is required');
  const { data: students, error: studentsError } = await supabase
    .from('students')
    .select('id, student_programs!inner(program_id, status)')
    .in('id', uniqueStudentIds)
    .eq('status', 'active')
    .eq('student_programs.program_id', programId)
    .eq('student_programs.status', 'active');
  if (studentsError) throw ApiError.internal(studentsError.message);
  if ((students || []).length !== uniqueStudentIds.length) throw ApiError.badRequest('One or more selected students do not exist');

  const { data, error } = await supabase.from('attendance')
    .upsert(uniqueStudentIds.map((student_id) => ({ student_id, program_id: programId, date, status, marked_by: req.user.id })), { onConflict: 'student_id,date' })
    .select();
  if (error) throw ApiError.badRequest(error.message);
  sendResponse(res, 200, { updated: data || [], count: uniqueStudentIds.length }, `Attendance updated successfully for ${uniqueStudentIds.length} students.`);
});

// GET /api/attendance/student/:studentId (admin) — full history, optional ?month=2026-08
const getStudentAttendance = asyncHandler(async (req, res) => {
  const { month } = req.query;
  let query = supabase.from('attendance').select('*').eq('student_id', req.params.studentId).order('date', { ascending: false });
  if (month) query = query.gte('date', `${month}-01`).lt('date', `${month}-31`);
  const { data, error } = await query;
  if (error) throw ApiError.internal(error.message);

  const total = data.length;
  const present = data.filter((d) => d.status === 'present').length;
  const percentage = total ? Math.round((present / total) * 100) : 0;

  sendResponse(res, 200, { records: data, summary: { total, present, percentage } });
});

// GET /api/attendance/me (student) — own history, optional ?month=2026-08
const getMyAttendance = asyncHandler(async (req, res) => {
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id')
    .eq('user_id', req.user.id)
    .single();
  if (studentError || !student) throw ApiError.notFound('Student profile not found');

  const { month } = req.query;
  let query = supabase.from('attendance').select('*').eq('student_id', student.id).order('date', { ascending: false });
  if (month) query = query.gte('date', `${month}-01`).lt('date', `${month}-31`);
  const { data, error } = await query;
  if (error) throw ApiError.internal(error.message);

  const total = data.length;
  const present = data.filter((d) => d.status === 'present').length;
  const percentage = total ? Math.round((present / total) * 100) : 0;

  sendResponse(res, 200, { records: data, summary: { total, present, percentage } });
});

module.exports = { markAttendance, markAttendanceBulk, getStudentAttendance, getMyAttendance };
