import type { Queryable } from '../db.js';
import { query } from '../db.js';

/** Emails are captured to a validation outbox; wire an SMTP relay in production. */
export async function sendMail(q: Queryable, to: string, subject: string, body: string, template: string, refType?: string, refId?: string | number) {
  await query('INSERT INTO email_outbox(to_addr, subject, body, template, ref_type, ref_id) VALUES ($1,$2,$3,$4,$5,$6)',
    [to || 'unknown@client.local', subject, body, template, refType ?? null, refId === undefined ? null : String(refId)], q);
}
