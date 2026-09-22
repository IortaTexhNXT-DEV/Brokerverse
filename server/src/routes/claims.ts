import { Router, z, one, query, tx, requireModule, wrap, audit, nextNumber, sendMail, idParam, parse, conflict, notFound, createApproval } from '../lib/kit.js';
import type { PoolClient } from 'pg';
import type { AuthUser } from '../lib/auth.js';
import { registerApprovalHandler } from '../domain/approvals.js';

export const claimsRouter = Router();
claimsRouter.use(requireModule('CLM', 'RPT', 'CSF'));

const claimSelect = `SELECT c.*, cl.name AS client_name, cl.email AS client_email, p.policy_no, p.expiry_date, p.sum_insured, pr.name AS product_name, pr.line, i.name AS insurer_name, (CURRENT_DATE - c.reported_date) AS age_days,
  (SELECT COUNT(*)::int FROM claim_documents d WHERE d.claim_id=c.id AND d.required AND NOT d.received) AS missing_documents
  FROM claims c JOIN clients cl ON cl.id=c.client_id JOIN policies p ON p.id=c.policy_id JOIN products pr ON pr.id=p.product_id JOIN insurers i ON i.id=p.insurer_id`;
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Document requirements by line of business (motor vs non-motor claim process). */
const REQUIRED_DOCUMENTS: Record<string, string[]> = {
  motor: ['Claim form', 'Police report / affidavit', "Driver's license", 'OR/CR', 'Photos of damage', 'Repair estimate'],
  default: ['Claims Reporting Form (CRF)', 'Proof of loss', 'Photos / evidence', 'Supporting invoices'],
};

claimsRouter.get('/', wrap(async (req, res) => {
  const status = String(req.query.status ?? '');
  const q = String(req.query.q ?? '').trim();
  res.json({ claims: await query(`${claimSelect} WHERE ($1 = '' OR c.status=$1) AND ($2 = '' OR c.claim_no ILIKE '%'||$2||'%' OR cl.name ILIKE '%'||$2||'%' OR p.policy_no ILIKE '%'||$2||'%') ORDER BY c.id DESC LIMIT 500`, [status, q]) });
}));

claimsRouter.get('/:id', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const claim = await one(`${claimSelect} WHERE c.id=$1`, [id]);
  if (!claim) throw notFound('Claim not found');
  const [events, documents] = await Promise.all([
    query('SELECT e.*, u.full_name AS user_name FROM claim_events e LEFT JOIN users u ON u.id=e.user_id WHERE claim_id=$1 ORDER BY e.id', [id]),
    query('SELECT * FROM claim_documents WHERE claim_id=$1 ORDER BY id', [id]),
  ]);
  res.json({ claim, events, documents });
}));

async function loadPolicyForClaim(policyNo: string) {
  const p = await one<any>('SELECT p.*, cl.name AS client_name, cl.email AS client_email, pr.line FROM policies p JOIN clients cl ON cl.id=p.client_id JOIN products pr ON pr.id=p.product_id WHERE p.policy_no=$1', [policyNo.trim().toUpperCase()]);
  if (!p) throw notFound('Policy not found');
  if (!['in_force', 'renewed', 'expired'].includes(p.status)) throw conflict(`Policy ${p.policy_no} is ${p.status}`);
  return p;
}

async function assertClaimsAcceptance(p: any, lossDate: string, estimated: number) {
  if (lossDate < p.inception_date || lossDate > p.expiry_date) throw conflict(`Loss date is outside the policy period ${p.inception_date} to ${p.expiry_date}`);
  const outstanding = await one<{ balance: number }>("SELECT COALESCE(SUM(amount - paid_amount),0) AS balance FROM invoices WHERE policy_id=$1 AND status <> 'paid'", [p.id]);
  if ((outstanding?.balance ?? 0) > 0) throw conflict(`Claims Acceptance Control: unpaid premium of PHP ${Number(outstanding!.balance).toFixed(2)} on ${p.policy_no}`, { code: 'CAC_UNPAID_PREMIUM', balance: outstanding!.balance });
  if (estimated > p.sum_insured) throw conflict('Estimated amount exceeds sum insured');
}

async function logEvent(c: PoolClient, claimId: number, userId: number, event: string, note?: string | null) {
  await query('INSERT INTO claim_events(claim_id, user_id, event, note) VALUES ($1,$2,$3,$4)', [claimId, userId, event, note ?? null], c);
}

/** Notice of loss: Claims Acceptance Control, Preliminary Loss Advice to the client, document checklist by line. */
claimsRouter.post('/', requireModule('CLM'), wrap(async (req, res) => {
  const b = parse(z.object({ policyNo: z.string().min(3), lossDate: DATE, description: z.string().min(5), estimatedAmount: z.number().min(0) }), req.body);
  const p = await loadPolicyForClaim(b.policyNo);
  await assertClaimsAcceptance(p, b.lossDate, b.estimatedAmount);
  const out = await tx(async (c) => {
    const claimNo = await nextNumber(c, 'CLM', 'CLM');
    const r = await one<{ id: number }>('INSERT INTO claims(claim_no, policy_id, client_id, loss_date, description, estimated_amount, reserve_amount, created_by) VALUES ($1,$2,$3,$4,$5,$6,$6,$7) RETURNING id',
      [claimNo, p.id, p.client_id, b.lossDate, b.description, b.estimatedAmount, req.user!.id], c);
    for (const name of REQUIRED_DOCUMENTS[p.line] ?? REQUIRED_DOCUMENTS.default) await query('INSERT INTO claim_documents(claim_id, name) VALUES ($1,$2)', [r!.id, name], c);
    await logEvent(c, r!.id, req.user!.id, 'registered', `Estimated PHP ${b.estimatedAmount.toFixed(2)}`);
    await sendMail(c, { to: p.client_email, subject: `Preliminary Loss Advice ${claimNo}`, body: `Dear ${p.client_name},\n\nWe have registered claim ${claimNo} under policy ${p.policy_no} for loss on ${b.lossDate}. Please submit the required documents so we can lodge the claim with the insurer.\n\nBrokerVerse Claims`, template: 'preliminary-loss-advice', refType: 'claim', refId: r!.id });
    await audit(c, req.user, { action: 'claim.register', entity: 'claim', entityId: r!.id, after: { claimNo, policyNo: p.policy_no, estimatedAmount: b.estimatedAmount } });
    return { id: r!.id, claimNo };
  });
  res.status(201).json(out);
}));

/** Document completion: when every required document is received the claim moves to documents_complete. */
claimsRouter.post('/:id/documents', requireModule('CLM'), wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = parse(z.object({ name: z.string().min(2), received: z.boolean(), required: z.boolean().optional() }), req.body);
  const out = await tx(async (c) => {
    const cl = await one<any>('SELECT * FROM claims WHERE id=$1 FOR UPDATE', [id], c);
    if (!cl) throw notFound('Claim not found');
    await query(`INSERT INTO claim_documents(claim_id, name, required, received, received_at) VALUES ($1,$2,COALESCE($3,true),$4, CASE WHEN $4 THEN now() END)
      ON CONFLICT (claim_id, name) DO UPDATE SET received=EXCLUDED.received, received_at=EXCLUDED.received_at, required=COALESCE($3, claim_documents.required)`, [id, b.name, b.required ?? null, b.received], c);
    const missing = await one<{ n: number }>('SELECT COUNT(*)::int AS n FROM claim_documents WHERE claim_id=$1 AND required AND NOT received', [id], c);
    let status = cl.status;
    if (missing!.n === 0 && cl.status === 'registered') { status = 'documents_complete'; await query("UPDATE claims SET status='documents_complete', updated_at=now() WHERE id=$1", [id], c); await logEvent(c, id, req.user!.id, 'documents_complete'); }
    if (missing!.n > 0 && cl.status === 'documents_complete') { status = 'registered'; await query("UPDATE claims SET status='registered', updated_at=now() WHERE id=$1", [id], c); }
    return { status, missing: missing!.n };
  });
  res.json(out);
}));

registerApprovalHandler('claim_settlement', async (c, a, decision, checker, note) => {
  const to = decision === 'approved' ? 'approved' : 'offer_accepted';
  await query('UPDATE claims SET status=$2, updated_at=now() WHERE id=$1', [a.entity_id, to], c);
  await logEvent(c, a.entity_id, checker.id, decision === 'approved' ? 'approved' : 'settlement_rejected', note);
  return { status: to };
});

const TRANSITIONS: Record<string, string[]> = {
  registered: ['declined'],
  documents_complete: ['fla_sent', 'declined'],
  fla_sent: ['under_review', 'declined'],
  under_review: ['offer_received', 'declined'],
  offer_received: ['offer_accepted', 'offer_contested'],
  offer_accepted: ['settlement_requested'],
  approved: ['settled'],
  settled: ['closed'],
  declined: ['closed'],
};

interface TransitionBody { event: string; note?: string; amount?: number; adjusterRequired?: boolean; insurerClaimRef?: string; settlementMode?: 'cash' | 'loa' }
interface TransitionResult { status: string; approvalId?: number }
type StepHandler = (c: PoolClient, cl: any, b: TransitionBody, user: AuthUser) => Promise<TransitionResult>;

const insurerMailbox = (cl: any) => `claims@${String(cl.insurer_name).toLowerCase().replaceAll(/[^a-z]/g, '')}.local`;
const money = (n: unknown) => Number(n).toFixed(2);

const STEPS: Record<string, StepHandler> = {
  async fla_sent(c, cl, b) {
    await query('UPDATE claims SET fla_sent_at=now(), adjuster_required=$2 WHERE id=$1', [cl.id, !!b.adjusterRequired], c);
    const adjuster = b.adjusterRequired ? ' Adjuster inspection requested.' : '';
    await sendMail(c, { to: insurerMailbox(cl), subject: `Formal Loss Advice ${cl.claim_no}`, body: `Policy ${cl.policy_no}, loss ${cl.loss_date}: ${cl.description}. Estimated PHP ${money(cl.estimated_amount)}.${adjuster}`, template: 'formal-loss-advice', refType: 'claim', refId: cl.id });
    return { status: 'fla_sent' };
  },
  async offer_received(c, cl, b) {
    if (b.amount === undefined) throw conflict('Offer amount is required');
    if (b.amount > cl.sum_insured) throw conflict('Offer exceeds sum insured');
    await query('UPDATE claims SET offer_amount=$2, offer_received_at=now(), reserve_amount=$2, insurer_claim_ref=COALESCE($3, insurer_claim_ref) WHERE id=$1', [cl.id, b.amount, b.insurerClaimRef ?? null], c);
    await sendMail(c, { to: cl.client_email, subject: `Settlement offer on ${cl.claim_no}`, body: `The insurer offers PHP ${money(b.amount)}. Please confirm acceptance or advise your position.`, template: 'claim-offer', refType: 'claim', refId: cl.id });
    return { status: 'offer_received' };
  },
  async offer_contested(c, cl, b) {
    if (!b.note) throw conflict("Provide the insured's position for the insurer");
    await sendMail(c, { to: insurerMailbox(cl), subject: `Offer contested – ${cl.claim_no}`, body: b.note, template: 'claim-offer-contested', refType: 'claim', refId: cl.id });
    return { status: 'under_review' };
  },
  async settlement_requested(c, cl, b, user) {
    const amt = b.amount ?? cl.offer_amount ?? cl.reserve_amount;
    if (amt > cl.sum_insured) throw conflict('Settlement exceeds sum insured');
    const mode = b.settlementMode ?? cl.settlement_mode ?? 'cash';
    await query('UPDATE claims SET reserve_amount=$2, settlement_mode=$3 WHERE id=$1', [cl.id, amt, mode], c);
    const approvalId = await createApproval(c, user, { requestType: 'claim_settlement', entity: 'claim', entityId: cl.id, summary: `Settle ${cl.claim_no} for ${cl.client_name} – PHP ${money(amt)} (${mode})`, payload: { amount: amt }, note: b.note });
    return { status: 'offer_accepted', approvalId };
  },
  async settled(c, cl, b) {
    const mode = b.settlementMode ?? cl.settlement_mode ?? 'cash';
    await query('UPDATE claims SET paid_amount=reserve_amount, settlement_mode=$2 WHERE id=$1', [cl.id, mode], c);
    await sendMail(c, { to: cl.client_email, subject: `Claim ${cl.claim_no} settled`, body: `Settlement of PHP ${money(cl.reserve_amount)} via ${mode}.`, template: 'claim-settled', refType: 'claim', refId: cl.id });
    return { status: 'settled' };
  },
  async declined(c, cl, b) {
    await sendMail(c, { to: cl.client_email, subject: `Claim ${cl.claim_no} declined`, body: b.note ?? 'The insurer has declined the claim.', template: 'claim-declined', refType: 'claim', refId: cl.id });
    return { status: 'declined' };
  },
};
const passThrough: StepHandler = async (_c, _cl, b) => ({ status: b.event });

claimsRouter.post('/:id/transition', requireModule('CLM'), wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = parse(z.object({ event: z.enum(['fla_sent', 'under_review', 'offer_received', 'offer_accepted', 'offer_contested', 'settlement_requested', 'settled', 'declined', 'closed']), note: z.string().optional(), amount: z.number().min(0).optional(), adjusterRequired: z.boolean().optional(), insurerClaimRef: z.string().optional(), settlementMode: z.enum(['cash', 'loa']).optional() }), req.body);
  const out = await tx(async (c) => {
    const cl = await one<any>(`${claimSelect} WHERE c.id=$1 FOR UPDATE OF c`, [id], c);
    if (!cl) throw notFound('Claim not found');
    if (!TRANSITIONS[cl.status]?.includes(b.event)) throw conflict(`Cannot ${b.event.replaceAll('_', ' ')} a claim that is ${cl.status.replaceAll('_', ' ')}`);
    const r = await (STEPS[b.event] ?? passThrough)(c, cl, b, req.user!);
    await query('UPDATE claims SET status=$2, updated_at=now() WHERE id=$1', [id, r.status], c);
    await logEvent(c, id, req.user!.id, b.event, b.note);
    await audit(c, req.user, { action: `claim.${b.event}`, entity: 'claim', entityId: id, before: { status: cl.status }, after: { status: r.status, note: b.note } });
    return { ok: true, ...r };
  });
  res.json(out);
}));
