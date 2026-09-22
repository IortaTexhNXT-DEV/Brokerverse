import type { Queryable } from '../db.js';
import { query } from '../db.js';

export interface MailMessage { to: string | null | undefined; subject: string; body: string; template: string; refType?: string; refId?: string | number }

/** Emails are captured to a validation outbox; wire an SMTP relay in production. */
export async function sendMail(q: Queryable, m: MailMessage) {
  await query('INSERT INTO email_outbox(to_addr, subject, body, template, ref_type, ref_id) VALUES ($1,$2,$3,$4,$5,$6)',
    [m.to || 'unknown@client.local', m.subject, m.body, m.template, m.refType ?? null, m.refId === undefined ? null : String(m.refId)], q);
}
