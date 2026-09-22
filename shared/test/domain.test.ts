import { describe, it, expect } from 'vitest';
import { rate, screenName, riskAssessment, classifyRow, isBalanced, periodOf, ageingBucket, soundex, ROLES, MODULES } from '../src';

describe('rating engine', () => {
  it('computes premium, taxes and commission', () => {
    const r = rate({ sumInsured: 1_000_000, baseRate: 0.0125, minPremium: 500, commissionRate: 0.15, vatRate: 0.12, dstRate: 0.125, lgtRate: 0.0075, fstRate: 0 });
    expect(r.premium).toBe(12500);
    expect(r.vat).toBe(1500);
    expect(r.dst).toBe(1562.5);
    expect(r.lgt).toBe(93.75);
    expect(r.total).toBe(15656.25);
    expect(r.commission).toBe(1875);
    expect(r.dueToInsurer).toBe(13781.25);
  });
  it('applies minimum premium', () => {
    const r = rate({ sumInsured: 1000, baseRate: 0.01, minPremium: 500, commissionRate: 0.1, vatRate: 0.12, dstRate: 0.125, lgtRate: 0.0075, fstRate: 0.02 });
    expect(r.premium).toBe(500);
    expect(r.fst).toBe(10);
  });
  it('rejects non-positive sum insured', () => {
    expect(() => rate({ sumInsured: 0, baseRate: 0.01, minPremium: 0, commissionRate: 0, vatRate: 0, dstRate: 0, lgtRate: 0, fstRate: 0 })).toThrow();
  });
});

describe('screening', () => {
  const list = [{ name: 'Juan Dela Cruz', listSource: 'OFAC' }, { name: 'Abu Sayyaf Group', listSource: 'UN' }];
  it('exact match scores 100', () => {
    expect(screenName('juan dela cruz', list)[0]).toMatchObject({ method: 'exact', score: 100 });
  });
  it('fuzzy match on close spelling', () => {
    const hits = screenName('Juan De la Cruz', list);
    expect(hits[0].method).toBe('fuzzy');
    expect(hits[0].score).toBeGreaterThanOrEqual(80);
  });
  it('phonetic match', () => {
    expect(soundex('Robert')).toBe('R163');
    expect(soundex('Rupert')).toBe('R163');
    const hits = screenName('Jon Dale Cruise', list);
    expect(hits[0]).toMatchObject({ method: 'phonetic', score: 70, listName: 'Juan Dela Cruz' });
  });
  it('no match is clear', () => {
    expect(screenName('Maria Santos', list)).toHaveLength(0);
    const a = riskAssessment({ hits: [], pep: false, clientType: 'individual' });
    expect(a).toMatchObject({ tier: 'low', status: 'clear', cdd: 'simplified' });
  });
  it('PEP floors tier at medium', () => {
    const a = riskAssessment({ hits: [], pep: true, clientType: 'individual' });
    expect(a.tier).toBe('medium');
    expect(a.cdd).toBe('standard');
  });
  it('exact hit is high risk with enhanced CDD', () => {
    const a = riskAssessment({ hits: screenName('Juan Dela Cruz', list), pep: false, clientType: 'corporate' });
    expect(a).toMatchObject({ tier: 'high', status: 'hit', cdd: 'enhanced' });
  });
});

describe('submitted policies classification', () => {
  const inForce = [
    { policyNo: 'POL-2026-00001', expiryDate: '2026-12-31', clientName: 'A' },
    { policyNo: 'POL-2026-00002', expiryDate: '2026-10-15', clientName: 'B' },
  ];
  const asOf = new Date('2026-09-01');
  it('masterlist, renewal, fallout, excluded', () => {
    expect(classifyRow({ policyNo: 'pol-2026-00001', clientName: 'A', premium: 100 }, inForce, asOf).classification).toBe('masterlist');
    expect(classifyRow({ policyNo: 'POL 2026 00002', clientName: 'B', premium: 100 }, inForce, asOf).classification).toBe('renewal');
    expect(classifyRow({ policyNo: 'POL-2026-09999', clientName: 'Z', premium: 100 }, inForce, asOf).classification).toBe('fallout');
    expect(classifyRow({ policyNo: 'POL-2026-00001', clientName: 'A', premium: null }, inForce, asOf).classification).toBe('excluded');
  });
});

describe('ledger helpers', () => {
  it('balanced check', () => {
    expect(isBalanced([{ accountCode: '1000', debit: 10 }, { accountCode: '2000', credit: 10 }])).toBe(true);
    expect(isBalanced([{ accountCode: '1000', debit: 10 }, { accountCode: '2000', credit: 9.99 }])).toBe(false);
    expect(isBalanced([{ accountCode: '1000', debit: 0 }])).toBe(false);
  });
  it('period and ageing', () => {
    expect(periodOf('2026-09-22T00:00:00Z')).toBe('2026-09');
    expect(ageingBucket(-5)).toBe('current');
    expect(ageingBucket(45)).toBe('31-60');
    expect(ageingBucket(400)).toBe('180+');
  });
});

describe('personas and modules', () => {
  it('has twelve personas and sixteen modules', () => {
    expect(ROLES).toHaveLength(12);
    expect(MODULES).toHaveLength(16);
  });
  it('every role only references known modules', () => {
    const codes = new Set(MODULES.map((m) => m.code));
    for (const r of ROLES) for (const m of r.modules) expect(codes.has(m)).toBe(true);
  });
});
