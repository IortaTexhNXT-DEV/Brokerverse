import type { PoolClient } from 'pg';
import { one, query } from '../db.js';
import type { AuthUser } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { conflict, notFound, forbidden } from '../lib/errors.js';

export type Decision = 'approved' | 'rejected';
export interface ApprovalRow { id: number; request_type: string; entity: string; entity_id: number; payload: any; maker_id: number; status: string }
export type ApprovalHandler = (c: PoolClient, approval: ApprovalRow, decision: Decision, checker: AuthUser, note?: string) => Promise<unknown>;

/** Registry of maker-checker request types. Each domain registers how an approval or rejection is applied. */
const handlers = new Map<string, ApprovalHandler>();
export function registerApprovalHandler(requestType: string, handler: ApprovalHandler) { handlers.set(requestType, handler); }
export const approvalTypes = () => [...handlers.keys()];

export interface ApprovalRequest { requestType: string; entity: string; entityId: number; summary: string; payload?: unknown; note?: string }

export async function createApproval(c: PoolClient, maker: AuthUser, r: ApprovalRequest): Promise<number> {
  if (!handlers.has(r.requestType)) throw new Error(`No approval handler registered for ${r.requestType}`);
  const row = await one<{ id: number }>(
    'INSERT INTO approvals(request_type, entity, entity_id, summary, payload, maker_id, maker_note) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [r.requestType, r.entity, r.entityId, r.summary, JSON.stringify(r.payload ?? {}), maker.id, r.note ?? null], c);
  await audit(c, maker, { action: 'approval.request', entity: 'approval', entityId: row!.id, after: { requestType: r.requestType, entity: r.entity, entityId: r.entityId, summary: r.summary } });
  return row!.id;
}

/** Checker decision. Segregation of duties: a maker may never check their own request. */
export async function decideApproval(c: PoolClient, checker: AuthUser, id: number, decision: Decision, note?: string) {
  const a = await one<ApprovalRow>('SELECT * FROM approvals WHERE id = $1 FOR UPDATE', [id], c);
  if (!a) throw notFound('Approval request not found');
  if (a.status !== 'pending') throw conflict(`Request already ${a.status}`);
  if (a.maker_id === checker.id) throw forbidden('Segregation of duties: a maker cannot check their own request');
  const handler = handlers.get(a.request_type);
  if (!handler) throw conflict(`Unknown request type ${a.request_type}`);
  await query('UPDATE approvals SET status=$2, checker_id=$3, checker_note=$4, decided_at=now() WHERE id=$1', [id, decision, checker.id, note ?? null], c);
  const effect = await handler(c, a, decision, checker, note);
  await audit(c, checker, { action: `approval.${decision}`, entity: 'approval', entityId: id, before: { status: 'pending' }, after: { status: decision, note } });
  return { id, status: decision, effect };
}

/** Cancels any pending request for an entity (e.g. maker withdraws). */
export async function withdrawPending(c: PoolClient, entity: string, entityId: number, reason: string) {
  await query("UPDATE approvals SET status='rejected', checker_note=$3, decided_at=now() WHERE entity=$1 AND entity_id=$2 AND status='pending'", [entity, entityId, reason], c);
}
