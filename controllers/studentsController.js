const bcrypt = require('bcrypt');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');
const ApiError = require('../utils/ApiError');

const generateStudentCode = async () => {
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from('students')
    .select('id', { count: 'exact', head: true });
  const seq = String((count || 0) + 1).padStart(4, '0');
  return `KS-${year}-${seq}`;
};

// GET /api/students (admin) — optional ?search=&status=
const studentProfileFields = [
  'full_name', 'date_of_birth', 'gender', 'parent_name', 'parent_contact',
  'contact_number', 'address', 'blood_group', 'emergency_contact',
  'joining_date',
];

const buildStudentProfilePayload = (body) => {
  const payload = {};
  studentProfileFields.forEach((field) => {
    if (body[field] !== undefined) payload[field] = body[field];
  });
  return payload;
};

const normalizeProgramIds = (body = {}) => {
  const value = body.program_ids ?? body.program_id;

  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (value) {
    return [value].filter(Boolean);
  }

  return [];
};

const getProgramSelectionData = async (selectedProgramIds) => {
  if (!selectedProgramIds.length) return { program_ids: [], program_names: [] };

  const { data: programs, error } = await supabase
    .from('programs')
    .select('id, name')
    .in('id', selectedProgramIds)
    .eq('status', 'active');

  if (error) throw ApiError.badRequest(error.message);

  const byId = new Map((programs || []).map((program) => [program.id, program.name]));
  return {
    program_ids: selectedProgramIds,
    program_names: selectedProgramIds.map((id) => byId.get(id)).filter(Boolean),
  };
};

// Keep the denormalized fields used by profile/testimonial screens aligned
// with the enrolment table, which is the source of truth for a student's
// registered programs.
const syncStudentPrograms = async (studentId, programIds) => {
  const selectedProgramIds = [...new Set(programIds.filter(Boolean))];
  if (!selectedProgramIds.length) {
    throw ApiError.badRequest('At least one program is required');
  }

  const selection = await getProgramSelectionData(selectedProgramIds);
  if (selection.program_names.length !== selectedProgramIds.length) {
    throw ApiError.badRequest('Please select valid active programs');
  }

  const { data: currentEnrollments, error: currentEnrollmentsError } = await supabase
    .from('student_programs')
    .select('program_id')
    .eq('student_id', studentId);
  if (currentEnrollmentsError) throw ApiError.badRequest(currentEnrollmentsError.message);

  const { error: upsertError } = await supabase
    .from('student_programs')
    .upsert(
      selectedProgramIds.map((program_id) => ({ student_id: studentId, program_id, status: 'active' })),
      { onConflict: 'student_id,program_id' }
    );
  if (upsertError) throw ApiError.badRequest(upsertError.message);

  const removedProgramIds = (currentEnrollments || [])
    .map((enrollment) => enrollment.program_id)
    .filter((programId) => !selectedProgramIds.includes(programId));
  if (removedProgramIds.length) {
    const { error: deactivateError } = await supabase
      .from('student_programs')
      .update({ status: 'inactive' })
      .eq('student_id', studentId)
      .in('program_id', removedProgramIds);
    if (deactivateError) throw ApiError.badRequest(deactivateError.message);
  }

  const { error: profileError } = await supabase
    .from('students')
    .update(selection)
    .eq('id', studentId);
  if (profileError) throw ApiError.badRequest(profileError.message);

  return selection;
};

const createStudentFromPayload = async (body) => {
  const {
    username, password, email, password_hash,
    full_name, date_of_birth, gender, parent_name, parent_contact,
    contact_number, address, blood_group, emergency_contact, joining_date,
  } = body;

  if (!username || (!password && !password_hash) || !full_name) {
    throw ApiError.badRequest('username, password and full_name are required');
  }

  const finalPasswordHash = password_hash || await bcrypt.hash(password, 10);
  const { data: user, error: userError } = await supabase
    .from('users')
    .insert({ role: 'student', username, email, password_hash: finalPasswordHash })
    .select()
    .single();
  if (userError) throw ApiError.conflict(userError.message);

  const student_code = await generateStudentCode();
  const { data: student, error: studentError } = await supabase
    .from('students')
    .insert({
      user_id: user.id,
      student_code,
      full_name,
      date_of_birth,
      gender,
      parent_name,
      parent_contact,
      contact_number,
      address,
      blood_group,
      emergency_contact,
      joining_date,
    })
    .select()
    .single();

  if (studentError) {
    await supabase.from('users').delete().eq('id', user.id);
    throw ApiError.badRequest(studentError.message);
  }

  return { student, user };
};

// GET /api/students (admin) - optional ?search=&status=
const listStudents = asyncHandler(async (req, res) => {
  const { search, status } = req.query;
  let query = supabase.from('students').select('*, users:user_id(username, email, status), student_programs(program_id, current_level, status)');
  if (status) query = query.eq('status', status);
  if (search) query = query.ilike('full_name', `%${search}%`);
  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw ApiError.internal(error.message);
  sendResponse(res, 200, data);
});

const registerStudentRequest = asyncHandler(async (req, res) => {
  const { username, password, email, full_name } = req.body;
  const selectedProgramIds = normalizeProgramIds(req.body);

  if (!username || !password || !full_name || selectedProgramIds.length === 0) {
    throw ApiError.badRequest('username, password, full_name and at least one program are required');
  }
  if (password.length < 6) {
    throw ApiError.badRequest('Password must be at least 6 characters');
  }

  const { data: usernameExists } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .maybeSingle();
  if (usernameExists) throw ApiError.conflict('Username is already in use');

  if (email) {
    const { data: emailExists } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (emailExists) throw ApiError.conflict('Email is already in use');
  }

  const { data: validPrograms, error: validProgramsError } = await supabase
    .from('programs')
    .select('id')
    .in('id', selectedProgramIds)
    .eq('status', 'active');

  if (validProgramsError || validPrograms.length !== selectedProgramIds.length) {
    throw ApiError.badRequest('Please select valid active programs');
  }

  const { data: existingRequest } = await supabase
    .from('student_registration_requests')
    .select('id')
    .eq('username', username)
    .eq('status', 'pending')
    .maybeSingle();
  if (existingRequest) throw ApiError.conflict('A pending request already exists for this username');

  if (email) {
    const { data: existingEmailRequest } = await supabase
      .from('student_registration_requests')
      .select('id')
      .eq('email', email)
      .eq('status', 'pending')
      .maybeSingle();
    if (existingEmailRequest) throw ApiError.conflict('A pending request already exists for this email');
  }

  const password_hash = await bcrypt.hash(password, 10);
  const registrationProgramData = await getProgramSelectionData(selectedProgramIds);
  const { data, error } = await supabase
    .from('student_registration_requests')
    .insert({
      username,
      email,
      password_hash,
      program_id: selectedProgramIds[0],
      program_ids: registrationProgramData.program_ids,
      program_names: registrationProgramData.program_names,
      ...buildStudentProfilePayload(req.body),
    })
    .select('id, username, email, full_name, program_id, program_ids, program_names, date_of_birth, gender, parent_name, parent_contact, contact_number, address, blood_group, emergency_contact, joining_date, status, created_at')
    .single();
  if (error) throw ApiError.badRequest(error.message);

  sendResponse(res, 201, data, 'Registration request submitted successfully');
});

const listRegistrationRequests = asyncHandler(async (req, res) => {
  const { status = 'pending' } = req.query;
  let query = supabase
    .from('student_registration_requests')
    .select('id, username, email, full_name, program_id, program_ids, date_of_birth, gender, parent_name, parent_contact, contact_number, address, blood_group, emergency_contact, joining_date, status, reviewed_by, reviewed_at, created_at, updated_at');
  if (status) query = query.eq('status', status);
  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw ApiError.internal(error.message);
  sendResponse(res, 200, data);
});

const approveRegistrationRequest = asyncHandler(async (req, res) => {
  const { data: request, error } = await supabase
    .from('student_registration_requests')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error || !request) throw ApiError.notFound('Registration request not found');
  if (request.status !== 'pending') throw ApiError.badRequest('Only pending requests can be approved');

  const { student, user } = await createStudentFromPayload(request);
  const selectedProgramIds = normalizeProgramIds(request);
  const programSelectionData = await getProgramSelectionData(selectedProgramIds);

  const { error: studentProgramUpdateError } = await supabase
    .from('students')
    .update({
      program_ids: programSelectionData.program_ids,
      program_names: programSelectionData.program_names,
    })
    .eq('id', student.id);

  if (studentProgramUpdateError) {
    await supabase.from('students').delete().eq('id', student.id);
    await supabase.from('users').delete().eq('id', user.id);
    throw ApiError.badRequest(studentProgramUpdateError.message);
  }

  if (selectedProgramIds.length > 0) {
    const enrollments = selectedProgramIds.map((programId) => ({
      student_id: student.id,
      program_id: programId,
      status: 'active',
    }));

    const { error: enrollmentError } = await supabase
      .from('student_programs')
      .insert(enrollments);
    if (enrollmentError) {
      await supabase.from('students').delete().eq('id', student.id);
      await supabase.from('users').delete().eq('id', user.id);
      throw ApiError.badRequest(enrollmentError.message);
    }
  }

  const { error: updateError } = await supabase
    .from('student_registration_requests')
    .update({ status: 'approved', reviewed_by: req.user.id, reviewed_at: new Date().toISOString() })
    .eq('id', request.id);
  if (updateError) {
    await supabase.from('students').delete().eq('id', student.id);
    await supabase.from('users').delete().eq('id', user.id);
    throw ApiError.badRequest(updateError.message);
  }

  sendResponse(res, 200, student, 'Registration request approved');
});

const rejectRegistrationRequest = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('student_registration_requests')
    .update({ status: 'rejected', reviewed_by: req.user.id, reviewed_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('status', 'pending')
    .select('id, username, email, full_name, status, reviewed_by, reviewed_at, created_at, updated_at')
    .single();
  if (error || !data) throw ApiError.notFound('Pending registration request not found');
  sendResponse(res, 200, data, 'Registration request rejected');
});

// GET /api/students/:id (admin)
const getStudent = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('students')
    .select('*, users:user_id(username, email, status), student_programs(*, programs(name, slug))')
    .eq('id', req.params.id)
    .single();
  if (error || !data) throw ApiError.notFound('Student not found');
  sendResponse(res, 200, data);
});

// POST /api/students (admin) — creates the login (users) + profile (students) rows
const createStudent = asyncHandler(async (req, res) => {
  const selectedProgramIds = normalizeProgramIds(req.body);
  if (selectedProgramIds.length === 0) {
    throw ApiError.badRequest('At least one program is required');
  }

  const { data: validPrograms, error: validProgramsError } = await supabase
    .from('programs')
    .select('id')
    .in('id', selectedProgramIds)
    .eq('status', 'active');

  if (validProgramsError || validPrograms.length !== selectedProgramIds.length) {
    throw ApiError.badRequest('Please select valid active programs');
  }

  const { student, user } = await createStudentFromPayload(req.body);
  const programSelectionData = await getProgramSelectionData(selectedProgramIds);

  const { error: profileUpdateError } = await supabase
    .from('students')
    .update({
      program_ids: programSelectionData.program_ids,
      program_names: programSelectionData.program_names,
    })
    .eq('id', student.id);

  if (profileUpdateError) {
    await supabase.from('students').delete().eq('id', student.id);
    await supabase.from('users').delete().eq('id', user.id);
    throw ApiError.badRequest(profileUpdateError.message);
  }

  const enrollments = selectedProgramIds.map((programId) => ({
    student_id: student.id,
    program_id: programId,
    status: 'active',
  }));

  const { error: enrollmentError } = await supabase
    .from('student_programs')
    .insert(enrollments);

  if (enrollmentError) {
    await supabase.from('students').delete().eq('id', student.id);
    await supabase.from('users').delete().eq('id', user.id);
    throw ApiError.badRequest(enrollmentError.message);
  }

  sendResponse(res, 201, { ...student, username: user.username, program_ids: programSelectionData.program_ids, program_names: programSelectionData.program_names }, 'Student created successfully');
});

// PUT /api/students/:id (admin)
const updateStudent = asyncHandler(async (req, res) => {
  const allowedFields = [
    'full_name', 'date_of_birth', 'gender', 'parent_name', 'parent_contact',
    'contact_number', 'address', 'blood_group', 'emergency_contact',
    'joining_date', 'status', 'notes',
  ];
  const payload = {};
  allowedFields.forEach((f) => {
    if (req.body[f] !== undefined) payload[f] = req.body[f];
  });

  const programSelectionWasProvided = req.body.program_ids !== undefined || req.body.program_id !== undefined;
  if (programSelectionWasProvided) {
    const selectedProgramIds = normalizeProgramIds(req.body);
    const selection = await getProgramSelectionData(selectedProgramIds);
    if (!selectedProgramIds.length || selection.program_names.length !== selectedProgramIds.length) {
      throw ApiError.badRequest('Please select valid active programs');
    }
    payload.program_ids = selection.program_ids;
    payload.program_names = selection.program_names;
  }

  const { data, error } = await supabase
    .from('students')
    .update(payload)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error || !data) throw ApiError.notFound('Student not found');

  if (programSelectionWasProvided) {
    await syncStudentPrograms(data.id, normalizeProgramIds(req.body));
  }
  sendResponse(res, 200, data, 'Student updated successfully');
});

// DELETE /api/students/:id (admin) — deactivates rather than hard-deleting
const deactivateStudent = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('students')
    .update({ status: 'inactive' })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error || !data) throw ApiError.notFound('Student not found');

  await supabase.from('users').update({ status: 'inactive' }).eq('id', data.user_id);
  sendResponse(res, 200, data, 'Student deactivated successfully');
});

// DELETE /api/students/:id/permanent (admin) — deletes the linked user so the
// schema's cascades atomically remove the student and all student-owned records.
const deleteStudentPermanently = asyncHandler(async (req, res) => {
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id, user_id')
    .eq('id', req.params.id)
    .single();
  if (studentError || !student) throw ApiError.notFound('Student not found');

  const { error } = await supabase.from('users').delete().eq('id', student.user_id);
  if (error) throw ApiError.badRequest(`Unable to permanently delete student: ${error.message}`);
  sendResponse(res, 200, { id: student.id }, 'Student permanently deleted');
});

const validateProgramLevel = async (programId, level, { requireActive = true } = {}) => {
  const { data: program, error } = await supabase.from('programs').select('id, name, levels, status').eq('id', programId).maybeSingle();
  if (error) throw ApiError.badRequest(error.message);
  if (!program || (requireActive && program.status !== 'active')) throw ApiError.badRequest('Please select a valid active program');
  const configuredLevels = (program.levels || []).map((item) => String(item).trim()).filter(Boolean);
  if (!configuredLevels.includes(level)) throw ApiError.badRequest(`"${level}" is not a configured level for ${program.name}`);
  return program;
};

// GET /api/students/level-enrollments?program_id=... (admin)
const listLevelEnrollments = asyncHandler(async (req, res) => {
  const programId = req.query.program_id;
  if (!programId) throw ApiError.badRequest('program_id is required');
  const { data, error } = await supabase.from('student_programs')
    .select('id, student_id, program_id, current_level, enrolled_at, students!inner(id, full_name, student_code, status)')
    .eq('program_id', programId).eq('status', 'active').eq('students.status', 'active')
    .order('full_name', { foreignTable: 'students', ascending: true });
  if (error) throw ApiError.internal(error.message);
  sendResponse(res, 200, data || []);
});

// POST /api/students/levels/assign (admin) — assigns one configured level to many active enrolments.
const assignLevelsBulk = asyncHandler(async (req, res) => {
  const { program_id, student_ids, level } = req.body;
  const studentIds = [...new Set((student_ids || []).filter(Boolean))]; const selectedLevel = String(level || '').trim();
  if (!program_id || !studentIds.length || !selectedLevel) throw ApiError.badRequest('program_id, student_ids and level are required');
  await validateProgramLevel(program_id, selectedLevel);
  const { data: enrollments, error } = await supabase.from('student_programs').select('student_id, students!inner(status)')
    .eq('program_id', program_id).eq('status', 'active').eq('students.status', 'active').in('student_id', studentIds);
  if (error) throw ApiError.badRequest(error.message);
  if ((enrollments || []).length !== studentIds.length) throw ApiError.badRequest('Every selected student must be actively enrolled in the selected program');
  const { data, error: updateError } = await supabase.from('student_programs').update({ current_level: selectedLevel })
    .eq('program_id', program_id).eq('status', 'active').in('student_id', studentIds)
    .select('id, student_id, program_id, current_level, students(full_name, student_code)');
  if (updateError) throw ApiError.badRequest(updateError.message);
  sendResponse(res, 200, data || [], `Level assigned to ${studentIds.length} student${studentIds.length === 1 ? '' : 's'}.`);
});

// POST /api/students/:id/programs (admin) — assign a program + level
const assignProgram = asyncHandler(async (req, res) => {
  const { program_id, current_level } = req.body;
  if (!program_id) throw ApiError.badRequest('program_id is required');
  if (current_level !== undefined && current_level !== null && String(current_level).trim()) await validateProgramLevel(program_id, String(current_level).trim());

  const { data, error } = await supabase
    .from('student_programs')
    .upsert(
      { student_id: req.params.id, program_id, current_level, status: 'active' },
      { onConflict: 'student_id,program_id' }
    )
    .select()
    .single();
  if (error) throw ApiError.badRequest(error.message);
  const { data: activeEnrollments, error: activeEnrollmentsError } = await supabase
    .from('student_programs')
    .select('program_id')
    .eq('student_id', req.params.id)
    .eq('status', 'active');
  if (activeEnrollmentsError) throw ApiError.badRequest(activeEnrollmentsError.message);
  await syncStudentPrograms(req.params.id, activeEnrollments.map((enrollment) => enrollment.program_id));
  sendResponse(res, 200, data, 'Program assigned');
});

// GET /api/students/me/profile (student) — own profile
const getMyProfile = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('students')
    .select('*, student_programs(*, programs(name, slug))')
    .eq('user_id', req.user.id)
    .single();
  if (error || !data) throw ApiError.notFound('Student profile not found');
  sendResponse(res, 200, data);
});

module.exports = {
  listStudents,
  registerStudentRequest,
  listRegistrationRequests,
  approveRegistrationRequest,
  rejectRegistrationRequest,
  getStudent,
  createStudent,
  updateStudent,
  deactivateStudent,
  deleteStudentPermanently,
  listLevelEnrollments,
  assignLevelsBulk,
  assignProgram,
  getMyProfile,
};
