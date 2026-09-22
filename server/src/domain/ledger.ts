import type { Queryable } from '../db.js';
import { one, query } from '../db.js';
import { conflict, badRequest } from '../lib/errors.js';
import { nextNumber } from '../lib/numbering.js';
import { isBalanced, periodOf, round2, type LineInput } from '@brokerverse/shared';

export const GL = {
  CASH: '1000',
  PREMIUM_RECEIVABLE: '1200',
  COMMISSION_RECEIVABLE: '1250',
  DUE_TO_INSURERS: '2100',
  TAXES_PAYABLE: '2200',
  UNAPPLIED_PREMIUM: '2400',
  REFUNDS_PAYABLE: '2500',
  RETAINED_EARNINGS: '3000',
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

async function assertPeriodOpen(q: Queryable, entryDate: string) {
  const period = periodOf(entryDate);
  const p = await ensurePeriod(q, period);
  if (p!.status !== 'open') throw conflict(`Accounting period ${period} is closed`);
  const fy = await one<{ status: string }>('SELECT status FROM fiscal_years WHERE year=$1', [Number(period.slice(0, 4))], q);
  if (fy?.status === 'closed') throw conflict(`Fiscal year ${period.slice(0, 4)} is closed`);
  return period;
}

/** Posts a balanced double-entry journal into an open accounting period and fiscal year. */
export async function postJournal(q: Queryable, input: PostJournalInput) {
  if (!isBalanced(input.lines)) throw badRequest('Journal is not balanced');
  const period = await assertPeriodOpen(q, input.entryDate);
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

/** Year-end: closes nominal (income/expense) accounts to retained earnings; real accounts carry forward. */
export async function closeFiscalYear(q: Queryable, year: number, userId: number) {
  const fy = await one<{ status: string }>('SELECT status FROM fiscal_years WHERE year=$1', [year], q);
  if (fy?.status === 'closed') throw conflict(`Fiscal year ${year} is already closed`);
  const openPeriods = await query<{ period: string }>("SELECT period FROM accounting_periods WHERE period LIKE $1 AND status='open'", [`${year}-%`], q);
  if (openPeriods.length) throw conflict(`Close periods ${openPeriods.map((p) => p.period).join(', ')} before closing the year`);
  const balances = await query<{ code: string; type: string; balance: number }>(
    `SELECT a.code, a.type, COALESCE(SUM(jl.debit - jl.credit),0) AS balance FROM gl_accounts a
     JOIN journal_lines jl ON jl.account_code=a.code JOIN journal_entries je ON je.id=jl.journal_id
     WHERE a.type IN ('income','expense') AND je.period LIKE $1 AND je.source_type <> 'year_end' GROUP BY a.code, a.type`, [`${year}-%`], q);
  const lines: LineInput[] = [];
  let net = 0;
  for (const b of balances) {
    if (Math.abs(b.balance) < 0.005) continue;
    lines.push(b.balance > 0 ? { accountCode: b.code, credit: round2(b.balance), memo: 'Year-end close' } : { accountCode: b.code, debit: round2(-b.balance), memo: 'Year-end close' });
    net = round2(net - b.balance);
  }
  let journalId: number | null = null;
  if (lines.length) {
    lines.push(net > 0 ? { accountCode: GL.RETAINED_EARNINGS, credit: net, memo: 'Net result for the year' } : { accountCode: GL.RETAINED_EARNINGS, debit: round2(-net), memo: 'Net result for the year' });
    await query("UPDATE accounting_periods SET status='open' WHERE period=$1", [`${year}-12`], q);
    const jv = await postJournal(q, { entryDate: `${year}-12-31`, description: `Year-end closing ${year}`, lines, sourceType: 'year_end', sourceId: year, postedBy: userId });
    await query("UPDATE accounting_periods SET status='closed' WHERE period=$1", [`${year}-12`], q);
    journalId = jv.id;
  }
  await query('INSERT INTO fiscal_years(year, status, closed_at, closed_by, closing_journal_id) VALUES ($1,$2,now(),$3,$4) ON CONFLICT (year) DO UPDATE SET status=$2, closed_at=now(), closed_by=$3, closing_journal_id=$4', [year, 'closed', userId, journalId], q);
  return { year, netResult: net, journalId };
}

export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (date: string, days: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
