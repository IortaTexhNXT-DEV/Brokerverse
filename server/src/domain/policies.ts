import type { PoolClient } from 'pg';
import { one, query } from '../db.js';
import type { AuthUser } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { nextNumber } from '../lib/numbering.js';
import { sendMail } from '../lib/mail.js';
import { conflict, notFound } from '../lib/errors.js';
import { GL, postJournal, today } from './ledger.js';

/** Approved issuance: policy goes in force, invoice raised, journal posted, e-policy emailed. */
export async function activatePolicy(c: PoolClient, policyId: number, actor: AuthUser) {
  const p = await one<any>('SELECT p.*, cl.name AS client_name, cl.email AS client_email FROM policies p JOIN clients cl ON cl.id = p.client_id WHERE p.id = $1 FOR UPDATE OF p', [policyId], c);
  if (!p) throw notFound('Policy not found');
  if (p.status !== 'pending_approval') throw conflict(`Policy ${p.policy_no} is ${p.status}`);
  const entryDate = today();
  const jv = await postJournal(c, {
    entryDate,
    description: `Policy issuance ${p.policy_no} – ${p.client_name}`,
    sourceType: 'policy', sourceId: p.id, postedBy: actor.id,
    lines: [
      { accountCode: GL.PREMIUM_RECEIVABLE, debit: p.total_amount, memo: 'Premium receivable' },
      { accountCode: GL.DUE_TO_INSURERS, credit: Math.round((p.total_amount - p.commission) * 100) / 100, memo: 'Net due to insurer' },
      { accountCode: GL.COMMISSION_INCOME, credit: p.commission, memo: 'Brokerage commission' },
    ],
  });
  const invoiceNo = await nextNumber(c, 'INV', 'INV');
  const due = new Date(); due.setUTCDate(due.getUTCDate() + 30);
  const inv = await one<{ id: number }>(
    'INSERT INTO invoices(invoice_no, policy_id, client_id, amount, due_date) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [invoiceNo, p.id, p.client_id, p.total_amount, due.toISOString().slice(0, 10)], c);
  await query("UPDATE policies SET status='in_force', issued_at=now() WHERE id=$1", [p.id], c);
  if (p.quotation_id) await query("UPDATE quotations SET status='converted' WHERE id=$1", [p.quotation_id], c);
  if (p.renewed_from_id) await query("UPDATE policies SET status='renewed' WHERE id=$1 AND status IN ('in_force','expired')", [p.renewed_from_id], c);
  await sendMail(c, p.client_email, `Your e-Policy ${p.policy_no}`, `Dear ${p.client_name},\n\nYour policy ${p.policy_no} is now in force from ${p.inception_date} to ${p.expiry_date}. Total amount due: PHP ${Number(p.total_amount).toFixed(2)} (invoice ${invoiceNo}).\n\nBrokerVerse`, 'e-policy', 'policy', p.id);
  await audit(c, actor, 'policy.issue', 'policy', p.id, { status: 'pending_approval' }, { status: 'in_force', invoiceNo, jvNo: jv.jvNo });
  return { policyNo: p.policy_no, invoiceNo, jvNo: jv.jvNo, invoiceId: inv!.id };
}
