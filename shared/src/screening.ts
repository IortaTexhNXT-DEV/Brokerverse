/** Sanction screening: exact, fuzzy (Levenshtein) and phonetic (Soundex) name matching, weighted risk scoring. Pure. */
export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1).fill(0).map((_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

export function similarity(a: string, b: string): number {
  const x = normalizeName(a), y = normalizeName(b);
  if (!x.length && !y.length) return 1;
  const d = levenshtein(x, y);
  return 1 - d / Math.max(x.length, y.length);
}

export function soundex(word: string): string {
  const w = word.toUpperCase().replace(/[^A-Z]/g, '');
  if (!w) return '';
  const codes: Record<string, string> = {
    B: '1', F: '1', P: '1', V: '1', C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3', L: '4', M: '5', N: '5', R: '6',
  };
  let out = w[0];
  let last = codes[w[0]] ?? '';
  for (let i = 1; i < w.length && out.length < 4; i++) {
    const c = w[i];
    const code = codes[c] ?? '';
    if (code && code !== last) out += code;
    if (c !== 'H' && c !== 'W') last = code;
  }
  return (out + '000').slice(0, 4);
}

export function phoneticKey(name: string): string {
  return normalizeName(name).split(' ').filter(Boolean).map(soundex).sort().join('-');
}

export type MatchMethod = 'exact' | 'fuzzy' | 'phonetic';

export interface ScreeningHit {
  listName: string;
  method: MatchMethod;
  score: number; // 0-100
  listSource?: string;
  category?: string;
}

export interface ListEntry { name: string; listSource?: string; category?: string }

export function screenName(name: string, list: ListEntry[], fuzzyThreshold = 0.85): ScreeningHit[] {
  const hits: ScreeningHit[] = [];
  const n = normalizeName(name);
  const pk = phoneticKey(name);
  for (const e of list) {
    const en = normalizeName(e.name);
    if (n === en) { hits.push({ listName: e.name, method: 'exact', score: 100, listSource: e.listSource, category: e.category }); continue; }
    const sim = similarity(n, en);
    if (sim >= fuzzyThreshold) { hits.push({ listName: e.name, method: 'fuzzy', score: Math.round(sim * 95), listSource: e.listSource, category: e.category }); continue; }
    if (pk && pk === phoneticKey(e.name)) hits.push({ listName: e.name, method: 'phonetic', score: 70, listSource: e.listSource, category: e.category });
  }
  return hits.sort((a, b) => b.score - a.score);
}

export type RiskTier = 'low' | 'medium' | 'high';
export type ScreeningStatus = 'clear' | 'review' | 'hit';

export interface RiskInput {
  hits: ScreeningHit[];
  pep: boolean;
  clientType: 'individual' | 'corporate';
  highRiskCountry?: boolean;
}

function tierOf(score: number, pep: boolean): RiskTier {
  if (score >= 65) return 'high';
  if (score >= 35 || pep) return 'medium';
  return 'low';
}

function statusOf(topScore: number): ScreeningStatus {
  if (topScore >= 95) return 'hit';
  if (topScore >= 70) return 'review';
  return 'clear';
}

const CDD_BY_TIER: Record<RiskTier, 'simplified' | 'standard' | 'enhanced'> = { low: 'simplified', medium: 'standard', high: 'enhanced' };

/** Weighted score → tier → customer due-diligence level. PEP floors the tier at medium. */
export function riskAssessment(input: RiskInput): { score: number; tier: RiskTier; status: ScreeningStatus; cdd: 'simplified' | 'standard' | 'enhanced' } {
  const top = input.hits[0]?.score ?? 0;
  let score = Math.round(top * 0.7);
  if (input.pep) score += 25;
  if (input.highRiskCountry) score += 15;
  if (input.clientType === 'corporate') score += 5;
  score = Math.min(100, score);
  const tier = tierOf(score, input.pep);
  return { score, tier, status: statusOf(top), cdd: CDD_BY_TIER[tier] };
}
