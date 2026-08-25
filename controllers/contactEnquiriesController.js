const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');
const ApiError = require('../utils/ApiError');

const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// POST /api/contact-enquiries (public)
const createEnquiry = asyncHandler(async (req, res) => {
  const enquiryType = cleanText(req.body.enquiry_type);
  const name = cleanText(req.body.name);
  const phone = cleanText(req.body.phone);
  const email = cleanText(req.body.email);
  const message = cleanText(req.body.message);

  if (!['general', 'enrolment', 'event'].includes(enquiryType)) {
    throw ApiError.badRequest('Please select a valid enquiry type');
  }
  if (!name || !phone) throw ApiError.badRequest('Name and phone number are required');
  if (email && !isEmail(email)) throw ApiError.badRequest('Please enter a valid email address');

  const payload = {
    enquiry_type: enquiryType,
    name,
    phone,
    email: email || null,
    message: message || null,
    subject: cleanText(req.body.subject) || null,
    game: cleanText(req.body.game) || null,
    preferred_branch: cleanText(req.body.preferred_branch) || null,
    event_name: cleanText(req.body.event_name) || null,
  };

  if (enquiryType === 'general' && !payload.subject) {
    throw ApiError.badRequest('Subject is required for a general enquiry');
  }
  if (enquiryType === 'enrolment') {
    const age = Number(req.body.age);
    if (!payload.game || !payload.preferred_branch || !Number.isInteger(age) || age < 3 || age > 80) {
      throw ApiError.badRequest('Program, age, and preferred branch are required for an enrolment enquiry');
    }
    payload.age = age;
  }
  if (enquiryType === 'event' && (!payload.event_name || !message)) {
    throw ApiError.badRequest('Event name and message are required for an event enquiry');
  }

  const { data, error } = await supabase.from('contact_enquiries').insert(payload).select().single();
  if (error) throw ApiError.badRequest(error.message);
  sendResponse(res, 201, data, 'Enquiry submitted successfully');
});

// GET /api/contact-enquiries (admin)
const listEnquiries = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('contact_enquiries')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw ApiError.badRequest(error.message);
  sendResponse(res, 200, data || []);
});

// PATCH /api/contact-enquiries/:id/status (admin)
const updateEnquiryStatus = asyncHandler(async (req, res) => {
  const status = cleanText(req.body.status);
  if (!['new', 'read', 'closed'].includes(status)) throw ApiError.badRequest('Please select a valid status');
  const { data, error } = await supabase
    .from('contact_enquiries')
    .update({ status })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) throw ApiError.badRequest(error.message);
  sendResponse(res, 200, data, 'Enquiry status updated');
});

// DELETE /api/contact-enquiries/:id (admin)
const deleteEnquiry = asyncHandler(async (req, res) => {
  const { error } = await supabase.from('contact_enquiries').delete().eq('id', req.params.id);
  if (error) throw ApiError.badRequest(error.message);
  sendResponse(res, 200, null, 'Enquiry deleted successfully');
});

module.exports = { createEnquiry, listEnquiries, updateEnquiryStatus, deleteEnquiry };
