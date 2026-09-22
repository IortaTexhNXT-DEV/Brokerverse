/** Submitted-policies masterlist classification. Pure. */
export type Classification = 'masterlist' | 'renewal' | 'excluded' | 'fallout';

export interface InForcePolicy { policyNo: string; expiryDate: string; clientName: string }
export interface SubmittedRow { policyNo: string; clientName: string; premium: number | null }

export function sanitizePolicyNo(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function classifyRow(row: SubmittedRow, inForce: InForcePolicy[], asOf: Date, renewalWindowDays = 60): { classification: Classification; matchedPolicyNo?: string } {
  if (row.premium === null || !(row.premium > 0) || !row.policyNo) return { classification: 'excluded' };
  const key = sanitizePolicyNo(row.policyNo);
  const match = inForce.find((p) => sanitizePolicyNo(p.policyNo) === key);
  if (match) {
    const expiry = new Date(match.expiryDate);
    const days = (expiry.getTime() - asOf.getTime()) / 86400000;
    return { classification: days <= renewalWindowDays ? 'renewal' : 'masterlist', matchedPolicyNo: match.policyNo };
  }
  return { classification: 'fallout' };
}
