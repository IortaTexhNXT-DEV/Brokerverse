import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { requireModule } from '../lib/auth.js';
import { conflict, notFound } from '../lib/errors.js';
import { idParam, parse } from '../lib/validate.js';
import { wrap } from '../lib/async.js';
import { audit } from '../lib/audit.js';
import { nextNumber } from '../lib/numbering.js';
import { sendMail } from '../lib/mail.js';
import { GL, postJournal, today } from '../domain/ledger.js';

export const operationsRouter = Router();
operationsRouter.use(requireModule('OPS', 'CLXN'));

const invoiceSelect = `SELECT i.*, cl.name AS client_name, cl.email AS client_email, p.policy_no, (i.amount - i.paid_amount) AS balance,
  GREATEST(0, (CURRENT_DATE - i.due_date)) AS days_overdue FROM invoices i JOIN clients cl ON cl.id=i.client_id JOIN policies p ON p.id=i.policy_id`;

operationsRouter.get('/invoices', wrap(async (req, res) => {
  const status = String(req.query.status ?? '');
  const q = String(req.query.q ?? '').trim();
  res.json({ invoices: await query(`${invoiceSelect} WHERE ($1 = '' OR i.status = $1) AND ($2 = '' OR i.invoice_no ILIKE '%'||$2||'%' OR cl.name ILIKE '%'||$2||'%' OR p.policy_no ILIKE '%'||$2||'%') ORDER BY i.id DESC LIMIT 500`, [status, q]) });
}));

operationsRouter.get('/receipts', wrap(async (_req, res) => {
  res.json({ receipts: await query(`SELECT r.*, cl.name AS client_name, i.invoice_no, u.full_name AS received_by_name FROM receipts r JOIN clients cl ON cl.id=r.client_id JOIN invoices i ON i.id=r.invoice_id LEFT JOIN users u ON u.id=r.received_by ORDER BY r.id DESC LIMIT 500`) });
}));

/** Cashiering: official receipt against an invoice. Posts Dr Cash / Cr Premium Receivable. */
operationsRouter.post('/receipts', requireModule('OPS'), wrap(async (req, res) => {
  const b = parse(z.object({
    invoiceId: z.number().int().positive(), amount: z.number().positive(), method: z.enum(['cash', 'cheque', 'transfer', 'card']),
    reference: z.string().optional(), receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }), req.body);
  const out = await tx(async (c) => {
    const inv = await one<any>(`${invoiceSelect} WHERE i.id=$1 FOR UPDATE OF i`, [b.invoiceId], c);
    if (!inv) throw notFound('Invoice not found');
    const balance = Math.round((inv.amount - inv.paid_amount) * 100) / 100;
    if (balance <= 0) throw conflict(`Invoice ${inv.invoice_no} is fully paid`);
    if (b.amount > balance + 0.005) throw conflict(`Amount exceeds outstanding balance of ${balance.toFixed(2)}`);
    const receivedAt = b.receivedAt ?? today();
    const jv = await postJournal(c, {
      entryDate: receivedAt, description: `Receipt for ${inv.invoice_no} – ${inv.client_name}`, sourceType: 'receipt', postedBy: req.user!.id,
      lines: [{ accountCode: GL.CASH, debit: b.amount, memo: b.method }, { accountCode: GL.PREMIUM_RECEIVABLE, credit: b.amount, memo: inv.invoice_no }],
    });
    const receiptNo = await nextNumber(c, 'OR', 'OR');
    const r = await one<{ id: number }>(
      'INSERT INTO receipts(receipt_no, invoice_id, client_id, amount, method, reference, received_at, received_by, journal_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
      [receiptNo, inv.id, inv.client_id, b.amount, b.method, b.reference ?? null, receivedAt, req.user!.id, jv.id], c);
    const newPaid = Math.round((inv.paid_amount + b.amount) * 100) / 100;
    const status = newPaid + 0.005 >= inv.amount ? 'paid' : 'partial';
    await query('UPDATE invoices SET paid_amount=$2, status=$3 WHERE id=$1', [inv.id, newPaid, status], c);
    await sendMail(c, inv.client_email, `Official Receipt ${receiptNo}`, `Dear ${inv.client_name},\n\nWe acknowledge receipt of PHP ${b.amount.toFixed(2)} against invoice ${inv.invoice_no} (policy ${inv.policy_no}).\n\nBrokerVerse`, 'receipt', 'receipt', r!.id);
    await audit(c, req.user, 'receipt.create', 'receipt', r!.id, { paid: inv.paid_amount }, { receiptNo, amount: b.amount, invoiceStatus: status, jvNo: jv.jvNo });
    return { id: r!.id, receiptNo, jvNo: jv.jvNo, invoiceStatus: status, balance: Math.round((inv.amount - newPaid) * 100) / 100 };
  });
  res.status(201).json(out);
}));

export const collectionsRouter = Router();
collectionsRouter.use(requireModule('CLXN', 'OPS', 'RPT'));

/** Outstanding premiums with ageing buckets. */
collectionsRouter.get('/outstanding', wrap(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const rows = await query<any>(`${invoiceSelect} WHERE i.status <> 'paid' AND ($1 = '' OR cl.name ILIKE '%'||$1||'%' OR p.policy_no ILIKE '%'||$1||'%') ORDER BY i.due_date`, [q]);
  const buckets: Record<string, number> = { current: 0, '0-30': 0, '31-60': 0, '61-90': 0, '91-180': 0, '180+': 0 };
  for (const r of rows) {
    const d = r.days_overdue;
    const k = d <= 0 ? 'current' : d <= 30 ? '0-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : d <= 180 ? '91-180' : '180+';
    buckets[k] = Math.round((buckets[k] + r.balance) * 100) / 100;
    r.bucket = k;
  }
  res.json({ invoices: rows, buckets, total: Math.round(rows.reduce((s, r) => s + r.balance, 0) * 100) / 100 });
}));

/** Statement of account for a client. */
collectionsRouter.get('/statement/:clientId', wrap(async (req, res) => {
  const clientId = idParam(req.params.clientId);
  const client = await one('SELECT * FROM clients WHERE id=$1', [clientId]);
  if (!client) throw notFound('Client not found');
  const invoices = await query(`${invoiceSelect} WHERE i.client_id=$1 ORDER BY i.id`, [clientId]);
  const receipts = await query('SELECT r.*, i.invoice_no FROM receipts r JOIN invoices i ON i.id=r.invoice_id WHERE r.client_id=$1 ORDER BY r.id', [clientId]);
  const balance = Math.round(invoices.reduce((s: number, i: any) => s + i.balance, 0) * 100) / 100;
  res.json({ client, invoices, receipts, balance });
}));

collectionsRouter.post('/reminders/:invoiceId', requireModule('CLXN'), wrap(async (req, res) => {
  const invoiceId = idParam(req.params.invoiceId);
  const inv = await one<any>(`${invoiceSelect} WHERE i.id=$1`, [invoiceId]);
  if (!inv) throw notFound('Invoice not found');
  if (inv.status === 'paid') throw conflict('Invoice is already paid');
  await tx(async (c) => {
    await sendMail(c, inv.client_email, `Payment reminder – ${inv.invoice_no}`, `Dear ${inv.client_name},\n\nInvoice ${inv.invoice_no} for policy ${inv.policy_no} has an outstanding balance of PHP ${Number(inv.balance).toFixed(2)}, due ${inv.due_date}.\n\nBrokerVerse Collections`, 'payment-reminder', 'invoice', inv.id);
    await audit(c, req.user, 'collections.reminder', 'invoice', inv.id, null, { balance: inv.balance });
  });
  res.json({ ok: true });
}));
