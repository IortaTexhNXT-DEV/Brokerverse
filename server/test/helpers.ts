import request from 'supertest';
import { createApp } from '../src/app.js';
import { DEMO_PASSWORD } from '../src/seed.js';

export const app = createApp();
export const ADMIN_PASSWORD = 'Admin@123';

const tokens = new Map<string, string>();
export async function tokenFor(username: string): Promise<string> {
  if (tokens.has(username)) return tokens.get(username)!;
  const password = username === 'admin' ? ADMIN_PASSWORD : DEMO_PASSWORD;
  const res = await request(app).post('/api/auth/login').send({ username, password });
  if (res.status !== 200) throw new Error(`login failed for ${username}: ${res.status} ${JSON.stringify(res.body)}`);
  tokens.set(username, res.body.token);
  return res.body.token;
}

export function as(username: string) {
  return {
    get: async (url: string) => request(app).get(url).set('Authorization', `Bearer ${await tokenFor(username)}`),
    post: async (url: string, body?: unknown) => request(app).post(url).set('Authorization', `Bearer ${await tokenFor(username)}`).send(body ?? {}),
    patch: async (url: string, body?: unknown) => request(app).patch(url).set('Authorization', `Bearer ${await tokenFor(username)}`).send(body ?? {}),
  };
}

export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const todayIso = () => iso(new Date());
export const daysFromNow = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

let seq = 0;
export const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export const NB = 'nb.officer';
export const UW = 'uw.head';
export const CASHIER = 'cashier';
export const CLAIMS = 'claims';
export const ACCT = 'accountant';
export const FIN = 'fin.head';

export async function newClient(username: string, name: string, extra: Record<string, unknown> = {}) {
  const res = await as(username).post('/api/clients', { name, type: 'corporate', email: `${name.toLowerCase().replaceAll(/[^a-z]/g, '')}@example.com`, tin: `TIN-${uniq()}`, ...extra });
  if (res.status !== 201) throw new Error(`client create failed: ${JSON.stringify(res.body)}`);
  return res.body as { id: number; clientNo: string; screening: any };
}

export async function productId(code: string) {
  const res = await as('admin').get('/api/products');
  return res.body.products.find((p: any) => p.code === code).id as number;
}
export async function insurerId(code: string) {
  const res = await as('admin').get('/api/insurers');
  return res.body.insurers.find((p: any) => p.code === code).id as number;
}

function must(res: request.Response, what: string, code = 201) {
  if (res.status !== code) throw new Error(`${what} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

export interface IssueOpts { product?: string; insurer?: string; sumInsured?: number; inceptionDate?: string }

/** Quote → proposal → client acceptance → placement → insurer places → booking under maker-checker → in force with invoice. */
export async function quoteAndAccept(clientId: number, opts: IssueOpts = {}) {
  const nb = as(NB);
  const q = must(await nb.post('/api/new-business/quotations', { clientId, productId: await productId(opts.product ?? 'MTR-CMP'), insurerId: await insurerId(opts.insurer ?? 'MAL'), sumInsured: opts.sumInsured ?? 1_000_000, inceptionDate: opts.inceptionDate ?? todayIso() }), 'quote');
  must(await nb.post(`/api/new-business/quotations/${q.id}/send-proposal`), 'send proposal', 200);
  must(await nb.post(`/api/new-business/quotations/${q.id}/decision`, { decision: 'accepted' }), 'accept', 200);
  return q as { id: number; quoteNo: string; rating: any };
}

export async function placePolicy(quotationId: number) {
  const nb = as(NB);
  const placed = must(await nb.post(`/api/new-business/quotations/${quotationId}/request-placement`), 'request placement');
  must(await nb.post(`/api/new-business/policies/${placed.policyId}/placement-response`, { outcome: 'placed', insurerPolicyRef: `INS-${uniq()}` }), 'placement response', 200);
  return placed as { policyId: number; policyNo: string };
}

export async function issuePolicy(clientId: number, opts: IssueOpts = {}) {
  const q = await quoteAndAccept(clientId, opts);
  const placed = await placePolicy(q.id);
  const book = must(await as(NB).post(`/api/new-business/policies/${placed.policyId}/book`, { note: 'test' }), 'book');
  must(await as(UW).post(`/api/approvals/${book.approvalId}/decide`, { decision: 'approved', note: 'ok' }), 'approve', 200);
  const det = await as(NB).get(`/api/new-business/policies/${placed.policyId}`);
  return { policyId: placed.policyId, policyNo: placed.policyNo, invoice: det.body.invoices[0], quote: q, policy: det.body.policy };
}

export async function payInvoice(invoiceId: number, amount: number, channel = 'otc_cash') {
  return must(await as(CASHIER).post('/api/operations/payments', { invoiceId, amount, channel, reference: 'TEST' }), 'payment');
}

/** Disbursement chain: reviewer (accountant ≠ requester) → Finance Head approval → payment. */
export async function runDisbursement(disbursementId: number, reviewer = ACCT, approver = FIN, payer = ACCT) {
  const review = must(await as(reviewer).post(`/api/disbursements/${disbursementId}/review`, { ok: true }), 'review', 200);
  must(await as(approver).post(`/api/approvals/${review.approvalId}/decide`, { decision: 'approved' }), 'approve disbursement', 200);
  return must(await as(payer).post(`/api/disbursements/${disbursementId}/pay`, { reference: `CHQ-${uniq()}` }), 'pay', 200) as { jvNo: string };
}
