import type { Queryable } from '../db.js';
import { query } from '../db.js';
import type { AuthUser } from './auth.js';

export async function audit(q: Queryable, user: AuthUser | undefined, action: string, entity: string, entityId: string | number | null, before: unknown, after: unknown) {
  await query(
    'INSERT INTO audit_log(user_id, username, action, entity, entity_id, before, after) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [user?.id ?? null, user?.username ?? 'system', action, entity, entityId === null ? null : String(entityId), before === undefined ? null : JSON.stringify(before), after === undefined ? null : JSON.stringify(after)],
    q,
  );
}
