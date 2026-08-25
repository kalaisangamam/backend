const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');
const ApiError = require('../utils/ApiError');
const { uploadBuffer } = require('../services/cloudinaryService');

const branchFields = ['name', 'address', 'map_url', 'contact_number_1', 'contact_number_2', 'contact_number_3', 'email', 'working_hours', 'status', 'display_order'];
const branchPayload = (body) => Object.fromEntries(branchFields.filter((field) => body[field] !== undefined).map((field) => [field, field === 'display_order' ? Number(body[field] || 0) : body[field]]));

// GET /api/settings/:key (public) — e.g. /api/settings/payment_info
const getSetting = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('settings').select('*').eq('key', req.params.key).single();
  if (error || !data) throw ApiError.notFound('Setting not found');
  sendResponse(res, 200, data.value);
});

// PUT /api/settings/:key (admin) — body is the full JSON value to store
const updateSetting = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('settings')
    .upsert({ key: req.params.key, value: req.body }, { onConflict: 'key' })
    .select()
    .single();
  if (error) throw ApiError.badRequest(error.message);
  sendResponse(res, 200, data.value, 'Settings updated');
});

// POST /api/settings/payment-qr (admin, multipart 'qr') — convenience endpoint
// to upload just the payment QR image and merge it into payment_info
const uploadPaymentQr = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('QR image file is required');
  const uploaded = await uploadBuffer(req.file.buffer, { folder: 'kalai-sangamam/settings' });

  const { data: existing } = await supabase.from('settings').select('value').eq('key', 'payment_info').single();
  const merged = { ...(existing?.value || {}), upi_qr_url: uploaded.url };

  const { data, error } = await supabase
    .from('settings')
    .upsert({ key: 'payment_info', value: merged }, { onConflict: 'key' })
    .select()
    .single();
  if (error) throw ApiError.badRequest(error.message);
  sendResponse(res, 200, data.value, 'Payment QR updated');
});

const listBranches = asyncHandler(async (req, res) => {
  const query = supabase.from('branches').select('*').order('display_order', { ascending: true });
  if (!req.user || req.user.role !== 'admin') query.eq('status', 'active');
  const { data, error } = await query;
  if (error) throw ApiError.internal(error.message);
  sendResponse(res, 200, data);
});

const createBranch = asyncHandler(async (req, res) => {
  const payload = branchPayload(req.body);
  if (!payload.name?.trim()) throw ApiError.badRequest('Branch name is required');
  const { data, error } = await supabase.from('branches').insert({ ...payload, name: payload.name.trim() }).select().single();
  if (error) throw ApiError.badRequest(error.message);
  sendResponse(res, 201, data, 'Branch created');
});

const updateBranch = asyncHandler(async (req, res) => {
  const payload = branchPayload(req.body);
  if (payload.name !== undefined && !payload.name.trim()) throw ApiError.badRequest('Branch name is required');
  const { data, error } = await supabase.from('branches').update(payload).eq('id', req.params.id).select().single();
  if (error || !data) throw ApiError.notFound('Branch not found');
  sendResponse(res, 200, data, 'Branch updated');
});

module.exports = { getSetting, updateSetting, uploadPaymentQr, listBranches, createBranch, updateBranch };
