import { Router, z, one, query, tx, requireModule, wrap, audit, nextNumber, sendMail, idParam, parse, conflict, notFound, badRequest, createApproval, GL, postJournal, today, addDays, round2 } from '../lib/kit.js';
import type { PoolClient } from 'pg';
import { registerApprovalHandler } from '../domain/approvals.js';

export const operationsRouter = Router();
operationsRouter.use(requireModule('OPS', 'CLXN'));

export const invoiceSelect = `SELECT i.*, cl.name AS client_name, cl.email AS client_email, p.policy_no, (i.amount - i.paid_amount) AS balance,
  GREATEST(0, (CURRENT_DATE - i.due_date)) AS days_overdue, (CURRENT_DATE - i.created_at::date) AS days_since_booking
  FROM invoices i JOIN clients cl ON cl.id=i.client_id JOIN policies p ON p.id=i.policy_id`;
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const PDC_HOLD_DAYS = 4;
const CHEQUE_CHANNELS = new Set(['otc_cheque']);

operationsRouter.get('/invoices', wrap(async (req, res) => {
  const status = String(req.query.status ?? '');
  const q = String(req.query.q ?? '').trim();
  res.json({ invoices: await query(`${invoiceSelect} WHERE ($1 = '' OR i.status = $1) AND ($2 = '' OR i.invoice_no ILIKE '%'||$2||'%' OR cl.name ILIKE '%'||$2||'%' OR p.policy_no ILIKE '%'||$2||'%') ORDER BY i.id DESC LIMIT 500`, [status, q]) });
}));

operationsRouter.get('/receipts', wrap(async (_req, res) => {
  res.json({ receipts: await query(`SELECT r.*, cl.name AS client_name, i.invoice_no, u.full_name AS received_by_name FROM receipts r JOIN clients cl ON cl.id=r.client_id JOIN invoices i ON i.id=r.invoice_id LEFT JOIN users u ON u.id=r.received_by ORDER BY r.id DESC LIMIT 500`) });
}));

operationsRouter.get('/payments', wrap(async (req, res) => {
  const status = String(req.query.status ?? '');
  res.json({ payments: await query(`SELECT pm.*, cl.name AS client_name, i.invoice_no, r.receipt_no FROM payments pm LEFT JOIN clients cl ON cl.id=pm.client_id LEFT JOIN invoices i ON i.id=pm.invoice_id LEFT JOIN receipts r ON r.id=pm.receipt_id WHERE ($1 = '' OR pm.status=$1) ORDER BY pm.id DESC LIMIT 500`, [status]) });
}));

const INSERT_RECEIPT = 'INSERT INTO receipts(receipt_no, invoice_id, client_id, amount, method, reference, received_at, received_by, journal_id, payment_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id';
const LOCK_INVOICE = `${invoiceSelect} WHERE i.id=$1 FOR UPDATE OF i`;
const LOCK_PAYMENT = 'SELECT * FROM payments WHERE id=$1 FOR UPDATE';
const PAYMENT_NOT_FOUND = 'Payment not found';
const INVOICE_NOT_FOUND = 'Invoice not found';

const METHOD_BY_CHANNEL: Record<string, string> = { otc_cash: 'cash', otc_cheque: 'cheque', autopay: 'card' };
const methodOf = (channel: string) => METHOD_BY_CHANNEL[channel] ?? 'transfer';
const invoiceStatusFor = (paid: number, amount: number) => (paid + 0.005 >= amount ? 'paid' : 'partial');

async function postUnapplied(c: PoolClient, pm: any, amount: number, actorId: number) {
  await postJournal(c, { entryDate: pm.received_at, description: `Unapplied premium payment ${pm.payment_no}`, sourceType: 'payment', sourceId: pm.id, postedBy: actorId,
    lines: [{ accountCode: GL.CASH, debit: amount, memo: pm.channel }, { accountCode: GL.UNAPPLIED_PREMIUM, credit: amount, memo: 'UPP' }] });
}

interface ReceiptInput { pm: any; inv: any; applied: number; actorId: number; debitAccount?: string }

/** Official receipt for an applied amount: Dr Cash (or UPP) / Cr Premium Receivable, invoice updated, receipt emailed. */
async function issueReceipt(c: PoolClient, { pm, inv, applied, actorId, debitAccount = GL.CASH }: ReceiptInput) {
  const jv = await postJournal(c, { entryDate: pm.received_at, description: `Receipt for ${inv.invoice_no} – ${inv.client_name}`, sourceType: 'receipt', postedBy: actorId,
    lines: [{ accountCode: debitAccount, debit: applied, memo: pm.channel }, { accountCode: GL.PREMIUM_RECEIVABLE, credit: applied, memo: inv.invoice_no }] });
  const receiptNo = await nextNumber(c, 'OR', 'OR');
  const r = await one<{ id: number }>(INSERT_RECEIPT, [receiptNo, inv.id, inv.client_id, applied, methodOf(pm.channel), pm.reference ?? pm.cheque_no ?? null, pm.received_at, actorId, jv.id, pm.id], c);
  const newPaid = round2(inv.paid_amount + applied);
  const invoiceStatus = invoiceStatusFor(newPaid, inv.amount);
  await query('UPDATE invoices SET paid_amount=$2, status=$3 WHERE id=$1', [inv.id, newPaid, invoiceStatus], c);
  await sendMail(c, { to: inv.client_email, subject: `Official Receipt ${receiptNo}`, body: `Dear ${inv.client_name},\n\nWe acknowledge receipt of PHP ${applied.toFixed(2)} against invoice ${inv.invoice_no} (policy ${inv.policy_no}).\n\nBrokerVerse`, template: 'receipt', refType: 'receipt', refId: r!.id });
  return { receiptId: r!.id, receiptNo, jvNo: jv.jvNo, jvId: jv.id, invoiceStatus };
}

async function parkAsZeroPr(c: PoolClient, pm: any, actorId: number) {
  await query("UPDATE payments SET status='zero_pr', unapplied_amount=amount WHERE id=$1", [pm.id], c);
  await postUnapplied(c, pm, pm.amount, actorId);
  return { status: 'zero_pr', applied: 0, unapplied: pm.amount, receiptNo: null, jvNo: null, invoiceStatus: 'paid' };
}

interface ApplyResult { status: string; applied: number; unapplied: number; receiptNo: string | null; jvNo: string | null; invoiceStatus: string | null }

async function settleAgainstInvoice(c: PoolClient, pm: any, inv: any | null, balance: number, actorId: number): Promise<ApplyResult> {
  const applied = Math.min(pm.amount, balance);
  const excess = round2(pm.amount - applied);
  const receipt = applied > 0 ? await issueReceipt(c, { pm, inv, applied, actorId }) : null;
  if (receipt) await query('UPDATE payments SET receipt_id=$2, journal_id=$3 WHERE id=$1', [pm.id, receipt.receiptId, receipt.jvId], c);
  if (excess > 0) await postUnapplied(c, pm, excess, actorId);
  const status = applied > 0 && excess === 0 ? 'applied' : 'unapplied';
  await query('UPDATE payments SET status=$2, applied_amount=$3, unapplied_amount=$4 WHERE id=$1', [pm.id, status, applied, excess], c);
  return { status, applied, unapplied: excess, receiptNo: receipt?.receiptNo ?? null, jvNo: receipt?.jvNo ?? null, invoiceStatus: receipt?.invoiceStatus ?? null };
}

/** Applies (part of) a payment to its invoice; any excess (or a zero-PR invoice) becomes unapplied premium (UPP). */
async function applyPayment(c: PoolClient, paymentId: number, actorId: number): Promise<ApplyResult> {
  const pm = await one<any>(LOCK_PAYMENT, [paymentId], c);
  if (!pm) throw notFound(PAYMENT_NOT_FOUND);
  const inv = pm.invoice_id ? await one<any>(LOCK_INVOICE, [pm.invoice_id], c) : null;
  const balance = inv ? round2(inv.amount - inv.paid_amount) : 0;
  if (inv && balance <= 0) return parkAsZeroPr(c, pm, actorId);
  return settleAgainstInvoice(c, pm, inv, balance, actorId);
}

const paymentSchema = z.object({
  channel: z.enum(['otc_cash', 'otc_cheque', 'bills_payment', 'clpc_file', 'trade_file', 'direct_credit', 'autopay']), amount: z.number().positive(),
  invoiceId: z.number().int().positive().optional(), clientId: z.number().int().positive().optional(), reference: z.string().optional(),
  chequeNo: z.string().optional(), chequeDate: DATE.optional(), receivedAt: DATE.optional(),
});
type PaymentInput = z.infer<typeof paymentSchema>;

async function insertPayment(c: PoolClient, b: PaymentInput, receivedAt: string, holdUntil: string | null, actorId: number) {
  const inv = b.invoiceId ? await one<any>('SELECT * FROM invoices WHERE id=$1', [b.invoiceId], c) : null;
  if (b.invoiceId && !inv) throw notFound(INVOICE_NOT_FOUND);
  const paymentNo = await nextNumber(c, 'PAY', 'PAY');
  const pm = await one<{ id: number }>(
    `INSERT INTO payments(payment_no, channel, amount, reference, cheque_no, cheque_date, received_at, hold_until, client_id, invoice_id, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [paymentNo, b.channel, b.amount, b.reference ?? null, b.chequeNo ?? null, b.chequeDate ?? null, receivedAt, holdUntil, b.clientId ?? inv?.client_id ?? null, b.invoiceId ?? null, holdUntil ? 'held' : 'received', actorId], c);
  return { id: pm!.id, paymentNo };
}

/** Cashiering intake for every channel: cash applies at once; cheques are held four days (PDC monitoring). */
operationsRouter.post('/payments', requireModule('OPS'), wrap(async (req, res) => {
  const b = parse(paymentSchema, req.body);
  if (CHEQUE_CHANNELS.has(b.channel) && !b.chequeNo) throw badRequest('Cheque number is required for cheque payments');
  const receivedAt = b.receivedAt ?? today();
  const holdUntil = CHEQUE_CHANNELS.has(b.channel) ? addDays(receivedAt, PDC_HOLD_DAYS) : null;
  const out = await tx(async (c) => {
    const pm = await insertPayment(c, b, receivedAt, holdUntil, req.user!.id);
    const result = holdUntil ? { status: 'held', holdUntil } : await applyPayment(c, pm.id, req.user!.id);
    await audit(c, req.user, { action: 'payment.receive', entity: 'payment', entityId: pm.id, after: { paymentNo: pm.paymentNo, ...b, ...result } });
    return { ...pm, ...result };
  });
  res.status(201).json(out);
}));

/** PDC monitoring: after the four-day hold a cheque matures and is applied; a returned cheque is tagged bounced (exclusion). */
operationsRouter.post('/payments/:id/mature', requireModule('OPS'), wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const out = await tx(async (c) => {
    const pm = await one<any>(LOCK_PAYMENT, [id], c);
    if (!pm) throw notFound(PAYMENT_NOT_FOUND);
    if (pm.status !== 'held') throw conflict(`Payment is ${pm.status}`);
    if (pm.hold_until > today()) throw conflict(`Cheque is on hold until ${pm.hold_until} (${PDC_HOLD_DAYS}-day clearing)`);
    await query("UPDATE payments SET status='matured' WHERE id=$1", [id], c);
    const r = await applyPayment(c, id, req.user!.id);
    await audit(c, req.user, { action: 'payment.mature', entity: 'payment', entityId: id, after: r });
    return r;
  });
  res.json(out);
}));

operationsRouter.post('/payments/:id/bounce', requireModule('OPS'), wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const { reason } = parse(z.object({ reason: z.string().min(3) }), req.body);
  await tx(async (c) => {
    const pm = await one<any>(LOCK_PAYMENT, [id], c);
    if (!pm) throw notFound(PAYMENT_NOT_FOUND);
    if (pm.status !== 'held') throw conflict('Only a held cheque can be tagged as bounced');
    await query("UPDATE payments SET status='bounced', exclusion_reason=$2 WHERE id=$1", [id, `PROCESSED: Exclusion - Bounced Check (${reason})`], c);
    await audit(c, req.user, { action: 'payment.bounce', entity: 'payment', entityId: id, after: { reason } });
  });
  res.json({ ok: true });
}));

/** Unapplied premium (UPP) is applied later to an invoice: Dr Unapplied / Cr Premium Receivable with a receipt. */
operationsRouter.post('/payments/:id/apply', requireModule('OPS'), wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const { invoiceId } = parse(z.object({ invoiceId: z.number().int().positive() }), req.body);
  const out = await tx(async (c) => {
    const pm = await one<any>(LOCK_PAYMENT, [id], c);
    if (!pm) throw notFound(PAYMENT_NOT_FOUND);
    if (!['unapplied', 'zero_pr'].includes(pm.status) || pm.unapplied_amount <= 0) throw conflict('Payment has no unapplied balance');
    const inv = await one<any>(LOCK_INVOICE, [invoiceId], c);
    if (!inv) throw notFound(INVOICE_NOT_FOUND);
    const balance = round2(inv.amount - inv.paid_amount);
    if (balance <= 0) throw conflict('Invoice is fully paid');
    const applied = Math.min(pm.unapplied_amount, balance);
    const receipt = await issueReceipt(c, { pm: { ...pm, received_at: today(), reference: `UPP ${pm.payment_no}` }, inv, applied, actorId: req.user!.id, debitAccount: GL.UNAPPLIED_PREMIUM });
    const remaining = round2(pm.unapplied_amount - applied);
    await query('UPDATE payments SET applied_amount=applied_amount+$2, unapplied_amount=$3, status=$4, invoice_id=COALESCE(invoice_id,$5), receipt_id=COALESCE(receipt_id,$6) WHERE id=$1', [pm.id, applied, remaining, remaining > 0 ? 'unapplied' : 'applied', inv.id, receipt.receiptId], c);
    await audit(c, req.user, { action: 'payment.apply', entity: 'payment', entityId: id, after: { invoiceId, applied, remaining, receiptNo: receipt.receiptNo } });
    return { applied, remaining, receiptNo: receipt.receiptNo, jvNo: receipt.jvNo };
  });
  res.json(out);
}));

/* ---------- Direct payment: client paid the insurer, brokerage commission still due ---------- */
operationsRouter.get('/direct-payments', wrap(async (_req, res) => {
  res.json({ items: await query('SELECT d.*, p.policy_no, i.name AS insurer_name, cl.name AS client_name FROM commission_receivables d JOIN policies p ON p.id=d.policy_id JOIN insurers i ON i.id=d.insurer_id JOIN clients cl ON cl.id=p.client_id ORDER BY d.id DESC LIMIT 300') });
}));

/** Identify a direct payment: reverses the premium receivable to the insurer and books the commission receivable. */
operationsRouter.post('/direct-payments', requireModule('OPS', 'CLXN'), wrap(async (req, res) => {
  const b = parse(z.object({ policyNo: z.string().min(3), insurerReference: z.string().optional(), note: z.string().optional() }), req.body);
  const out = await tx(async (c) => {
    const p = await one<any>('SELECT p.*, cl.name AS client_name FROM policies p JOIN clients cl ON cl.id=p.client_id WHERE p.policy_no=$1 FOR UPDATE OF p', [b.policyNo.trim().toUpperCase()], c);
    if (!p) throw notFound('Policy not found');
    if (p.status !== 'in_force') throw conflict(`Policy is ${p.status}`);
    const inv = await one<any>("SELECT * FROM invoices WHERE policy_id=$1 AND status <> 'paid' FOR UPDATE", [p.id], c);
    if (!inv) throw conflict('No open invoice: premium is already collected');
    if (await one('SELECT 1 FROM commission_receivables WHERE policy_id=$1', [p.id], c)) throw conflict('Direct payment already identified for this policy');
    const balance = round2(inv.amount - inv.paid_amount);
    const commission = round2(Math.min(p.commission, balance));
    const jv = await postJournal(c, { entryDate: today(), description: `Direct payment to insurer – ${p.policy_no}`, sourceType: 'direct_payment', sourceId: p.id, postedBy: req.user!.id,
      lines: [{ accountCode: GL.DUE_TO_INSURERS, debit: round2(balance - commission), memo: 'Settled directly by client' }, { accountCode: GL.COMMISSION_RECEIVABLE, debit: commission, memo: 'Commission due from insurer' }, { accountCode: GL.PREMIUM_RECEIVABLE, credit: balance, memo: inv.invoice_no }] });
    await query("UPDATE invoices SET paid_amount=amount, status='paid' WHERE id=$1", [inv.id], c);
    const dpNo = await nextNumber(c, 'DP', 'DP');
    const r = await one<{ id: number }>('INSERT INTO commission_receivables(dp_no, policy_id, insurer_id, amount, insurer_reference, note, journal_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [dpNo, p.id, p.insurer_id, commission, b.insurerReference ?? null, b.note ?? null, jv.id, req.user!.id], c);
    await audit(c, req.user, { action: 'direct_payment.identify', entity: 'commission_receivable', entityId: r!.id, after: { dpNo, commission, jvNo: jv.jvNo } });
    return { id: r!.id, dpNo, commission, jvNo: jv.jvNo };
  });
  res.status(201).json(out);
}));

const DP_TRANSITIONS: Record<string, string[]> = { identified: ['billed'], billed: ['approved', 'rejected'], rejected: ['billed'], approved: ['collected'] };

/** Bill the insurer, record its response, and collect the commission with a commission OR. */
operationsRouter.post('/direct-payments/:id/transition', requireModule('OPS', 'CLXN'), wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = parse(z.object({ to: z.enum(['billed', 'approved', 'rejected', 'collected']), note: z.string().optional() }), req.body);
  const out = await tx(async (c) => {
    const d = await one<any>('SELECT d.*, i.name AS insurer_name FROM commission_receivables d JOIN insurers i ON i.id=d.insurer_id WHERE d.id=$1 FOR UPDATE OF d', [id], c);
    if (!d) throw notFound('Direct payment not found');
    if (!DP_TRANSITIONS[d.status]?.includes(b.to)) throw conflict(`Cannot move a ${d.status} item to ${b.to}`);
    let receiptNo: string | null = null;
    if (b.to === 'billed') await sendMail(c, { to: `billing@${d.insurer_name.toLowerCase().replaceAll(/[^a-z]/g, '')}.local`, subject: `Commission billing ${d.dp_no}`, body: `Commission receivable PHP ${Number(d.amount).toFixed(2)} on direct payment.`, template: 'commission-billing', refType: 'commission_receivable', refId: id });
    if (b.to === 'collected') {
      const jv = await postJournal(c, { entryDate: today(), description: `Commission collected ${d.dp_no} from ${d.insurer_name}`, sourceType: 'commission', sourceId: id, postedBy: req.user!.id,
        lines: [{ accountCode: GL.CASH, debit: d.amount }, { accountCode: GL.COMMISSION_RECEIVABLE, credit: d.amount }] });
      receiptNo = await nextNumber(c, 'OR', 'OR');
      await query('UPDATE commission_receivables SET receipt_no=$2, journal_id=$3, collected_at=now() WHERE id=$1', [id, receiptNo, jv.id], c);
    }
    await query('UPDATE commission_receivables SET status=$2, billed_at = CASE WHEN $2=\'billed\' THEN now() ELSE billed_at END, note=COALESCE($3, note) WHERE id=$1', [id, b.to, b.note ?? null], c);
    await audit(c, req.user, { action: `direct_payment.${b.to}`, entity: 'commission_receivable', entityId: id, before: { status: d.status }, after: { status: b.to, receiptNo } });
    return { ok: true, status: b.to, receiptNo };
  });
  res.json(out);
}));

/* ---------- Adjustment / cancellation endorsements (checker-poster) ---------- */
const refundNote = (amount: number) => (amount ? `, refund PHP ${amount.toFixed(2)}` : '');
operationsRouter.get('/endorsements', wrap(async (_req, res) => {
  res.json({ endorsements: await query('SELECT e.*, p.policy_no, cl.name AS client_name FROM endorsements e JOIN policies p ON p.id=e.policy_id JOIN clients cl ON cl.id=p.client_id ORDER BY e.id DESC LIMIT 300') });
}));

registerApprovalHandler('endorsement', async (c, a, decision, checker) => {
  const e = await one<any>('SELECT e.*, p.client_id, p.policy_no, p.commission, p.total_amount FROM endorsements e JOIN policies p ON p.id=e.policy_id WHERE e.id=$1 FOR UPDATE OF e', [a.entity_id], c);
  if (decision !== 'approved') { await query("UPDATE endorsements SET status='rejected' WHERE id=$1", [e.id], c); return { posted: false }; }
  const inv = await one<any>('SELECT * FROM invoices WHERE policy_id=$1 ORDER BY id DESC LIMIT 1 FOR UPDATE', [e.policy_id], c);
  const delta = Number(e.premium_delta);
  let journalId: number | null = null;
  if (Math.abs(delta) >= 0.005) {
    const commRate = e.total_amount ? e.commission / e.total_amount : 0;
    const comm = round2(Math.abs(delta) * commRate); const net = round2(Math.abs(delta) - comm);
    const lines = delta > 0
      ? [{ accountCode: GL.PREMIUM_RECEIVABLE, debit: delta }, { accountCode: GL.DUE_TO_INSURERS, credit: net }, { accountCode: GL.COMMISSION_INCOME, credit: comm }]
      : [{ accountCode: GL.DUE_TO_INSURERS, debit: net }, { accountCode: GL.COMMISSION_INCOME, debit: comm }, { accountCode: GL.PREMIUM_RECEIVABLE, credit: -delta }];
    const jv = await postJournal(c, { entryDate: today(), description: `Endorsement ${e.endorsement_no} (${e.type}) on ${e.policy_no}`, sourceType: 'endorsement', sourceId: e.policy_id, postedBy: checker.id, lines });
    journalId = jv.id;
    if (inv) {
      const amount = round2(inv.amount + delta);
      await query('UPDATE invoices SET amount=$2, status = CASE WHEN paid_amount + 0.005 >= $2 THEN \'paid\' WHEN paid_amount > 0 THEN \'partial\' ELSE \'open\' END WHERE id=$1', [inv.id, amount], c);
    }
  }
  let refundRequestId: number | null = null;
  if (Number(e.refund_amount) > 0) {
    // Refund to client: the overpaid premium becomes a refund payable, then follows the Refund Request → Disbursement flow.
    await postJournal(c, { entryDate: today(), description: `Refund payable on ${e.endorsement_no}`, sourceType: 'endorsement', sourceId: e.policy_id, postedBy: checker.id,
      lines: [{ accountCode: GL.PREMIUM_RECEIVABLE, debit: e.refund_amount }, { accountCode: GL.REFUNDS_PAYABLE, credit: e.refund_amount }] });
    const rrfNo = await nextNumber(c, 'RRF', 'RRF');
    const rr = await one<{ id: number }>("INSERT INTO refund_requests(rrf_no, client_id, invoice_id, source_type, source_id, amount, reason, payment_mode, status, requested_by) VALUES ($1,$2,$3,'endorsement',$4,$5,$6,'credit_to_account','submitted',$7) RETURNING id",
      [rrfNo, e.client_id, inv?.id ?? null, e.id, e.refund_amount, `${e.type} endorsement ${e.endorsement_no}: ${e.description}`, checker.id], c);
    refundRequestId = rr!.id;
  }
  if (e.type === 'cancellation') await query("UPDATE policies SET status='cancelled' WHERE id=$1", [e.policy_id], c);
  await query("UPDATE endorsements SET status='posted', posted_by=$2, posted_at=now(), journal_id=$3, refund_request_id=$4 WHERE id=$1", [e.id, checker.id, journalId, refundRequestId], c);
  return { posted: true, journalId, refundRequestId };
});

operationsRouter.post('/endorsements', requireModule('OPS'), wrap(async (req, res) => {
  const b = parse(z.object({ policyNo: z.string().min(3), type: z.enum(['adjustment', 'cancellation']), description: z.string().min(5), premiumDelta: z.number().default(0), refundAmount: z.number().min(0).default(0) }), req.body);
  const out = await tx(async (c) => {
    const p = await one<any>('SELECT p.*, cl.name AS client_name FROM policies p JOIN clients cl ON cl.id=p.client_id WHERE p.policy_no=$1', [b.policyNo.trim().toUpperCase()], c);
    if (!p) throw notFound('Policy not found');
    if (p.status !== 'in_force') throw conflict(`Policy is ${p.status}`);
    if (b.type === 'cancellation' && b.premiumDelta > 0) throw badRequest('A cancellation cannot increase premium');
    const endorsementNo = await nextNumber(c, 'END', 'END');
    const r = await one<{ id: number }>('INSERT INTO endorsements(endorsement_no, policy_id, type, description, premium_delta, refund_amount, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', [endorsementNo, p.id, b.type, b.description, b.premiumDelta, b.refundAmount, req.user!.id], c);
    const approvalId = await createApproval(c, req.user!, { requestType: 'endorsement', entity: 'endorsement', entityId: r!.id, summary: `${b.type} ${endorsementNo} on ${p.policy_no} (${p.client_name}) Δ PHP ${b.premiumDelta.toFixed(2)}${refundNote(b.refundAmount)}` });
    await audit(c, req.user, { action: 'endorsement.create', entity: 'endorsement', entityId: r!.id, after: { endorsementNo, ...b } });
    return { id: r!.id, endorsementNo, approvalId };
  });
  res.status(201).json(out);
}));

/* ---------- Production reconciliation with the insurer ---------- */
function reconStatus(booked: unknown, variance: number | null): 'matched' | 'discrepancy' | 'unbooked' {
  if (!booked) return 'unbooked';
  if (variance !== null && Math.abs(variance) > 0.99) return 'discrepancy';
  return 'matched';
}
operationsRouter.get('/production-recons', wrap(async (_req, res) => {
  res.json({ recons: await query('SELECT r.*, i.name AS insurer_name FROM production_recons r JOIN insurers i ON i.id=r.insurer_id ORDER BY r.id DESC LIMIT 100') });
}));
operationsRouter.get('/production-recons/:id', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const recon = await one('SELECT r.*, i.name AS insurer_name FROM production_recons r JOIN insurers i ON i.id=r.insurer_id WHERE r.id=$1', [id]);
  if (!recon) throw notFound('Reconciliation not found');
  res.json({ recon, rows: await query('SELECT rr.*, p.policy_no FROM production_recon_rows rr LEFT JOIN policies p ON p.id=rr.policy_id WHERE recon_id=$1 ORDER BY rr.id', [id]) });
}));

/** Matches the insurer's returned production register against booked policies: Matched / Matched with discrepancies / Unbooked. */
operationsRouter.post('/production-recons', requireModule('OPS'), wrap(async (req, res) => {
  const b = parse(z.object({ insurerId: z.number().int().positive(), period: z.string().regex(/^\d{4}-\d{2}$/), rows: z.array(z.object({ policyNo: z.string(), premium: z.number().nullable(), insurerRef: z.string().optional() })).min(1).max(30000) }), req.body);
  const booked = await query<any>('SELECT id, policy_no, premium FROM policies WHERE insurer_id=$1 AND booked_at IS NOT NULL', [b.insurerId]);
  const byNo = new Map(booked.map((p) => [p.policy_no.toUpperCase(), p]));
  const out = await tx(async (c) => {
    const reconNo = await nextNumber(c, 'PRC', 'PRC');
    const rec = await one<{ id: number }>('INSERT INTO production_recons(recon_no, insurer_id, period, total_rows, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [reconNo, b.insurerId, b.period, b.rows.length, req.user!.id], c);
    const counts = { matched: 0, discrepancy: 0, unbooked: 0 };
    for (const row of b.rows) {
      const p = byNo.get(row.policyNo.trim().toUpperCase());
      const variance = p && row.premium !== null ? round2(row.premium - p.premium) : null;
      const status = reconStatus(p, variance);
      counts[status]++;
      await query('INSERT INTO production_recon_rows(recon_id, policy_no_raw, premium_raw, insurer_ref, status, policy_id, variance) VALUES ($1,$2,$3,$4,$5,$6,$7)', [rec!.id, row.policyNo, row.premium, row.insurerRef ?? null, status, p?.id ?? null, variance], c);
    }
    await query('UPDATE production_recons SET matched=$2, discrepancy=$3, unbooked=$4 WHERE id=$1', [rec!.id, counts.matched, counts.discrepancy, counts.unbooked], c);
    if (counts.unbooked + counts.discrepancy > 0) await sendMail(c, { to: 'marketing;processing@brokerverse.local', subject: `Production reconciliation ${reconNo}: ${counts.unbooked} unbooked, ${counts.discrepancy} with discrepancies`, body: 'Please book the unbooked accounts and disposition the discrepancies.', template: 'production-recon', refType: 'production_recon', refId: rec!.id });
    await audit(c, req.user, { action: 'production_recon.create', entity: 'production_recon', entityId: rec!.id, after: { reconNo, ...counts } });
    return { id: rec!.id, reconNo, ...counts };
  });
  res.status(201).json(out);
}));

operationsRouter.post('/production-recons/:id/rows/:rowId/disposition', requireModule('OPS'), wrap(async (req, res) => {
  const id = idParam(req.params.id); const rowId = idParam(req.params.rowId);
  const { disposition } = parse(z.object({ disposition: z.string().min(3) }), req.body);
  const r = await query('UPDATE production_recon_rows SET disposition=$3 WHERE id=$1 AND recon_id=$2 RETURNING id', [rowId, id, disposition]);
  if (!r.length) throw notFound('Row not found');
  res.json({ ok: true });
}));

