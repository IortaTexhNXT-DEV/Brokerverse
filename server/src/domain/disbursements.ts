import type { PoolClient } from 'pg';
import { one, query } from '../db.js';
import type { AuthUser } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { nextNumber } from '../lib/numbering.js';
import { sendMail } from '../lib/mail.js';
import { conflict, notFound } from '../lib/errors.js';
import { GL, postJournal, today } from './ledger.js';
import { registerApprovalHandler } from './approvals.js';

export type DisbursementType = 'refund' | 'remittance' | 'supplier' | 'reimbursement' | 'cash_advance' | 'other';
export interface NewDisbursement { type: DisbursementType; payeeName: string; clientId?: number; insurerId?: number; amount: number; mode: 'cheque' | 'credit_to_account' | 'online_banking' | 'managers_cheque'; bankDetails?: string; sourceType?: string; sourceId?: number }

/** Disbursement request enters the maker → reviewer → approver → payment chain. */
export async function createDisbursement(c: PoolClient, requester: AuthUser, d: NewDisbursement) {
  const voucherNo = await nextNumber(c, 'PV', 'PV');
  const r = await one<{ id: number }>(
    'INSERT INTO disbursements(voucher_no, type, payee_name, client_id, insurer_id, amount, mode, bank_details, source_type, source_id, requested_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
    [voucherNo, d.type, d.payeeName, d.clientId ?? null, d.insurerId ?? null, d.amount, d.mode, d.bankDetails ?? null, d.sourceType ?? null, d.sourceId ?? null, requester.id], c);
  await audit(c, requester, { action: 'disbursement.request', entity: 'disbursement', entityId: r!.id, after: { voucherNo, ...d } });
  return { id: r!.id, voucherNo };
}

const DEBIT_ACCOUNT: Record<DisbursementType, string> = { refund: GL.REFUNDS_PAYABLE, remittance: GL.DUE_TO_INSURERS, supplier: '5200', reimbursement: '5200', cash_advance: '5200', other: '5200' };

registerApprovalHandler('disbursement', async (c, a, decision, checker) => {
  const d = await one<any>('SELECT * FROM disbursements WHERE id=$1 FOR UPDATE', [a.entity_id], c);
  const status = decision === 'approved' ? 'approved' : 'rejected';
  await query('UPDATE disbursements SET status=$2, approved_by=$3 WHERE id=$1', [d.id, status, checker.id], c);
  if (status === 'rejected' && d.source_type === 'remittance') await query("UPDATE remittances SET status='rejected' WHERE id=$1", [d.source_id], c);
  if (status === 'rejected' && d.source_type === 'refund_request') await query("UPDATE refund_requests SET status='rejected' WHERE id=$1", [d.source_id], c);
  return { status };
});

/** Payment: posts to the GL by mode of payment, tags the source paid and emails the requestor's confirmation. */
export async function payDisbursement(c: PoolClient, id: number, reference: string, actor: AuthUser) {
  const d = await one<any>('SELECT d.*, u.email AS requester_email FROM disbursements d LEFT JOIN users u ON u.id=d.requested_by WHERE d.id=$1 FOR UPDATE OF d', [id], c);
  if (!d) throw notFound('Disbursement not found');
  if (d.status !== 'approved') throw conflict(`Disbursement is ${d.status}; final approval is required before payment`);
  const jv = await postJournal(c, { entryDate: today(), description: `Disbursement ${d.voucher_no} (${d.type}) to ${d.payee_name}`, sourceType: 'disbursement', sourceId: id, postedBy: actor.id,
    lines: [{ accountCode: DEBIT_ACCOUNT[d.type as DisbursementType], debit: d.amount, memo: d.voucher_no }, { accountCode: GL.CASH, credit: d.amount, memo: `${d.mode} ${reference}` }] });
  await query("UPDATE disbursements SET status='paid', reference=$2, journal_id=$3, paid_by=$4, paid_at=now(), confirmation_sent=true WHERE id=$1", [id, reference, jv.id, actor.id], c);
  if (d.source_type === 'remittance') {
    await query("UPDATE remittances SET status='paid', cheque_no=$2, journal_id=$3, paid_at=now() WHERE id=$1", [d.source_id, reference, jv.id], c);
    await sendMail(c, { to: `remittances@${String(d.payee_name).toLowerCase().replaceAll(/[^a-z]/g, '')}.local`, subject: `Remittance schedule ${d.voucher_no}`, body: `Remittance of PHP ${Number(d.amount).toFixed(2)} by ${d.mode} ${reference}.`, template: 'remittance-schedule', refType: 'disbursement', refId: id });
  }
  if (d.source_type === 'refund_request') await query("UPDATE refund_requests SET status='sent_to_disbursement' WHERE id=$1", [d.source_id], c);
  await sendMail(c, { to: d.requester_email, subject: `Disbursement ${d.voucher_no} completed`, body: `PHP ${Number(d.amount).toFixed(2)} paid to ${d.payee_name} via ${d.mode} (${reference}).`, template: 'disbursement-confirmation', refType: 'disbursement', refId: id });
  await audit(c, actor, { action: 'disbursement.pay', entity: 'disbursement', entityId: id, before: { status: 'approved' }, after: { status: 'paid', reference, jvNo: jv.jvNo } });
  return { jvNo: jv.jvNo };
}
