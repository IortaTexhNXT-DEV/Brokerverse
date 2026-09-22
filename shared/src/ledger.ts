/** Double-entry helpers. Pure. */
export interface LineInput { accountCode: string; debit?: number; credit?: number; memo?: string }

export function isBalanced(lines: LineInput[]): boolean {
  const d = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const c = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  return Math.abs(d - c) < 0.005 && lines.length >= 2;
}

export function periodOf(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function ageingBucket(daysOverdue: number): '0-30' | '31-60' | '61-90' | '91-180' | '180+' | 'current' {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return '0-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  if (daysOverdue <= 180) return '91-180';
  return '180+';
}
