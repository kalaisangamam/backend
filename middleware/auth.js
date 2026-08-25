const { verifyToken } = require('../utils/jwt');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// Verifies the Bearer token and attaches { id, role, username } to req.user
const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    throw ApiError.unauthorized('Authentication token missing');
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded; // { id, role, username }
    next();
  } catch (err) {
    throw ApiError.unauthorized('Invalid or expired token');
  }
});

// Restricts a route to one or more roles, e.g. requireRole('admin')
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    throw ApiError.forbidden('You do not have permission to perform this action');
  }
  next();
};

module.exports = { requireAuth, requireRole };
