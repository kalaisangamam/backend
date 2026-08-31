const bcrypt = require('bcrypt');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');
const ApiError = require('../utils/ApiError');
const { signToken } = require('../utils/jwt');

// The student dashboard needs the enrolment records as well as the base
// student row.  Keep this query shared by login and session restoration so
// both paths expose the same complete profile.
const getStudentProfile = async (userId) => {
  const { data, error } = await supabase
    .from('students')
    .select('*, student_programs(*, programs(name, slug))')
    .eq('user_id', userId)
    .single();

  if (error || !data) throw ApiError.notFound('Student profile not found');
  return data;
};

// POST /api/auth/login  { username, password }
// Works for both admin and student — role comes from the users table.
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    throw ApiError.badRequest('Username and password are required');
  }

  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username);

  if (error || !users?.length) throw ApiError.unauthorized('Invalid username or password');

  let user = null;
  for (const candidate of users) {
    if (await bcrypt.compare(password, candidate.password_hash)) {
      user = candidate;
      break;
    }
  }

  if (!user) throw ApiError.unauthorized('Invalid username or password');
  if (user.status !== 'active') throw ApiError.forbidden('This account has been deactivated');

  let profile = null;
  if (user.role === 'student') {
    profile = await getStudentProfile(user.id);
  }

  await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);

  const token = signToken({ id: user.id, role: user.role, username: user.username });

  sendResponse(res, 200, {
    token,
    user: { id: user.id, username: user.username, role: user.role, email: user.email },
    profile,
  }, 'Login successful');
});

// GET /api/auth/me
const me = asyncHandler(async (req, res) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, username, role, email, status, created_at')
    .eq('id', req.user.id)
    .single();
  if (error || !user) throw ApiError.notFound('User not found');

  let profile = null;
  if (user.role === 'student') {
    profile = await getStudentProfile(user.id);
  }

  sendResponse(res, 200, { user, profile });
});

// POST /api/auth/change-password  { currentPassword, newPassword }
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    throw ApiError.badRequest('Current and new password are required');
  }
  if (newPassword.length < 6) {
    throw ApiError.badRequest('New password must be at least 6 characters');
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', req.user.id)
    .single();
  if (error || !user) throw ApiError.notFound('User not found');

  const matches = await bcrypt.compare(currentPassword, user.password_hash);
  if (!matches) throw ApiError.unauthorized('Current password is incorrect');

  const password_hash = await bcrypt.hash(newPassword, 10);
  await supabase.from('users').update({ password_hash }).eq('id', user.id);

  sendResponse(res, 200, null, 'Password changed successfully');
});

module.exports = { login, me, changePassword };
