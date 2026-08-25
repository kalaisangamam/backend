const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');
const ApiError = require('../utils/ApiError');
const { uploadBuffer } = require('../services/cloudinaryService');

const normalizeEventPayload = (payload = {}) => {
  const normalized = { ...payload };

  // Multipart forms send blank optional values as empty strings. Convert them
  // back to null so PostgreSQL date fields remain valid on event updates.
  ['last_date', 'registration_link', 'qr_code_url', 'contact_info', 'image_url'].forEach((field) => {
    if (normalized[field] === '' || normalized[field] === 'null') normalized[field] = null;
  });

  if (normalized.show_on_hero !== undefined) {
    normalized.show_on_hero = normalized.show_on_hero === true || normalized.show_on_hero === 'true';
  }

  return normalized;
};

const clearOtherHeroEvents = async (eventId) => {
  let query = supabase.from('events').update({ show_on_hero: false }).eq('show_on_hero', true);
  if (eventId) query = query.neq('id', eventId);
  const { error } = await query;
  if (error) throw ApiError.internal(error.message);
};

// GET /api/events (public) — only active, upcoming-facing events
const listPublic = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'active')
    .order('event_date', { ascending: true });
  if (error) throw ApiError.internal(error.message);
  sendResponse(res, 200, data);
});

const getHeroEvent = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'active')
    .eq('show_on_hero', true)
    .order('event_date', { ascending: true })
    .limit(1);
  if (error) throw ApiError.internal(error.message);
  sendResponse(res, 200, data?.[0] || null);
});

// GET /api/events/admin (admin) — everything including archived
const listAdmin = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('events').select('*').order('event_date', { ascending: false });
  if (error) throw ApiError.internal(error.message);
  sendResponse(res, 200, data);
});

const createEvent = asyncHandler(async (req, res) => {
  const payload = normalizeEventPayload(req.body);
  if (!payload.title || !payload.event_date) throw ApiError.badRequest('title and event_date are required');
  if (req.file) {
    const uploaded = await uploadBuffer(req.file.buffer, { folder: 'kalai-sangamam/events' });
    payload.image_url = uploaded.url;
  }
  const { data, error } = await supabase.from('events').insert(payload).select().single();
  if (error) throw ApiError.badRequest(error.message);
  if (data.show_on_hero) await clearOtherHeroEvents(data.id);
  sendResponse(res, 201, data, 'Event created');
});

const updateEvent = asyncHandler(async (req, res) => {
  const payload = normalizeEventPayload(req.body);
  if (req.file) {
    const uploaded = await uploadBuffer(req.file.buffer, { folder: 'kalai-sangamam/events' });
    payload.image_url = uploaded.url;
  }
  const { data, error } = await supabase.from('events').update(payload).eq('id', req.params.id).select().single();
  if (error) throw ApiError.badRequest(error.message);
  if (!data) throw ApiError.notFound('Event not found');
  if (data.show_on_hero) await clearOtherHeroEvents(data.id);
  sendResponse(res, 200, data, 'Event updated');
});

// PATCH /api/events/:id/close-registration (admin)
const closeRegistration = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('events')
    .update({ registration_status: 'closed' })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error || !data) throw ApiError.notFound('Event not found');
  sendResponse(res, 200, data, 'Registration closed');
});

// PATCH /api/events/:id/archive (admin) — requires explicit confirmation from the client UI
const archiveEvent = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('events')
    .update({ status: 'archived', archived_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error || !data) throw ApiError.notFound('Event not found');
  sendResponse(res, 200, data, 'Event archived');
});

// DELETE /api/events/:id (admin) — permanent delete, confirmed client-side first
const deleteEvent = asyncHandler(async (req, res) => {
  const { error } = await supabase.from('events').delete().eq('id', req.params.id);
  if (error) throw ApiError.badRequest(error.message);
  sendResponse(res, 200, { id: req.params.id }, 'Event permanently deleted');
});

module.exports = { listPublic, getHeroEvent, listAdmin, createEvent, updateEvent, closeRegistration, archiveEvent, deleteEvent };
