import type { PoolClient } from 'pg';
import { one, query } from '../db.js';
import type { AuthUser } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { nextNumber } from '../lib/numbering.js';
import { sendMail } from '../lib/mail.js';
import { conflict, notFound } from '../lib/errors.js';
import { GL, postJournal, today, addDays } from './ledger.js';
import { registerApprovalHandler } from './approvals.js';
import { round2 } from '@brokerverse/shared';

export interface PolicyRow { id: number; policy_no: string; status: string; client_id: number; quotation_id: number | null; renewed_from_id: number | null; total_amount: number; commission: number; inception_date: string; expiry_date: string; insurer_id: number; client_name: string; client_email: string; insurer_name: string; sftp_enrolled: boolean }

export async function loadPolicy(c: PoolClient, id: number, lock = false): Promise<PolicyRow> {
  const p = await one<PolicyRow>(`SELECT p.*, cl.name AS client_name, cl.email AS client_email, i.name AS insurer_name, i.sftp_enrolled
    FROM policies p JOIN clients cl ON cl.id=p.client_id JOIN insurers i ON i.id=p.insurer_id WHERE p.id=$1 ${lock ? 'FOR UPDATE OF p' : ''}`, [id], c);
  if (!p) throw notFound('Policy not found');
  return p;
}

/** Placement: the placement slip goes to the insurer (SFTP when enrolled, otherwise email). */
export async function requestPlacement(c: PoolClient, p: PolicyRow, actor: AuthUser) {
  await query("UPDATE policies SET status='placement_requested', placement_requested_at=now(), return_reason=NULL WHERE id=$1", [p.id], c);
  await sendMail(c, { to: `placements@${p.insurer_name.toLowerCase().replaceAll(/[^a-z]/g, '')}.local`, subject: `Placement slip ${p.policy_no}`, body: `Placement slip for ${p.client_name}, policy ${p.policy_no}, period ${p.inception_date} to ${p.expiry_date}. Channel: ${p.sftp_enrolled ? 'SFTP' : 'email'}.`, template: 'placement-slip', refType: 'policy', refId: p.id });
  await audit(c, actor, { action: 'policy.placement.request', entity: 'policy', entityId: p.id, after: { channel: p.sftp_enrolled ? 'sftp' : 'email' } });
}

const channelFor = (p: PolicyRow) => (p.sftp_enrolled ? 'sftp' : 'email');

/** E-policy dispatch after booking: SFTP-enrolled insurers send via COG, others by email; failures fall out to the contact centre. */
export async function dispatchEPolicy(c: PoolClient, p: PolicyRow, invoiceNo: string, actor: AuthUser, fail = false) {
  const channel = fail ? 'contact_centre' : channelFor(p);
  const exception = fail ? 'Delivery failed; e-policy artefacts forwarded to BDOI Contact Centre for manual send' : null;
  await query('UPDATE policies SET epolicy_channel=$2, epolicy_sent_at=now(), epolicy_exception=$3 WHERE id=$1', [p.id, channel, exception], c);
  await sendMail(c, { to: fail ? 'contact-centre@brokerverse.local' : p.client_email, subject: `Your e-Policy ${p.policy_no}`, body: `Dear ${p.client_name},\n\nYour policy ${p.policy_no} is now in force from ${p.inception_date} to ${p.expiry_date}. Total amount due: PHP ${Number(p.total_amount).toFixed(2)} (invoice ${invoiceNo}).\n\nBrokerVerse`, template: fail ? 'e-policy-exception' : 'e-policy', refType: 'policy', refId: p.id });
}

/** Booking/invoicing after checker approval: policy in force, invoice raised, journal posted, e-policy dispatched. */
export async function activatePolicy(c: PoolClient, policyId: number, actor: AuthUser) {
  const p = await loadPolicy(c, policyId, true);
  if (p.status !== 'pending_approval') throw conflict(`Policy ${p.policy_no} is ${p.status}`);
  const entryDate = today();
  const jv = await postJournal(c, {
    entryDate, description: `Policy booking ${p.policy_no} – ${p.client_name}`, sourceType: 'policy', sourceId: p.id, postedBy: actor.id,
    lines: [
      { accountCode: GL.PREMIUM_RECEIVABLE, debit: p.total_amount, memo: 'Premium receivable' },
      { accountCode: GL.DUE_TO_INSURERS, credit: round2(p.total_amount - p.commission), memo: 'Net due to insurer' },
      { accountCode: GL.COMMISSION_INCOME, credit: p.commission, memo: 'Brokerage commission' },
    ],
  });
  const invoiceNo = await nextNumber(c, 'INV', 'INV');
  const inv = await one<{ id: number }>('INSERT INTO invoices(invoice_no, policy_id, client_id, amount, due_date) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [invoiceNo, p.id, p.client_id, p.total_amount, addDays(entryDate, 30)], c);
  await query("UPDATE policies SET status='in_force', issued_at=now(), booked_at=now() WHERE id=$1", [p.id], c);
  if (p.quotation_id) await query("UPDATE quotations SET status='converted' WHERE id=$1", [p.quotation_id], c);
  if (p.renewed_from_id) await query("UPDATE policies SET status='renewed' WHERE id=$1 AND status IN ('in_force','expired')", [p.renewed_from_id], c);
  await dispatchEPolicy(c, p, invoiceNo, actor);
  await audit(c, actor, { action: 'policy.book', entity: 'policy', entityId: p.id, before: { status: 'pending_approval' }, after: { status: 'in_force', invoiceNo, jvNo: jv.jvNo } });
  return { policyNo: p.policy_no, invoiceNo, jvNo: jv.jvNo, invoiceId: inv!.id };
}

registerApprovalHandler('policy_issue', async (c, a, decision, checker) => {
  if (decision === 'approved') return activatePolicy(c, a.entity_id, checker);
  return query("UPDATE policies SET status='rejected' WHERE id=$1 AND status='pending_approval' RETURNING policy_no", [a.entity_id], c);
});
