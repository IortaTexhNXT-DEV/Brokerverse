import type { Queryable } from '../db.js';
import { query } from '../db.js';
import type { AuthUser } from './auth.js';

export interface AuditEntry { action: string; entity: string; entityId?: string | number | null; before?: unknown; after?: unknown }

const json = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(v));

/** Per-action audit trail with the acting user and before/after state. */
export async function audit(q: Queryable, user: AuthUser | undefined, e: AuditEntry) {
  await query(
    'INSERT INTO audit_log(user_id, username, action, entity, entity_id, before, after) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [user?.id ?? null, user?.username ?? 'system', e.action, e.entity, e.entityId === undefined || e.entityId === null ? null : String(e.entityId), json(e.before), json(e.after)],
    q,
  );
}
