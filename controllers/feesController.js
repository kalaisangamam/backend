const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');
const ApiError = require('../utils/ApiError');

const n = (value) => Number(value || 0);
const statusFor = (fee, paid) => (paid <= 0 ? 'pending' : paid >= fee ? 'paid' : 'partially_paid');
const safePdf = (value) => String(value ?? '').replace(/[()\\]/g, '\\$&').replace(/[^\x20-\x7E]/g, ' ');

const withPayments = async (fees = []) => {
  if (!fees.length) return fees;
  const { data, error } = await supabase.from('fee_payments').select('id, fee_id, amount, payment_date, payment_note, created_at').in('fee_id', fees.map((fee) => fee.id)).order('payment_date', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw ApiError.internal(error.message);
  const grouped = (data || []).reduce((all, payment) => { (all[payment.fee_id] ||= []).push(payment); return all; }, {});
  return fees.map((fee) => ({ ...fee, payments: grouped[fee.id] || [] }));
};

const feeQuery = ({ student_id, programme_id, month, status } = {}) => {
  let query = supabase.from('fees').select('*, students(full_name, student_code), programs:programme_id(id, name)').order('created_at', { ascending: false });
  if (student_id) query = query.eq('student_id', student_id);
  if (programme_id) query = query.eq('programme_id', programme_id);
  if (month) query = query.eq('month', month);
  if (status) query = query.eq('status', status);
  return query;
};

const listFees = asyncHandler(async (req, res) => {
  const { data, error } = await feeQuery(req.query);
  if (error) throw ApiError.internal(error.message);
  sendResponse(res, 200, await withPayments(data || []));
});

const listStudentsByProgramme = asyncHandler(async (req, res) => {
  if (!req.query.programme_id) throw ApiError.badRequest('programme_id is required');
  const { data, error } = await supabase.from('student_programs').select('students!inner(id, full_name, student_code, status)').eq('program_id', req.query.programme_id).eq('status', 'active').eq('students.status', 'active');
  if (error) throw ApiError.internal(error.message);
  sendResponse(res, 200, (data || []).map((item) => item.students).filter(Boolean).sort((a, b) => a.full_name.localeCompare(b.full_name)));
});

const confirmEnrollment = async (studentId, programmeId) => {
  const { data, error } = await supabase.from('student_programs').select('id').eq('student_id', studentId).eq('program_id', programmeId).eq('status', 'active').maybeSingle();
  if (error) throw ApiError.badRequest(error.message);
  if (!data) throw ApiError.badRequest('The student is not actively enrolled in the selected programme');
};

const process = async ({ studentId, programmeId, month, amountDue, receivedNow, paymentDate, paymentNote, userId }) => {
  await confirmEnrollment(studentId, programmeId);
  const { data: old, error: oldError } = await supabase.from('fees').select('*').eq('student_id', studentId).eq('programme_id', programmeId).eq('month', month).maybeSingle();
  if (oldError) throw ApiError.badRequest(oldError.message);
  const feeAmount = n(old?.fee_amount ?? amountDue); const paid = n(old?.paid_amount); const balance = feeAmount - paid;
  if (receivedNow > 0 && balance <= 0) return { outcome: 'skipped', reason: `${month} fee is already fully paid.` };
  if (receivedNow > balance) return { outcome: 'failed', reason: `Payment amount cannot exceed the remaining balance of Rs. ${balance}.` };
  const today = new Date().toISOString().slice(0, 10);
  const { data: fee, error } = await supabase.from('fees').upsert({ student_id: studentId, programme_id: programmeId, month, fee_amount: feeAmount, paid_amount: paid + receivedNow, status: statusFor(feeAmount, paid + receivedNow), payment_date: receivedNow ? (paymentDate || today) : old?.payment_date || null, payment_note: receivedNow ? (paymentNote || null) : old?.payment_note || null, updated_by: userId }, { onConflict: 'student_id,programme_id,month' }).select('*, students(full_name, student_code), programs:programme_id(id, name)').single();
  if (error) throw ApiError.badRequest(error.message);
  if (receivedNow) {
    const { error: paymentError } = await supabase.from('fee_payments').insert({ fee_id: fee.id, amount: receivedNow, payment_date: paymentDate || today, payment_note: paymentNote || null, received_by: userId });
    if (paymentError) throw ApiError.badRequest(paymentError.message);
  }
  return { outcome: 'updated', fee: (await withPayments([fee]))[0] };
};

const upsertFee = asyncHandler(async (req, res) => {
  const { student_id, programme_id, month, fee_amount, payment_amount, payment_date, payment_note } = req.body;
  if (!student_id || !programme_id || !month || fee_amount === undefined) throw ApiError.badRequest('student_id, programme_id, month and fee_amount are required');
  const amountDue = n(fee_amount); const receivedNow = n(payment_amount);
  if (!Number.isFinite(amountDue) || amountDue < 0 || !Number.isFinite(receivedNow) || receivedNow < 0) throw ApiError.badRequest('Fee and payment amounts must be valid non-negative numbers');
  const result = await process({ studentId: student_id, programmeId: programme_id, month, amountDue, receivedNow, paymentDate: payment_date, paymentNote: payment_note, userId: req.user.id });
  if (result.outcome !== 'updated') throw ApiError.badRequest(result.reason);
  sendResponse(res, 200, result.fee, receivedNow ? 'Payment added to the monthly fee record.' : 'Monthly fee record saved.');
});

const upsertFeesBulk = asyncHandler(async (req, res) => {
  const { studentIds, programmeId, month, monthlyFeeAmount, paymentReceivedNow, paymentDate, paymentNote } = req.body;
  if (!Array.isArray(studentIds) || !studentIds.length || !programmeId || !month || monthlyFeeAmount === undefined) throw ApiError.badRequest('studentIds, programmeId, month and monthlyFeeAmount are required');
  const amountDue = n(monthlyFeeAmount); const receivedNow = n(paymentReceivedNow);
  if (!Number.isFinite(amountDue) || amountDue < 0 || !Number.isFinite(receivedNow) || receivedNow < 0) throw ApiError.badRequest('Fee and payment amounts must be valid non-negative numbers');
  const ids = [...new Set(studentIds)]; const { data: students, error } = await supabase.from('students').select('id, full_name').in('id', ids);
  if (error) throw ApiError.internal(error.message); if ((students || []).length !== ids.length) throw ApiError.badRequest('One or more selected students do not exist');
  const named = new Map(students.map((student) => [student.id, student.full_name])); const results = [];
  for (const studentId of ids) { try { results.push({ studentId, studentName: named.get(studentId), ...(await process({ studentId, programmeId, month, amountDue, receivedNow, paymentDate, paymentNote, userId: req.user.id })) }); } catch (err) { results.push({ studentId, studentName: named.get(studentId), outcome: 'failed', reason: err.message || 'Unable to save fee' }); } }
  const pick = (outcome) => results.filter((item) => item.outcome === outcome);
  sendResponse(res, 200, { updated: pick('updated'), skipped: pick('skipped'), failed: pick('failed'), results }, `Fee processing completed for ${ids.length} students.`);
});

const summarize = (fees) => Object.values(fees.reduce((all, fee) => {
  const group = all[fee.month] ||= { month: fee.month, fees: [], studentSet: new Set(), programmeSet: new Set(), total_fee: 0, total_paid: 0, total_balance: 0, total_transactions: 0 };
  group.fees.push(fee); group.studentSet.add(fee.student_id); if (fee.programme_id) group.programmeSet.add(fee.programme_id); group.total_fee += n(fee.fee_amount); group.total_paid += n(fee.paid_amount); group.total_balance += n(fee.pending_amount); group.total_transactions += fee.payments.length; return all;
}, {})).map(({ studentSet, programmeSet, ...group }) => ({ ...group, total_students: studentSet.size, total_programmes: programmeSet.size }));

const getMonthlyHistory = asyncHandler(async (req, res) => {
  const { data, error } = await feeQuery({ month: req.query.month }); if (error) throw ApiError.internal(error.message);
  const history = summarize(await withPayments(data || [])).sort((a, b) => new Date(`1 ${b.month}`) - new Date(`1 ${a.month}`));
  sendResponse(res, 200, history);
});

const pdf = (history) => {
  const lines = ['KALAI SANGAMAM ACADEMY', 'MONTHLY FEE HISTORY', history.month.toUpperCase(), '', `Total Students: ${history.total_students}`, `Total Fee: Rs. ${history.total_fee}`, `Total Paid: Rs. ${history.total_paid}`, `Total Balance: Rs. ${history.total_balance}`, `Total Transactions: ${history.total_transactions}`, '', 'STUDENT ID | STUDENT | PROGRAMME | FEE | PAID | BALANCE | STATUS'];
  history.fees.forEach((fee) => lines.push(`${fee.students?.student_code || '-'} | ${fee.students?.full_name || '-'} | ${fee.programs?.name || 'Unassigned'} | Rs. ${fee.fee_amount} | Rs. ${fee.paid_amount} | Rs. ${fee.pending_amount} | ${fee.status}`)); lines.push('', 'PAYMENT TRANSACTIONS'); history.fees.forEach((fee) => fee.payments.forEach((payment) => lines.push(`${fee.students?.full_name || '-'} | ${fee.programs?.name || 'Unassigned'} | ${payment.payment_date} | Rs. ${payment.amount} | ${payment.payment_note || '-'}`)));
  const pages = []; for (let i = 0; i < lines.length; i += 42) pages.push(lines.slice(i, i + 42)); const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`];
  pages.forEach((page, i) => { const pageNo = 3 + i * 2; const contentNo = pageNo + 1; const content = `BT /F1 10 Tf 40 800 Td 14 TL ${page.map((line, index) => `${index ? 'T* ' : ''}(${safePdf(line)}) Tj`).join('\n')} ET`; objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${contentNo} 0 R >>`, `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`); });
  let output = '%PDF-1.4\n'; const offsets = [0]; objects.forEach((object, i) => { offsets.push(Buffer.byteLength(output)); output += `${i + 1} 0 obj\n${object}\nendobj\n`; }); const start = Buffer.byteLength(output); output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`; return Buffer.from(output);
};

const downloadMonthlyPdf = asyncHandler(async (req, res) => {
  const month = req.params.month; const { data, error } = await feeQuery({ month }); if (error) throw ApiError.internal(error.message);
  const histories = summarize(await withPayments(data || [])); if (!histories.length) throw ApiError.notFound('No fee records found for this month'); const history = histories[0];
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="Kalai-Sangamam-Fee-History-${month.replace(/\s+/g, '-')}.pdf"` }).send(pdf(history));
});

const updateFeeStatus = asyncHandler(async () => { throw ApiError.badRequest('Fee status is calculated from payment transactions and cannot be set manually'); });
const getMyFees = asyncHandler(async (req, res) => {
  const { data: student, error: studentError } = await supabase.from('students').select('id').eq('user_id', req.user.id).single(); if (studentError || !student) throw ApiError.notFound('Student profile not found');
  const { data, error } = await feeQuery({ student_id: student.id }); if (error) throw ApiError.internal(error.message); sendResponse(res, 200, await withPayments(data || []));
});
module.exports = { listFees, listStudentsByProgramme, upsertFee, upsertFeesBulk, getMonthlyHistory, downloadMonthlyPdf, updateFeeStatus, getMyFees };
