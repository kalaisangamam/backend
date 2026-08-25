const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');
const ApiError = require('../utils/ApiError');
const { uploadBuffer } = require('../services/cloudinaryService');

const normaliseBranchId = (value) => (value === undefined || value === '' || value === 'common' ? null : value);
const scopedAnnouncements = (query, branchId) => {
  if (!branchId) return query.is('branch_id', null);
  return query.or(`branch_id.is.null,branch_id.eq.${branchId}`);
};

const listPublic = asyncHandler(async (req, res) => {
  const { data, error } = await scopedAnnouncements(supabase
    .from('announcements')
    .select('*, branches(name)')
    .eq('status', 'active')
    .order('created_at', { ascending: false }), req.query.branch_id);
  if (error) throw ApiError.internal(error.message);
  sendResponse(res, 200, data);
});

// GET /api/announcements/hero (public) — the single most relevant one for the Hero card
const getHeroAnnouncement = asyncHandler(async (req, res) => {
  const { data, error } = await scopedAnnouncements(supabase
    .from('announcements')
    .select('*, branches(name)')
    .eq('status', 'active')
    .eq('show_on_hero', true)
    .order('created_at', { ascending: false })
    .limit(1), req.query.branch_id);
  if (error) throw ApiError.internal(error.message);
  sendResponse(res, 200, data?.[0] || null);
});

const listAdmin = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('announcements').select('*, branches(name)').order('created_at', { ascending: false });
  if (error) throw ApiError.internal(error.message);
  sendResponse(res, 200, data);
});

// POST /api/announcements (admin, multipart/form-data, optional 'image' file)
// Admin may either upload an image file (stored via Cloudinary → URL saved) or
// paste an image_url directly — either way only the URL string is persisted.
const createAnnouncement = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  if (!payload.title) throw ApiError.badRequest('title is required');
  if (payload.show_on_hero !== undefined) payload.show_on_hero = payload.show_on_hero === 'true' || payload.show_on_hero === true;
  payload.branch_id = normaliseBranchId(payload.branch_id);

  if (req.file) {
    const uploaded = await uploadBuffer(req.file.buffer, { folder: 'kalai-sangamam/announcements' });
    payload.image_url = uploaded.url;
  }

  const { data, error } = await supabase.from('announcements').insert(payload).select().single();
  if (error) throw ApiError.badRequest(error.message);
  sendResponse(res, 201, data, 'Announcement created');
});

const updateAnnouncement = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  if (payload.show_on_hero !== undefined) payload.show_on_hero = payload.show_on_hero === 'true' || payload.show_on_hero === true;
  if (payload.branch_id !== undefined) payload.branch_id = normaliseBranchId(payload.branch_id);

  if (req.file) {
    const uploaded = await uploadBuffer(req.file.buffer, { folder: 'kalai-sangamam/announcements' });
    payload.image_url = uploaded.url;
  }

  const { data, error } = await supabase.from('announcements').update(payload).eq('id', req.params.id).select().single();
  if (error || !data) throw ApiError.notFound('Announcement not found');
  sendResponse(res, 200, data, 'Announcement updated');
});

const deleteAnnouncement = asyncHandler(async (req, res) => {
  const { error } = await supabase.from('announcements').delete().eq('id', req.params.id);
  if (error) throw ApiError.badRequest(error.message);
  sendResponse(res, 200, { id: req.params.id }, 'Announcement deleted');
});

module.exports = { listPublic, getHeroAnnouncement, listAdmin, createAnnouncement, updateAnnouncement, deleteAnnouncement };
