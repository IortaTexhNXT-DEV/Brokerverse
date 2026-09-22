import { Router } from 'express';
import { z } from 'zod';
import { one, pool, query, tx } from '../db.js';
import { requireModule } from '../lib/auth.js';
import { conflict, notFound } from '../lib/errors.js';
import { idParam, parse } from '../lib/validate.js';
import { wrap } from '../lib/async.js';
import { audit } from '../lib/audit.js';
import { nextNumber } from '../lib/numbering.js';
import { sendMail } from '../lib/mail.js';
import { createApproval } from '../domain/approvals.js';
import { GL, ensurePeriod, postJournal, today } from '../domain/ledger.js';
import { periodOf } from '@brokerverse/shared';

export const accountingRouter = Router();
accountingRouter.use(requireModule('ADA', 'RPT'));

accountingRouter.get('/accounts', wrap(async (_req, res) => { res.json({ accounts: await query('SELECT * FROM gl_accounts ORDER BY code') }); }));

accountingRouter.get('/journals', wrap(async (req, res) => {
  const period = String(req.query.period ?? '');
  const journals = await query<any>(`SELECT je.*, u.full_name AS posted_by_name FROM journal_entries je LEFT JOIN users u ON u.id=je.posted_by WHERE ($1 = '' OR je.period = $1) ORDER BY je.id DESC LIMIT 300`, [period]);
  const ids = journals.map((j) => j.id);
  const lines = ids.length ? await query<any>('SELECT jl.*, a.name AS account_name FROM journal_lines jl JOIN gl_accounts a ON a.code=jl.account_code WHERE journal_id = ANY($1) ORDER BY jl.id', [ids]) : [];
  for (const j of journals) j.lines = lines.filter((l) => l.journal_id === j.id);
  res.json({ journals });
}));

/** Manual proforma journal entry (balanced, open period). */
accountingRouter.post('/journals', requireModule('ADA'), wrap(async (req, res) => {
  const b = parse(z.object({
    entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), description: z.string().min(3),
    lines: z.array(z.object({ accountCode: z.string().min(1), debit: z.number().min(0).default(0), credit: z.number().min(0).default(0), memo: z.string().optional() })).min(2),
  }), req.body);
  const codes = new Set((await query<{ code: string }>('SELECT code FROM gl_accounts')).map((r) => r.code));
  for (const l of b.lines) if (!codes.has(l.accountCode)) throw notFound(`GL account ${l.accountCode} not found`);
  const out = await tx(async (c) => {
    const jv = await postJournal(c, { ...b, sourceType: 'manual', postedBy: req.user!.id });
    await audit(c, req.user, 'journal.post', 'journal', jv.id, null, { jvNo: jv.jvNo, description: b.description });
    return jv;
  });
  res.status(201).json(out);
}));

accountingRouter.get('/trial-balance', wrap(async (req, res) => {
  const period = String(req.query.period ?? '');
  const rows = await query(`SELECT a.code, a.name, a.type, COALESCE(SUM(jl.debit),0) AS debit, COALESCE(SUM(jl.credit),0) AS credit
    FROM gl_accounts a LEFT JOIN journal_lines jl ON jl.account_code=a.code LEFT JOIN journal_entries je ON je.id=jl.journal_id AND ($1 = '' OR je.period = $1)
    WHERE jl.id IS NULL OR je.id IS NOT NULL GROUP BY a.code, a.name, a.type ORDER BY a.code`, [period]);
  const totals = rows.reduce((t: any, r: any) => ({ debit: t.debit + r.debit, credit: t.credit + r.credit }), { debit: 0, credit: 0 });
  res.json({ rows, totals: { debit: Math.round(totals.debit * 100) / 100, credit: Math.round(totals.credit * 100) / 100 } });
}));

accountingRouter.get('/periods', wrap(async (_req, res) => {
  await ensurePeriod(pool, periodOf(today()));
  res.json({ periods: await query('SELECT * FROM accounting_periods ORDER BY period DESC') });
}));

accountingRouter.post('/periods/:period/close', requireModule('ADA'), wrap(async (req, res) => {
  const period = req.params.period;
  if (!/^\d{4}-\d{2}$/.test(period)) throw notFound('Period not found');
  const p = await ensurePeriod(pool, period);
  if (p!.status === 'closed') throw conflict('Period already closed');
  await tx(async (c) => {
    await query('UPDATE accounting_periods SET status=$2, closed_at=now(), closed_by=$3 WHERE period=$1', [period, 'closed', req.user!.id], c);
    await audit(c, req.user, 'period.close', 'period', period, { status: 'open' }, { status: 'closed' });
  });
  res.json({ ok: true });
}));

/** Hard-closed periods can be reopened by finance (with audit) – REG-177. */
accountingRouter.post('/periods/:period/reopen', requireModule('ADA'), wrap(async (req, res) => {
  const period = req.params.period;
  const p = await one<any>('SELECT * FROM accounting_periods WHERE period=$1', [period]);
  if (!p) throw notFound('Period not found');
  if (p.status !== 'closed') throw conflict('Period is not closed');
  const { reason } = parse(z.object({ reason: z.string().min(3) }), req.body);
  await tx(async (c) => {
    await query('UPDATE accounting_periods SET status=$2, reopened_at=now(), reopened_by=$3 WHERE period=$1', [period, 'open', req.user!.id], c);
    await audit(c, req.user, 'period.reopen', 'period', period, { status: 'closed' }, { status: 'open', reason });
  });
  res.json({ ok: true });
}));

accountingRouter.get('/remittances', wrap(async (_req, res) => {
  res.json({ remittances: await query('SELECT r.*, i.name AS insurer_name, u.full_name AS created_by_name FROM remittances r JOIN insurers i ON i.id=r.insurer_id LEFT JOIN users u ON u.id=r.created_by ORDER BY r.id DESC LIMIT 300') });
}));

/** Amounts collected and not yet remitted per insurer (net of commission). */
accountingRouter.get('/remittances/due', wrap(async (_req, res) => {
  const rows = await query(`SELECT i.id AS insurer_id, i.name AS insurer_name, COUNT(p.id)::int AS policies, COALESCE(SUM(p.total_amount - p.commission),0) AS amount, array_agg(p.id) AS policy_ids
    FROM policies p JOIN insurers i ON i.id=p.insurer_id JOIN invoices inv ON inv.policy_id=p.id AND inv.status='paid'
    WHERE p.status IN ('in_force','renewed','expired') AND NOT EXISTS (SELECT 1 FROM remittances r WHERE p.id = ANY(r.policy_ids) AND r.status <> 'rejected')
    GROUP BY i.id, i.name ORDER BY i.name`);
  res.json({ due: rows });
}));

/** Remittance voucher to insurer: maker creates, checker approves, accountant marks paid (journal). */
accountingRouter.post('/remittances', requireModule('ADA'), wrap(async (req, res) => {
  const b = parse(z.object({ insurerId: z.number().int().positive(), policyIds: z.array(z.number().int().positive()).min(1), note: z.string().optional() }), req.body);
  const out = await tx(async (c) => {
    const ins = await one<any>('SELECT * FROM insurers WHERE id=$1', [b.insurerId], c);
    if (!ins) throw notFound('Insurer not found');
    const pols = await query<any>(`SELECT p.id, p.policy_no, (p.total_amount - p.commission) AS net FROM policies p JOIN invoices inv ON inv.policy_id=p.id AND inv.status='paid'
      WHERE p.id = ANY($1) AND p.insurer_id=$2 AND NOT EXISTS (SELECT 1 FROM remittances r WHERE p.id = ANY(r.policy_ids) AND r.status <> 'rejected')`, [b.policyIds, b.insurerId], c);
    if (pols.length !== b.policyIds.length) throw conflict('One or more policies are unpaid, already remitted, or belong to another insurer');
    const amount = Math.round(pols.reduce((s, p) => s + p.net, 0) * 100) / 100;
    const voucherNo = await nextNumber(c, 'PV', 'PV');
    const r = await one<{ id: number }>('INSERT INTO remittances(voucher_no, insurer_id, amount, policy_ids, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [voucherNo, b.insurerId, amount, b.policyIds, req.user!.id], c);
    const approvalId = await createApproval(c, req.user!, 'remittance', 'remittance', r!.id, `Remit PHP ${amount.toFixed(2)} to ${ins.name} (${voucherNo}, ${pols.length} policies)`, { policyNos: pols.map((p) => p.policy_no) }, b.note);
    await audit(c, req.user, 'remittance.create', 'remittance', r!.id, null, { voucherNo, amount });
    return { id: r!.id, voucherNo, amount, approvalId };
  });
  res.status(201).json(out);
}));

accountingRouter.post('/remittances/:id/pay', requireModule('ADA'), wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const { chequeNo } = parse(z.object({ chequeNo: z.string().min(1) }), req.body);
  const out = await tx(async (c) => {
    const r = await one<any>('SELECT r.*, i.name AS insurer_name FROM remittances r JOIN insurers i ON i.id=r.insurer_id WHERE r.id=$1 FOR UPDATE OF r', [id], c);
    if (!r) throw notFound('Remittance not found');
    if (r.status !== 'approved') throw conflict(`Remittance is ${r.status}; checker approval required before payment`);
    const jv = await postJournal(c, {
      entryDate: today(), description: `Remittance ${r.voucher_no} to ${r.insurer_name}`, sourceType: 'remittance', sourceId: id, postedBy: req.user!.id,
      lines: [{ accountCode: GL.DUE_TO_INSURERS, debit: r.amount, memo: r.voucher_no }, { accountCode: GL.CASH, credit: r.amount, memo: `Cheque ${chequeNo}` }],
    });
    await query("UPDATE remittances SET status='paid', cheque_no=$2, journal_id=$3, paid_at=now() WHERE id=$1", [id, chequeNo, jv.id], c);
    await sendMail(c, `remittances@${r.insurer_name.toLowerCase().replace(/[^a-z]/g, '')}.local`, `Remittance schedule ${r.voucher_no}`, `Remittance of PHP ${Number(r.amount).toFixed(2)} by cheque ${chequeNo} covering ${r.policy_ids.length} policies.`, 'remittance-schedule', 'remittance', id);
    await audit(c, req.user, 'remittance.pay', 'remittance', id, { status: 'approved' }, { status: 'paid', chequeNo, jvNo: jv.jvNo });
    return { ok: true, jvNo: jv.jvNo };
  });
  res.json(out);
}));
