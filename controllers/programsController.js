const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');
const ApiError = require('../utils/ApiError');
const createGenericController = require('./genericController');

const generic = createGenericController('programs', { orderBy: 'display_order' });

// PUT /api/programs/:id/levels (admin) — keeps each programme's progression path independent.
const updateLevels = asyncHandler(async (req, res) => {
  if (!Array.isArray(req.body.levels)) throw ApiError.badRequest('levels must be an array');
  const levels = req.body.levels.map((level) => String(level || '').trim()).filter(Boolean);
  if (new Set(levels.map((level) => level.toLocaleLowerCase())).size !== levels.length) {
    throw ApiError.badRequest('Levels must be unique within a program');
  }
  const { data, error } = await supabase.from('programs').update({ levels }).eq('id', req.params.id).select().single();
  if (error || !data) throw ApiError.badRequest(error?.message || 'Program not found');
  sendResponse(res, 200, data, 'Program levels updated successfully');
});

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

module.exports = { ...generic, getBySlug, updateLevels };
