import { Router, z, one, pool, query, tx, requireModule, wrap, audit, nextNumber, idParam, parse, conflict, notFound, createApproval, GL, postJournal, today, ensurePeriod, closeFiscalYear, round2 } from '../lib/kit.js';
import { registerApprovalHandler } from '../domain/approvals.js';
import { createDisbursement } from '../domain/disbursements.js';
import { periodOf } from '@brokerverse/shared';

export const accountingRouter = Router();
accountingRouter.use(requireModule('ADA', 'RPT'));

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const lineSchema = z.object({ accountCode: z.string().min(1), debit: z.number().min(0).default(0), credit: z.number().min(0).default(0), memo: z.string().optional() });

/* ---------- Chart of accounts ---------- */
accountingRouter.get('/accounts', wrap(async (_req, res) => { res.json({ accounts: await query('SELECT * FROM gl_accounts ORDER BY code') }); }));
accountingRouter.post('/accounts', requireModule('ADA'), wrap(async (req, res) => {
  const b = parse(z.object({ code: z.string().regex(/^\d{4}$/), name: z.string().min(2), type: z.enum(['asset', 'liability', 'equity', 'income', 'expense']) }), req.body);
  if (await one('SELECT 1 FROM gl_accounts WHERE code=$1', [b.code])) throw conflict('GL account already exists');
  await tx(async (c) => {
    await query('INSERT INTO gl_accounts(code, name, type) VALUES ($1,$2,$3)', [b.code, b.name, b.type], c);
    await audit(c, req.user, { action: 'gl_account.create', entity: 'gl_account', entityId: b.code, after: b });
  });
  res.status(201).json({ ok: true });
}));

/* ---------- Journals: system-generated post directly, manual entries are reviewed and posted by the TL ---------- */
accountingRouter.get('/journals', wrap(async (req, res) => {
  const period = String(req.query.period ?? '');
  const journals = await query<any>(`SELECT je.*, u.full_name AS posted_by_name FROM journal_entries je LEFT JOIN users u ON u.id=je.posted_by WHERE ($1 = '' OR je.period = $1) ORDER BY je.id DESC LIMIT 300`, [period]);
  const ids = journals.map((j) => j.id);
  const lines = ids.length ? await query<any>('SELECT jl.*, a.name AS account_name FROM journal_lines jl JOIN gl_accounts a ON a.code=jl.account_code WHERE journal_id = ANY($1) ORDER BY jl.id', [ids]) : [];
  for (const j of journals) j.lines = lines.filter((l) => l.journal_id === j.id);
  res.json({ journals });
}));

registerApprovalHandler('journal', async (c, a, decision, checker) => {
  if (decision !== 'approved') return { posted: false };
  const p = a.payload as { entryDate: string; description: string; lines: any[] };
  return postJournal(c, { ...p, sourceType: 'manual', sourceId: a.id, postedBy: checker.id });
});

accountingRouter.post('/journals', requireModule('ADA'), wrap(async (req, res) => {
  const b = parse(z.object({ entryDate: DATE, description: z.string().min(3), lines: z.array(lineSchema).min(2) }), req.body);
  const codes = new Set((await query<{ code: string }>('SELECT code FROM gl_accounts')).map((r) => r.code));
  for (const l of b.lines) if (!codes.has(l.accountCode)) throw notFound(`GL account ${l.accountCode} not found`);
  const d = b.lines.reduce((s, l) => s + l.debit, 0); const cr = b.lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(d - cr) > 0.004) throw conflict('Journal is not balanced');
  const out = await tx(async (c) => {
    const approvalId = await createApproval(c, req.user!, { requestType: 'journal', entity: 'journal_draft', entityId: 0, summary: `Manual journal ${b.entryDate}: ${b.description} (PHP ${round2(d).toFixed(2)})`, payload: b });
    await audit(c, req.user, { action: 'journal.draft', entity: 'approval', entityId: approvalId, after: b });
    return { approvalId };
  });
  res.status(201).json(out);
}));

accountingRouter.get('/trial-balance', wrap(async (req, res) => {
  const period = String(req.query.period ?? '');
  const rows = await query(`SELECT a.code, a.name, a.type, COALESCE(SUM(jl.debit),0) AS debit, COALESCE(SUM(jl.credit),0) AS credit
    FROM gl_accounts a LEFT JOIN journal_lines jl ON jl.account_code=a.code LEFT JOIN journal_entries je ON je.id=jl.journal_id AND ($1 = '' OR je.period = $1)
    WHERE jl.id IS NULL OR je.id IS NOT NULL GROUP BY a.code, a.name, a.type ORDER BY a.code`, [period]);
  const totals = rows.reduce((t: any, r: any) => ({ debit: t.debit + r.debit, credit: t.credit + r.credit }), { debit: 0, credit: 0 });
  res.json({ rows, totals: { debit: round2(totals.debit), credit: round2(totals.credit) } });
}));

/* ---------- Periods and year-end ---------- */
accountingRouter.get('/periods', wrap(async (_req, res) => {
  await ensurePeriod(pool, periodOf(today()));
  res.json({ periods: await query('SELECT * FROM accounting_periods ORDER BY period DESC'), fiscalYears: await query('SELECT * FROM fiscal_years ORDER BY year DESC') });
}));

accountingRouter.post('/periods/:period/close', requireModule('ADA'), wrap(async (req, res) => {
  const period = req.params.period;
  if (!/^\d{4}-\d{2}$/.test(period)) throw notFound('Period not found');
  const p = await ensurePeriod(pool, period);
  if (p!.status === 'closed') throw conflict('Period already closed');
  await tx(async (c) => {
    await query("UPDATE accounting_periods SET status='closed', closed_at=now(), closed_by=$2 WHERE period=$1", [period, req.user!.id], c);
    await audit(c, req.user, { action: 'period.close', entity: 'period', entityId: period, before: { status: 'open' }, after: { status: 'closed' } });
  });
  res.json({ ok: true });
}));

accountingRouter.post('/periods/:period/reopen', requireModule('ADA'), wrap(async (req, res) => {
  const period = req.params.period;
  const p = await one<any>('SELECT * FROM accounting_periods WHERE period=$1', [period]);
  if (!p) throw notFound('Period not found');
  if (p.status !== 'closed') throw conflict('Period is not closed');
  const { reason } = parse(z.object({ reason: z.string().min(3) }), req.body);
  await tx(async (c) => {
    await query("UPDATE accounting_periods SET status='open', reopened_at=now(), reopened_by=$2 WHERE period=$1", [period, req.user!.id], c);
    await audit(c, req.user, { action: 'period.reopen', entity: 'period', entityId: period, before: { status: 'closed' }, after: { status: 'open', reason } });
  });
  res.json({ ok: true });
}));

/** Year-end closing: nominal accounts close to retained earnings; real accounts carry forward. */
accountingRouter.post('/fiscal-years/:year/close', requireModule('ADA'), wrap(async (req, res) => {
  const year = Number(req.params.year);
  if (!Number.isInteger(year) || year < 2000) throw notFound('Fiscal year not found');
  const out = await tx(async (c) => {
    const r = await closeFiscalYear(c, year, req.user!.id);
    await audit(c, req.user, { action: 'fiscal_year.close', entity: 'fiscal_year', entityId: year, after: r });
    return r;
  });
  res.json(out);
}));

/* ---------- Remittance schedule (weekly extract of applied payments) → Disbursement ---------- */
accountingRouter.get('/remittances', wrap(async (_req, res) => {
  res.json({ remittances: await query('SELECT r.*, i.name AS insurer_name, u.full_name AS created_by_name, d.status AS disbursement_status FROM remittances r JOIN insurers i ON i.id=r.insurer_id LEFT JOIN users u ON u.id=r.created_by LEFT JOIN disbursements d ON d.id=r.disbursement_id ORDER BY r.id DESC LIMIT 300') });
}));

accountingRouter.get('/remittances/due', wrap(async (_req, res) => {
  const rows = await query(`SELECT i.id AS insurer_id, i.name AS insurer_name, COUNT(p.id)::int AS policies, COALESCE(SUM(p.total_amount - p.commission),0) AS amount, array_agg(p.id) AS policy_ids
    FROM policies p JOIN insurers i ON i.id=p.insurer_id JOIN invoices inv ON inv.policy_id=p.id AND inv.status='paid'
    WHERE p.status IN ('in_force','renewed','expired') AND NOT EXISTS (SELECT 1 FROM commission_receivables d WHERE d.policy_id=p.id)
      AND NOT EXISTS (SELECT 1 FROM remittances r WHERE p.id = ANY(r.policy_ids) AND r.status <> 'rejected')
    GROUP BY i.id, i.name ORDER BY i.name`);
  res.json({ due: rows });
}));

/** Extract: sanitised applied payments per insurer become a remittance schedule. */
accountingRouter.post('/remittances', requireModule('ADA'), wrap(async (req, res) => {
  const b = parse(z.object({ insurerId: z.number().int().positive(), policyIds: z.array(z.number().int().positive()).min(1) }), req.body);
  const out = await tx(async (c) => {
    const ins = await one<any>('SELECT * FROM insurers WHERE id=$1', [b.insurerId], c);
    if (!ins) throw notFound('Insurer not found');
    const pols = await query<any>(`SELECT p.id, p.policy_no, (p.total_amount - p.commission) AS net FROM policies p JOIN invoices inv ON inv.policy_id=p.id AND inv.status='paid'
      WHERE p.id = ANY($1) AND p.insurer_id=$2 AND NOT EXISTS (SELECT 1 FROM remittances r WHERE p.id = ANY(r.policy_ids) AND r.status <> 'rejected')
      AND NOT EXISTS (SELECT 1 FROM commission_receivables d WHERE d.policy_id=p.id)`, [b.policyIds, b.insurerId], c);
    if (pols.length !== b.policyIds.length) throw conflict('One or more policies are unpaid, already remitted, paid directly to the insurer, or belong to another insurer');
    const amount = round2(pols.reduce((s, p) => s + p.net, 0));
    const voucherNo = await nextNumber(c, 'RS', 'RS');
    const r = await one<{ id: number }>('INSERT INTO remittances(voucher_no, insurer_id, amount, policy_ids, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [voucherNo, b.insurerId, amount, b.policyIds, req.user!.id], c);
    await audit(c, req.user, { action: 'remittance.extract', entity: 'remittance', entityId: r!.id, after: { voucherNo, amount, policies: pols.length } });
    return { id: r!.id, scheduleNo: voucherNo, amount, policies: pols.length };
  });
  res.status(201).json(out);
}));

/** Submit the schedule to Disbursement: creates the disbursement request that goes through review → approval → payment. */
accountingRouter.post('/remittances/:id/submit', requireModule('ADA'), wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const out = await tx(async (c) => {
    const r = await one<any>('SELECT r.*, i.name AS insurer_name FROM remittances r JOIN insurers i ON i.id=r.insurer_id WHERE r.id=$1 FOR UPDATE OF r', [id], c);
    if (!r) throw notFound('Remittance schedule not found');
    if (r.status !== 'extracted') throw conflict(`Schedule is ${r.status}`);
    const d = await createDisbursement(c, req.user!, { type: 'remittance', payeeName: r.insurer_name, insurerId: r.insurer_id, amount: r.amount, mode: 'cheque', sourceType: 'remittance', sourceId: id });
    await query("UPDATE remittances SET status='submitted', disbursement_id=$2 WHERE id=$1", [id, d.id], c);
    await audit(c, req.user, { action: 'remittance.submit', entity: 'remittance', entityId: id, after: { disbursementId: d.id } });
    return { disbursementId: d.id, voucherNo: d.voucherNo };
  });
  res.status(201).json(out);
}));

/* ---------- ACSL: statement-of-account reconciliation with the insurer ---------- */
accountingRouter.get('/soa-recons', wrap(async (_req, res) => {
  res.json({ recons: await query('SELECT s.*, i.name AS insurer_name FROM insurer_soa_recons s JOIN insurers i ON i.id=s.insurer_id ORDER BY s.id DESC LIMIT 100') });
}));

/** Compares the insurer's SOA lines (per policy net due) with the ledger position; a discrepancy is adjusted via a maker-checker journal. */
accountingRouter.post('/soa-recons', requireModule('ADA'), wrap(async (req, res) => {
  const b = parse(z.object({ insurerId: z.number().int().positive(), lines: z.array(z.object({ policyNo: z.string(), amount: z.number() })).min(1) }), req.body);
  const ledger = await query<any>(`SELECT p.policy_no, (p.total_amount - p.commission) AS net, EXISTS (SELECT 1 FROM remittances r WHERE p.id = ANY(r.policy_ids) AND r.status='paid') AS remitted
    FROM policies p WHERE p.insurer_id=$1 AND p.booked_at IS NOT NULL`, [b.insurerId]);
  const byNo = new Map(ledger.map((l) => [l.policy_no.toUpperCase(), l]));
  const lines = b.lines.map((l) => {
    const led = byNo.get(l.policyNo.trim().toUpperCase());
    const ledgerAmount = led && !led.remitted ? round2(led.net) : 0;
    return { policyNo: l.policyNo, statementAmount: l.amount, ledgerAmount, variance: round2(l.amount - ledgerAmount), known: !!led };
  });
  const statementTotal = round2(lines.reduce((s, l) => s + l.statementAmount, 0));
  const ledgerTotal = round2(lines.reduce((s, l) => s + l.ledgerAmount, 0));
  const variance = round2(statementTotal - ledgerTotal);
  const status = Math.abs(variance) < 0.005 ? 'balanced' : 'discrepancy';
  const out = await tx(async (c) => {
    const reconNo = await nextNumber(c, 'SOA', 'SOA');
    const r = await one<{ id: number }>('INSERT INTO insurer_soa_recons(recon_no, insurer_id, statement_total, ledger_total, variance, status, lines, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [reconNo, b.insurerId, statementTotal, ledgerTotal, variance, status, JSON.stringify(lines), req.user!.id], c);
    await audit(c, req.user, { action: 'soa_recon.create', entity: 'soa_recon', entityId: r!.id, after: { reconNo, status, variance } });
    return { id: r!.id, reconNo, status, variance, lines };
  });
  res.status(201).json(out);
}));

/** Manual SL adjustment for a discrepancy: drafted by the accounting processor, posted after TL/approver review. */
accountingRouter.post('/soa-recons/:id/adjust', requireModule('ADA'), wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = parse(z.object({ description: z.string().min(5), lines: z.array(lineSchema).min(2) }), req.body);
  const rec = await one<any>('SELECT * FROM insurer_soa_recons WHERE id=$1', [id]);
  if (!rec) throw notFound('Reconciliation not found');
  if (rec.status !== 'discrepancy') throw conflict('Only a discrepancy can be adjusted');
  const out = await tx(async (c) => {
    const approvalId = await createApproval(c, req.user!, { requestType: 'journal', entity: 'journal_draft', entityId: id, summary: `SL adjustment for ${rec.recon_no}: ${b.description}`, payload: { entryDate: today(), description: `${rec.recon_no}: ${b.description}`, lines: b.lines } });
    await query("UPDATE insurer_soa_recons SET status='adjusted' WHERE id=$1", [id], c);
    await audit(c, req.user, { action: 'soa_recon.adjust', entity: 'soa_recon', entityId: id, after: { approvalId } });
    return { approvalId };
  });
  res.status(201).json(out);
}));

export const GL_CODES = GL;
