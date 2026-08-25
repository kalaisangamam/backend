const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');
const ApiError = require('../utils/ApiError');
const createGenericController = require('./genericController');

const generic = createGenericController('programs', { orderBy: 'display_order' });

// GET /api/programs/slug/:slug (public)
const getBySlug = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('programs')
    .select('*')
    .eq('slug', req.params.slug)
    .eq('status', 'active')
    .single();
  if (error || !data) throw ApiError.notFound('Program not found');
  sendResponse(res, 200, data);
});

module.exports = { ...generic, getBySlug };
