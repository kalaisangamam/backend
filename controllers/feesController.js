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
  // A dependency-free PDF report. Keeping the layout here avoids requiring a browser or
  // a heavyweight renderer on the API server while still producing a print-ready report.
  const pageWidth = 842; const pageHeight = 595; const margin = 36; const bottom = 45;
  const colours = { navy: '0.09 0.13 0.20', brass: '0.72 0.53 0.20', ink: '0.16 0.20 0.27', muted: '0.39 0.44 0.52', line: '0.86 0.88 0.91', pale: '0.96 0.97 0.98', green: '0.12 0.48 0.31', red: '0.68 0.20 0.23', amber: '0.72 0.47 0.10' };
  const moneyPdf = (value) => `Rs. ${n(value).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const short = (value, width, size = 8) => {
    const text = safePdf(value || '-'); const max = Math.max(3, Math.floor(width / (size * 0.52)));
    return text.length > max ? `${text.slice(0, max - 3)}...` : text;
  };
  const pages = []; let stream = []; let y = pageHeight - margin;
  const add = (value) => stream.push(value);
  const rect = (x, top, width, height, fill) => add(`q ${fill} rg ${x} ${top - height} ${width} ${height} re f Q`);
  const line = (x1, y1, x2, y2, colour = colours.line) => add(`q ${colour} RG 0.5 w ${x1} ${y1} m ${x2} ${y2} l S Q`);
  const text = (value, x, top, size = 9, colour = colours.ink, bold = false, align = 'left', width = 0) => {
    const label = safePdf(value); const estimate = label.length * size * (bold ? 0.55 : 0.50);
    const left = align === 'right' ? x + width - estimate : align === 'center' ? x + (width - estimate) / 2 : x;
    add(`BT /F${bold ? 2 : 1} ${size} Tf ${colour} rg 1 0 0 1 ${Math.max(x, left).toFixed(2)} ${(top - size).toFixed(2)} Tm (${label}) Tj ET`);
  };
  const footer = () => { line(margin, 30, pageWidth - margin, 30); text('Kalai Sangamam Academy  |  Monthly Fee Report', margin, 22, 7, colours.muted); text(`Page ${pages.length + 1}`, pageWidth - margin - 60, 22, 7, colours.muted, false, 'right', 60); };
  const finishPage = () => { footer(); pages.push(stream.join('\n')); stream = []; y = pageHeight - margin; };
  const reportHeader = (compact = false) => {
    rect(0, pageHeight, pageWidth, compact ? 58 : 80, colours.navy);
    text('KALAI SANGAMAM ACADEMY', margin, pageHeight - 18, compact ? 14 : 18, '1 1 1', true);
    text(compact ? 'MONTHLY FEE HISTORY' : 'MONTHLY FEE HISTORY REPORT', margin, pageHeight - (compact ? 37 : 46), compact ? 7 : 9, '0.82 0.85 0.89', true);
    text(history.month.toUpperCase(), pageWidth - margin - 190, pageHeight - 28, compact ? 11 : 14, colours.brass, true, 'right', 190);
    y = pageHeight - (compact ? 78 : 103);
  };
  const section = (title) => { text(title.toUpperCase(), margin, y, 8, colours.muted, true); y -= 11; line(margin, y, pageWidth - margin, y); y -= 12; };
  const tableHeader = (columns) => { rect(margin, y, pageWidth - margin * 2, 19, colours.navy); columns.forEach((column) => text(column.label, column.x + 7, y - 5, 7, '1 1 1', true, column.align || 'left', column.width - 14)); y -= 19; };
  const ensure = (height, continuation) => { if (y - height < bottom) { finishPage(); reportHeader(true); continuation(); } };

  reportHeader();
  const cards = [
    ['STUDENTS', history.total_students, colours.ink], ['PROGRAMMES', history.total_programmes, colours.ink], ['TOTAL FEE', moneyPdf(history.total_fee), colours.ink], ['RECEIVED', moneyPdf(history.total_paid), colours.green], ['OUTSTANDING', moneyPdf(history.total_balance), colours.red], ['TRANSACTIONS', history.total_transactions, colours.ink]
  ];
  const cardWidth = (pageWidth - margin * 2 - 25) / 6;
  cards.forEach(([label, value, colour], index) => { const x = margin + index * (cardWidth + 5); rect(x, y, cardWidth, 49, colours.pale); text(label, x + 9, y - 12, 6.5, colours.muted, true); text(value, x + 9, y - 32, 10, colour, true); });
  y -= 68;

  const feeColumns = [
    { label: 'STUDENT ID', x: margin, width: 78 }, { label: 'STUDENT', x: margin + 78, width: 145 }, { label: 'PROGRAMME', x: margin + 223, width: 130 }, { label: 'FEE', x: margin + 353, width: 82, align: 'right' }, { label: 'PAID', x: margin + 435, width: 82, align: 'right' }, { label: 'BALANCE', x: margin + 517, width: 88, align: 'right' }, { label: 'STATUS', x: margin + 605, width: 129, align: 'center' }
  ];
  const feeTable = () => { section('Fee records'); tableHeader(feeColumns); };
  feeTable();
  history.fees.forEach((fee, index) => {
    ensure(25, feeTable); const rowTop = y;
    if (index % 2 === 0) rect(margin, rowTop, pageWidth - margin * 2, 25, colours.pale);
    text(short(fee.students?.student_code, 64), feeColumns[0].x + 7, rowTop - 8, 8);
    text(short(fee.students?.full_name, 131), feeColumns[1].x + 7, rowTop - 8, 8, colours.ink, true);
    text(short(fee.programs?.name || 'Unassigned', 116), feeColumns[2].x + 7, rowTop - 8, 8);
    text(moneyPdf(fee.fee_amount), feeColumns[3].x + 7, rowTop - 8, 8, colours.ink, false, 'right', feeColumns[3].width - 14);
    text(moneyPdf(fee.paid_amount), feeColumns[4].x + 7, rowTop - 8, 8, colours.green, false, 'right', feeColumns[4].width - 14);
    text(moneyPdf(fee.pending_amount), feeColumns[5].x + 7, rowTop - 8, 8, n(fee.pending_amount) > 0 ? colours.red : colours.green, false, 'right', feeColumns[5].width - 14);
    const status = fee.status === 'paid' ? 'PAID' : fee.status === 'partially_paid' ? 'PARTIALLY PAID' : 'PENDING'; const statusColour = fee.status === 'paid' ? colours.green : fee.status === 'partially_paid' ? colours.amber : colours.red;
    rect(feeColumns[6].x + 20, rowTop - 5, 88, 14, statusColour); text(status, feeColumns[6].x + 20, rowTop - 8, 6.5, '1 1 1', true, 'center', 88);
    y -= 25;
  });

  const payments = history.fees.flatMap((fee) => (fee.payments || []).map((payment) => ({ ...payment, student: fee.students?.full_name || '-', programme: fee.programs?.name || 'Unassigned' })));
  if (payments.length) {
    const paymentColumns = [{ label: 'PAYMENT DATE', x: margin, width: 105 }, { label: 'STUDENT', x: margin + 105, width: 170 }, { label: 'PROGRAMME', x: margin + 275, width: 150 }, { label: 'AMOUNT', x: margin + 425, width: 110, align: 'right' }, { label: 'NOTE', x: margin + 535, width: 199 }];
    const paymentTable = () => { section('Payment transactions'); tableHeader(paymentColumns); };
    ensure(42, paymentTable); paymentTable();
    payments.forEach((payment, index) => { ensure(25, paymentTable); const rowTop = y; if (index % 2 === 0) rect(margin, rowTop, pageWidth - margin * 2, 25, colours.pale); text(short(payment.payment_date, 91), paymentColumns[0].x + 7, rowTop - 8, 8); text(short(payment.student, 156), paymentColumns[1].x + 7, rowTop - 8, 8, colours.ink, true); text(short(payment.programme, 136), paymentColumns[2].x + 7, rowTop - 8, 8); text(moneyPdf(payment.amount), paymentColumns[3].x + 7, rowTop - 8, 8, colours.green, false, 'right', paymentColumns[3].width - 14); text(short(payment.payment_note || '-', 185), paymentColumns[4].x + 7, rowTop - 8, 8, colours.muted); y -= 25; });
  }
  finishPage();
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${pages.map((_, index) => `${5 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
  pages.forEach((content, index) => { const pageNo = 5 + index * 2; const contentNo = pageNo + 1; objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNo} 0 R >>`, `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`); });
  let output = '%PDF-1.4\n'; const offsets = [0]; objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; }); const start = Buffer.byteLength(output); output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`; return Buffer.from(output);
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
