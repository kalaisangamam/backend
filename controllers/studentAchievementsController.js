const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');
const ApiError = require('../utils/ApiError');

const selection = '*, students(id, full_name, student_code), programs(name)';

const validateEnrollment = async (studentId, programId) => {
  const { data, error } = await supabase.from('student_programs').select('id')
    .eq('student_id', studentId).eq('program_id', programId).eq('status', 'active').maybeSingle();
  if (error) throw ApiError.internal(error.message);
  if (!data) throw ApiError.badRequest('The student must be actively enrolled in the selected program');
};

const listAdmin = asyncHandler(async (req, res) => {
  let query = supabase.from('student_achievements').select(selection).order('achievement_date', { ascending: false });
  if (req.query.program_id) query = query.eq('program_id', req.query.program_id);
  if (req.query.student_id) query = query.eq('student_id', req.query.student_id);
  if (req.query.date) query = query.eq('achievement_date', req.query.date);
  const { data, error } = await query;
  if (error) throw ApiError.internal(error.message);
  sendResponse(res, 200, data || []);
});

const listMine = asyncHandler(async (req, res) => {
  const { data: student, error: studentError } = await supabase.from('students').select('id').eq('user_id', req.user.id).single();
  if (studentError || !student) throw ApiError.notFound('Student profile not found');
  const { data, error } = await supabase.from('student_achievements').select('*, programs(name)')
    .eq('student_id', student.id).order('achievement_date', { ascending: false });
  if (error) throw ApiError.internal(error.message);
  sendResponse(res, 200, data || []);
});

const validatePayload = async (body) => {
  const student_id = String(body.student_id || '').trim();
  const program_id = String(body.program_id || '').trim();
  const achievement_date = String(body.achievement_date || '').trim();
  const title = String(body.title || '').trim();
  const achievement = String(body.achievement || '').trim();
  if (!student_id || !program_id || !achievement_date || !title || !achievement) {
    throw ApiError.badRequest('Program, student, date, title and achievement are required');
  }
  const parsedDate = new Date(`${achievement_date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(achievement_date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== achievement_date) {
    throw ApiError.badRequest('Please provide a valid achievement date');
  }
  await validateEnrollment(student_id, program_id);
  return { student_id, program_id, achievement_date, title, achievement };
};

const create = asyncHandler(async (req, res) => {
  const payload = await validatePayload(req.body);
  const { data, error } = await supabase.from('student_achievements').insert(payload).select(selection).single();
  if (error) throw ApiError.badRequest(error.message);
  sendResponse(res, 201, data, 'Achievement added successfully.');
});

const update = asyncHandler(async (req, res) => {
  const payload = await validatePayload(req.body);
  const { data, error } = await supabase.from('student_achievements').update(payload).eq('id', req.params.id).select(selection).single();
  if (error || !data) throw ApiError.notFound('Achievement not found');
  sendResponse(res, 200, data, 'Achievement updated successfully.');
});

const remove = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('student_achievements').delete().eq('id', req.params.id).select('id').single();
  if (error || !data) throw ApiError.notFound('Achievement not found');
  sendResponse(res, 200, data, 'Achievement deleted successfully.');
});

module.exports = { listAdmin, listMine, create, update, remove };
