const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');
const ApiError = require('../utils/ApiError');
const { uploadBuffer } = require('../services/cloudinaryService');

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

module.exports = { getSetting, updateSetting, uploadPaymentQr };
