const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');
const ApiError = require('../utils/ApiError');
const { uploadBuffer, deleteAsset } = require('../services/cloudinaryService');

const listPublic = asyncHandler(async (req, res) => {
  const { category } = req.query;
  let query = supabase.from('gallery').select('*').eq('status', 'active').order('display_order', { ascending: true });
  if (category && category !== 'All') query = query.eq('category', category);
  const { data, error } = await query;
  if (error) throw ApiError.internal(error.message);
  sendResponse(res, 200, data);
});

const listAdmin = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('gallery').select('*').order('display_order', { ascending: true });
  if (error) throw ApiError.internal(error.message);
  sendResponse(res, 200, data);
});

// POST /api/gallery (admin, multipart/form-data field 'media')
const createGalleryItem = asyncHandler(async (req, res) => {
  const { title, category, media_type, display_order } = req.body;
  if (!category || !media_type) throw ApiError.badRequest('category and media_type are required');
  if (!req.file) throw ApiError.badRequest('A media file is required');

  const uploaded = await uploadBuffer(req.file.buffer, {
    folder: 'kalai-sangamam/gallery',
    resourceType: media_type === 'video' ? 'video' : 'image',
  });

  const { data, error } = await supabase
    .from('gallery')
    .insert({
      title,
      category,
      media_type,
      image_url: media_type === 'image' ? uploaded.url : null,
      video_url: media_type === 'video' ? uploaded.url : null,
      public_id: uploaded.publicId,
      display_order: display_order ? Number(display_order) : 0,
    })
    .select()
    .single();
  if (error) throw ApiError.badRequest(error.message);
  sendResponse(res, 201, data, 'Gallery item added successfully');
});

const updateGalleryItem = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = {};
  ['title', 'category', 'status', 'display_order'].forEach((f) => {
    if (req.body[f] !== undefined) payload[f] = req.body[f];
  });

  const { data, error } = await supabase.from('gallery').update(payload).eq('id', id).select().single();
  if (error || !data) throw ApiError.notFound('Gallery item not found');
  sendResponse(res, 200, data, 'Gallery item updated');
});

const deleteGalleryItem = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { data: existing } = await supabase.from('gallery').select('public_id, media_type').eq('id', id).single();
  const { error } = await supabase.from('gallery').delete().eq('id', id);
  if (error) throw ApiError.badRequest(error.message);
  if (existing?.public_id) await deleteAsset(existing.public_id, existing.media_type === 'video' ? 'video' : 'image');
  sendResponse(res, 200, { id }, 'Gallery item deleted');
});

const reorderGallery = asyncHandler(async (req, res) => {
  const items = req.body.items;
  if (!Array.isArray(items)) throw ApiError.badRequest('items array is required');
  await Promise.all(
    items.map(({ id, display_order }) => supabase.from('gallery').update({ display_order }).eq('id', id))
  );
  sendResponse(res, 200, null, 'Order updated');
});

module.exports = { listPublic, listAdmin, createGalleryItem, updateGalleryItem, deleteGalleryItem, reorderGallery };
