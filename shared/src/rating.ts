/** Product rating engine: premium, Philippine statutory taxes and broker commission. Pure. */
export interface RatingInput {
  sumInsured: number;
  baseRate: number;        // fraction, e.g. 0.0125 = 1.25%
  minPremium: number;
  commissionRate: number;  // fraction of premium
  vatRate: number;         // 0.12
  dstRate: number;         // 0.125
  lgtRate: number;         // 0.0075
  fstRate: number;         // 0.02 for fire lines, else 0
}

export interface RatingResult {
  premium: number;
  vat: number;
  dst: number;
  lgt: number;
  fst: number;
  taxes: number;
  total: number;
  commission: number;
  dueToInsurer: number;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function rate(input: RatingInput): RatingResult {
  if (Number.isNaN(input.sumInsured) || input.sumInsured <= 0) throw new Error('sumInsured must be positive');
  const premium = round2(Math.max(input.sumInsured * input.baseRate, input.minPremium));
  const vat = round2(premium * input.vatRate);
  const dst = round2(premium * input.dstRate);
  const lgt = round2(premium * input.lgtRate);
  const fst = round2(premium * input.fstRate);
  const taxes = round2(vat + dst + lgt + fst);
  const total = round2(premium + taxes);
  const commission = round2(premium * input.commissionRate);
  const dueToInsurer = round2(total - commission);
  return { premium, vat, dst, lgt, fst, taxes, total, commission, dueToInsurer };
}
