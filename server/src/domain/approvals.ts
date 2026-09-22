import type { PoolClient } from 'pg';
import { one, query } from '../db.js';
import type { AuthUser } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { conflict, notFound, forbidden } from '../lib/errors.js';
import { activatePolicy } from './policies.js';

export type RequestType = 'policy_issue' | 'remittance' | 'claim_settlement';

export async function createApproval(c: PoolClient, maker: AuthUser, requestType: RequestType, entity: string, entityId: number, summary: string, payload: unknown = {}, note?: string) {
  const row = await one<{ id: number }>(
    'INSERT INTO approvals(request_type, entity, entity_id, summary, payload, maker_id, maker_note) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [requestType, entity, entityId, summary, JSON.stringify(payload), maker.id, note ?? null], c);
  await audit(c, maker, 'approval.request', 'approval', row!.id, null, { requestType, entity, entityId, summary });
  return row!.id;
}

/** Checker decision. Segregation of duties: maker may never check their own request. */
export async function decideApproval(c: PoolClient, checker: AuthUser, id: number, decision: 'approved' | 'rejected', note?: string) {
  const a = await one<any>('SELECT * FROM approvals WHERE id = $1 FOR UPDATE', [id], c);
  if (!a) throw notFound('Approval request not found');
  if (a.status !== 'pending') throw conflict(`Request already ${a.status}`);
  if (a.maker_id === checker.id) throw forbidden('Segregation of duties: a maker cannot check their own request');
  await query('UPDATE approvals SET status=$2, checker_id=$3, checker_note=$4, decided_at=now() WHERE id=$1', [id, decision, checker.id, note ?? null], c);
  let effect: unknown = null;
  if (a.request_type === 'policy_issue') {
    effect = decision === 'approved'
      ? await activatePolicy(c, a.entity_id, checker)
      : await query("UPDATE policies SET status='rejected' WHERE id=$1 AND status='pending_approval' RETURNING policy_no", [a.entity_id], c);
  } else if (a.request_type === 'remittance') {
    effect = await query('UPDATE remittances SET status=$2 WHERE id=$1 RETURNING voucher_no, status', [a.entity_id, decision === 'approved' ? 'approved' : 'rejected'], c);
  } else if (a.request_type === 'claim_settlement') {
    if (decision === 'approved') {
      effect = await query("UPDATE claims SET status='approved', updated_at=now() WHERE id=$1 RETURNING claim_no, status", [a.entity_id], c);
      await query('INSERT INTO claim_events(claim_id, user_id, event, note) VALUES ($1,$2,$3,$4)', [a.entity_id, checker.id, 'approved', note ?? null], c);
    } else {
      effect = await query("UPDATE claims SET status='under_review', updated_at=now() WHERE id=$1 RETURNING claim_no, status", [a.entity_id], c);
      await query('INSERT INTO claim_events(claim_id, user_id, event, note) VALUES ($1,$2,$3,$4)', [a.entity_id, checker.id, 'settlement_rejected', note ?? null], c);
    }
  }
  await audit(c, checker, `approval.${decision}`, 'approval', id, { status: 'pending' }, { status: decision, note });
  return { id, status: decision, effect };
}
