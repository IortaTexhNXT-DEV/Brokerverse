import type { Queryable } from '../db.js';
import { one, query } from '../db.js';
import { conflict, badRequest } from '../lib/errors.js';
import { nextNumber } from '../lib/numbering.js';
import { isBalanced, periodOf, type LineInput } from '@brokerverse/shared';

export const GL = {
  CASH: '1000',
  PREMIUM_RECEIVABLE: '1200',
  DUE_TO_INSURERS: '2100',
  TAXES_PAYABLE: '2200',
  COMMISSION_INCOME: '4100',
  CLAIMS_RECOVERY: '4200',
  BANK_CHARGES: '5100',
} as const;

export async function ensurePeriod(q: Queryable, period: string) {
  await query('INSERT INTO accounting_periods(period) VALUES ($1) ON CONFLICT DO NOTHING', [period], q);
  return one<{ period: string; status: string }>('SELECT period, status FROM accounting_periods WHERE period = $1', [period], q);
}

export interface PostJournalInput {
  entryDate: string; // YYYY-MM-DD
  description: string;
  lines: LineInput[];
  sourceType?: string;
  sourceId?: string | number;
  postedBy?: number;
}

/** Posts a balanced double-entry journal into an open accounting period. */
export async function postJournal(q: Queryable, input: PostJournalInput) {
  if (!isBalanced(input.lines)) throw badRequest('Journal is not balanced');
  const period = periodOf(input.entryDate);
  const p = await ensurePeriod(q, period);
  if (p!.status !== 'open') throw conflict(`Accounting period ${period} is closed`);
  const jvNo = await nextNumber(q, 'JV', 'JV');
  const je = await one<{ id: number }>(
    'INSERT INTO journal_entries(jv_no, period, entry_date, description, source_type, source_id, posted_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [jvNo, period, input.entryDate, input.description, input.sourceType ?? null, input.sourceId === undefined ? null : String(input.sourceId), input.postedBy ?? null], q);
  for (const l of input.lines) {
    await query('INSERT INTO journal_lines(journal_id, account_code, debit, credit, memo) VALUES ($1,$2,$3,$4,$5)',
      [je!.id, l.accountCode, l.debit ?? 0, l.credit ?? 0, l.memo ?? null], q);
  }
  return { id: je!.id, jvNo, period };
}

export const today = () => new Date().toISOString().slice(0, 10);
