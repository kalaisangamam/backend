const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');
const ApiError = require('../utils/ApiError');

const computeStatus = (feeAmount, paidAmount) => {
  if (paidAmount <= 0) return 'pending';
  if (paidAmount >= feeAmount) return 'paid';
  return 'partially_paid';
};

const withPayments = async (fees = []) => {
  if (!fees.length) return fees;
  const { data: payments, error } = await supabase
    .from('fee_payments')
    .select('id, fee_id, amount, payment_date, payment_note, created_at')
    .in('fee_id', fees.map((fee) => fee.id))
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw ApiError.internal(error.message);
  const grouped = (payments || []).reduce((result, payment) => {
    (result[payment.fee_id] ||= []).push(payment);
    return result;
  }, {});
  return fees.map((fee) => ({ ...fee, payments: grouped[fee.id] || [] }));
};

// GET /api/fees (admin) — optional ?student_id=&month=
const listFees = asyncHandler(async (req, res) => {
  const { student_id, month } = req.query;
  let query = supabase.from('fees').select('*, students(full_name, student_code)').order('created_at', { ascending: false });
  if (student_id) query = query.eq('student_id', student_id);
  if (month) query = query.eq('month', month);
  const { data, error } = await query;
  if (error) throw ApiError.internal(error.message);
  sendResponse(res, 200, await withPayments(data || []));
});

// POST /api/fees (admin) — creates one record per student/month and adds an optional payment to it.
// body: { student_id, month, fee_amount, payment_amount?, payment_date?, payment_note? }
const upsertFee = asyncHandler(async (req, res) => {
  const { student_id, month, fee_amount, payment_amount, payment_date, payment_note } = req.body;
  if (!student_id || !month || fee_amount === undefined) {
    throw ApiError.badRequest('student_id, month and fee_amount are required');
  }

  const amountDue = Number(fee_amount);
  const receivedNow = Number(payment_amount || 0);
  if (!Number.isFinite(amountDue) || amountDue < 0) throw ApiError.badRequest('Fee amount must be a valid positive number');
  if (!Number.isFinite(receivedNow) || receivedNow < 0) throw ApiError.badRequest('Payment amount must be a valid positive number');

  const { data: existing, error: existingError } = await supabase
    .from('fees').select('*').eq('student_id', student_id).eq('month', month).maybeSingle();
  if (existingError) throw ApiError.badRequest(existingError.message);

  const existingFeeAmount = Number(existing?.fee_amount ?? amountDue);
  const existingPaidAmount = Number(existing?.paid_amount || 0);
  const remainingBalance = existingFeeAmount - existingPaidAmount;
  if (receivedNow > remainingBalance) throw ApiError.badRequest('Payment exceeds remaining balance');
  const totalPaid = existingPaidAmount + receivedNow;
  const today = new Date().toISOString().slice(0, 10);
  const { data: fee, error } = await supabase
    .from('fees')
    .upsert({
      student_id,
      month,
      fee_amount: existingFeeAmount,
      paid_amount: totalPaid,
      status: computeStatus(existingFeeAmount, totalPaid),
      payment_date: receivedNow > 0 ? (payment_date || today) : existing?.payment_date || null,
      payment_note: receivedNow > 0 ? (payment_note || null) : existing?.payment_note || null,
      updated_by: req.user.id,
    }, { onConflict: 'student_id,month' })
    .select()
    .single();
  if (error) throw ApiError.badRequest(error.message);

  if (receivedNow > 0) {
    const { error: paymentError } = await supabase.from('fee_payments').insert({
      fee_id: fee.id,
      amount: receivedNow,
      payment_date: payment_date || today,
      payment_note: payment_note || null,
      received_by: req.user.id,
    });
    if (paymentError) throw ApiError.badRequest(paymentError.message);
  }

  sendResponse(res, 200, (await withPayments([fee]))[0], receivedNow > 0 ? 'Payment added to the monthly fee record.' : 'Monthly fee record saved.');
});

const processFeeForStudent = async ({ studentId, month, amountDue, receivedNow, paymentDate, paymentNote, userId }) => {
  const { data: existing, error: existingError } = await supabase
    .from('fees').select('*').eq('student_id', studentId).eq('month', month).maybeSingle();
  if (existingError) throw ApiError.badRequest(existingError.message);

  const feeAmount = Number(existing?.fee_amount ?? amountDue);
  const paidAmount = Number(existing?.paid_amount || 0);
  const remainingBalance = feeAmount - paidAmount;
  if (receivedNow > 0 && remainingBalance <= 0) return { outcome: 'skipped', reason: 'Already fully paid' };
  if (receivedNow > remainingBalance) return { outcome: 'failed', reason: 'Payment exceeds remaining balance' };

  const today = new Date().toISOString().slice(0, 10);
  const totalPaid = paidAmount + receivedNow;
  const { data: fee, error } = await supabase.from('fees').upsert({
    student_id: studentId,
    month,
    // Once created, a monthly fee amount remains the source of truth for its payment history.
    fee_amount: feeAmount,
    paid_amount: totalPaid,
    status: computeStatus(feeAmount, totalPaid),
    payment_date: receivedNow > 0 ? (paymentDate || today) : existing?.payment_date || null,
    payment_note: receivedNow > 0 ? (paymentNote || null) : existing?.payment_note || null,
    updated_by: userId,
  }, { onConflict: 'student_id,month' }).select().single();
  if (error) throw ApiError.badRequest(error.message);

  if (receivedNow > 0) {
    const { error: paymentError } = await supabase.from('fee_payments').insert({
      fee_id: fee.id,
      amount: receivedNow,
      payment_date: paymentDate || today,
      payment_note: paymentNote || null,
      received_by: userId,
    });
    if (paymentError) throw ApiError.badRequest(paymentError.message);
  }
  return { outcome: 'updated', fee };
};

// POST /api/fees/bulk (admin) — process a monthly fee/payment independently for each student.
const upsertFeesBulk = asyncHandler(async (req, res) => {
  const { studentIds, month, monthlyFeeAmount, paymentReceivedNow, paymentDate, paymentNote } = req.body;
  if (!Array.isArray(studentIds) || studentIds.length === 0 || !month || monthlyFeeAmount === undefined) {
    throw ApiError.badRequest('studentIds, month and monthlyFeeAmount are required');
  }
  const amountDue = Number(monthlyFeeAmount);
  const receivedNow = Number(paymentReceivedNow || 0);
  if (!Number.isFinite(amountDue) || amountDue < 0) throw ApiError.badRequest('Monthly fee amount must be a valid non-negative number');
  if (!Number.isFinite(receivedNow) || receivedNow < 0) throw ApiError.badRequest('Payment amount must be a valid non-negative number');

  const uniqueStudentIds = [...new Set(studentIds)];
  const { data: students, error: studentsError } = await supabase
    .from('students').select('id, full_name').in('id', uniqueStudentIds);
  if (studentsError) throw ApiError.internal(studentsError.message);
  if ((students || []).length !== uniqueStudentIds.length) throw ApiError.badRequest('One or more selected students do not exist');

  const studentsById = new Map(students.map((student) => [student.id, student]));
  const results = [];
  for (const studentId of uniqueStudentIds) {
    try {
      const result = await processFeeForStudent({ studentId, month, amountDue, receivedNow, paymentDate, paymentNote, userId: req.user.id });
      results.push({ studentId, studentName: studentsById.get(studentId).full_name, ...result });
    } catch (error) {
      results.push({ studentId, studentName: studentsById.get(studentId).full_name, outcome: 'failed', reason: error.message || 'Unable to save fee' });
    }
  }
  const updated = results.filter((result) => result.outcome === 'updated');
  const skipped = results.filter((result) => result.outcome === 'skipped');
  const failed = results.filter((result) => result.outcome === 'failed');
  sendResponse(res, 200, { updated, skipped, failed, results }, `Fee processing completed for ${uniqueStudentIds.length} students.`);
});

// PATCH /api/fees/:id/status (admin) — retained for existing clients.
const updateFeeStatus = asyncHandler(async (req, res) => {
  const { status, payment_date, payment_note } = req.body;
  if (!status) throw ApiError.badRequest('status is required');
  const { data, error } = await supabase
    .from('fees').update({ status, payment_date, payment_note, updated_by: req.user.id })
    .eq('id', req.params.id).select().single();
  if (error || !data) throw ApiError.notFound('Fee record not found');
  sendResponse(res, 200, data, 'Fee status updated');
});

// GET /api/fees/me (student) — own monthly fees with payment transactions.
const getMyFees = asyncHandler(async (req, res) => {
  const { data: student, error: studentError } = await supabase
    .from('students').select('id').eq('user_id', req.user.id).single();
  if (studentError || !student) throw ApiError.notFound('Student profile not found');
  const { data, error } = await supabase
    .from('fees').select('*').eq('student_id', student.id).order('created_at', { ascending: false });
  if (error) throw ApiError.internal(error.message);
  sendResponse(res, 200, await withPayments(data || []));
});

module.exports = { listFees, upsertFee, upsertFeesBulk, updateFeeStatus, getMyFees };
