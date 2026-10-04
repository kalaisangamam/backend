const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');
const ApiError = require('../utils/ApiError');
const createGenericController = require('./genericController');

const generic = createGenericController('programs', { orderBy: 'display_order' });

const validateSchedule = (schedule) => {
  if (schedule === undefined) return;
  if (!Array.isArray(schedule)) throw ApiError.badRequest('schedule must be an array');
  schedule.forEach((entry, index) => {
    if (!entry || typeof entry.branch !== 'string' || !entry.branch.trim()) throw ApiError.badRequest(`Schedule ${index + 1}: branch is required`);
    if (!Array.isArray(entry.days) || entry.days.length === 0) throw ApiError.badRequest(`Schedule ${index + 1}: select at least one day`);
    if (!/^\d{2}:\d{2}$/.test(entry.start_time || '') || !/^\d{2}:\d{2}$/.test(entry.end_time || '') || entry.start_time >= entry.end_time) {
      throw ApiError.badRequest(`Schedule ${index + 1}: enter a valid time range with the end after the start`);
    }
  });
};
const create = asyncHandler(async (req, res) => { validateSchedule(req.body.schedule); return generic.create(req, res); });
const update = asyncHandler(async (req, res) => { validateSchedule(req.body.schedule); return generic.update(req, res); });

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

module.exports = { ...generic, create, update, getBySlug, updateLevels };
