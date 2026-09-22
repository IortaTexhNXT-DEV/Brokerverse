import type { Queryable } from '../db.js';
import { one } from '../db.js';

/** Atomic document numbering, e.g. POL-2026-00001. Sequences are per key and year. */
export async function nextNumber(q: Queryable, key: string, prefix: string, width = 5): Promise<string> {
  const year = new Date().getUTCFullYear();
  const seqKey = `${key}:${year}`;
  const row = await one<{ last_no: number }>(
    `INSERT INTO sequences(key, prefix, last_no) VALUES ($1, $2, 1)
     ON CONFLICT (key) DO UPDATE SET last_no = sequences.last_no + 1 RETURNING last_no`,
    [seqKey, prefix], q);
  return `${prefix}-${year}-${String(row!.last_no).padStart(width, '0')}`;
}
