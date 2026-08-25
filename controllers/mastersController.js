const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');
const ApiError = require('../utils/ApiError');
const { uploadBuffer, deleteAsset } = require('../services/cloudinaryService');

const MASTER_TYPES = ['leadership', 'programme'];
const masterTypeFrom = (value, fallback = 'programme') => value === undefined || value === '' ? fallback : value;
const validateType = (masterType) => {
  if (!MASTER_TYPES.includes(masterType)) throw ApiError.badRequest('master_type must be leadership or programme');
};

const listPublic = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('masters').select('*').eq('status', 'active').order('display_order', { ascending: true });
  if (error) throw ApiError.internal(error.message);
  sendResponse(res, 200, data);
});

const listAdmin = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('masters').select('*').order('display_order', { ascending: true });
  if (error) throw ApiError.internal(error.message);
  sendResponse(res, 200, data);
});

const createMaster = asyncHandler(async (req, res) => {
  const { name, role, programme, specialization, experience_years, achievements, bio, display_order, status } = req.body;
  const master_type = masterTypeFrom(req.body.master_type);
  if (!name || !role) throw ApiError.badRequest('name and role are required');
  validateType(master_type);
  if (master_type === 'programme' && !programme) throw ApiError.badRequest('programme is required for programme masters');
  if (master_type === 'leadership' && !req.file) throw ApiError.badRequest('A profile image is required for leadership masters');

  let photo_url = null;
  let photo_public_id = null;
  if (req.file) {
    const uploaded = await uploadBuffer(req.file.buffer, { folder: 'kalai-sangamam/masters' });
    photo_url = uploaded.url;
    photo_public_id = uploaded.publicId;
  }
  const { data, error } = await supabase.from('masters').insert({
    name, role, master_type, programme: master_type === 'programme' ? programme : null, specialization,
    experience_years: experience_years ? Number(experience_years) : null, achievements, bio,
    display_order: display_order ? Number(display_order) : 0, status: status || 'active', photo_url, photo_public_id,
  }).select().single();
  if (error) throw ApiError.badRequest(error.message);
  sendResponse(res, 201, data, 'Master added successfully');
});

const updateMaster = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { data: existing, error: findError } = await supabase.from('masters').select('*').eq('id', id).single();
  if (findError || !existing) throw ApiError.notFound('Master not found');

  const master_type = masterTypeFrom(req.body.master_type, existing.master_type || 'programme');
  validateType(master_type);
  const programme = req.body.programme === undefined ? existing.programme : req.body.programme;
  if (master_type === 'programme' && !programme) throw ApiError.badRequest('programme is required for programme masters');
  if (master_type === 'leadership' && !req.file && !existing.photo_url) throw ApiError.badRequest('A profile image is required for leadership masters');

  const payload = { master_type, programme: master_type === 'programme' ? programme : null };
  ['name', 'role', 'specialization', 'achievements', 'bio', 'status'].forEach((field) => {
    if (req.body[field] !== undefined) payload[field] = req.body[field];
  });
  if (req.body.experience_years !== undefined) payload.experience_years = req.body.experience_years ? Number(req.body.experience_years) : null;
  if (req.body.display_order !== undefined) payload.display_order = Number(req.body.display_order);
  if (req.file) {
    const uploaded = await uploadBuffer(req.file.buffer, { folder: 'kalai-sangamam/masters' });
    payload.photo_url = uploaded.url;
    payload.photo_public_id = uploaded.publicId;
    if (existing.photo_public_id) await deleteAsset(existing.photo_public_id);
  }
  const { data, error } = await supabase.from('masters').update(payload).eq('id', id).select().single();
  if (error) throw ApiError.badRequest(error.message);
  sendResponse(res, 200, data, 'Master updated successfully');
});

const deleteMaster = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { data: existing } = await supabase.from('masters').select('photo_public_id').eq('id', id).single();
  const { error } = await supabase.from('masters').delete().eq('id', id);
  if (error) throw ApiError.badRequest(error.message);
  if (existing?.photo_public_id) await deleteAsset(existing.photo_public_id);
  sendResponse(res, 200, { id }, 'Master deleted successfully');
});

const reorderMasters = asyncHandler(async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) throw ApiError.badRequest('items array is required');
  await Promise.all(items.map(({ id, display_order }) => supabase.from('masters').update({ display_order }).eq('id', id)));
  sendResponse(res, 200, null, 'Order updated');
});

module.exports = { listPublic, listAdmin, createMaster, updateMaster, deleteMaster, reorderMasters };
