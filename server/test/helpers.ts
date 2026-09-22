import request from 'supertest';
import { createApp } from '../src/app.js';
import { DEMO_PASSWORD } from '../src/seed.js';

export const app = createApp();

const tokens = new Map<string, string>();
export async function tokenFor(username: string): Promise<string> {
  if (tokens.has(username)) return tokens.get(username)!;
  const password = username === 'admin' ? 'Admin@123' : DEMO_PASSWORD;
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

export async function newClient(username: string, name: string, extra: Record<string, unknown> = {}) {
  const res = await as(username).post('/api/clients', { name, type: 'corporate', email: `${name.toLowerCase().replace(/[^a-z]/g, '')}@example.com`, tin: `${Math.floor(Math.random() * 1e9)}`, ...extra });
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

/** Quote → bind → checker approval → in-force policy with invoice. */
export async function issuePolicy(clientId: number, opts: { product?: string; insurer?: string; sumInsured?: number; inceptionDate?: string } = {}) {
  const nb = as('nb.officer');
  const q = await nb.post('/api/new-business/quotations', { clientId, productId: await productId(opts.product ?? 'MTR-CMP'), insurerId: await insurerId(opts.insurer ?? 'MAL'), sumInsured: opts.sumInsured ?? 1_000_000, inceptionDate: opts.inceptionDate ?? todayIso() });
  if (q.status !== 201) throw new Error(`quote failed: ${JSON.stringify(q.body)}`);
  const bind = await nb.post(`/api/new-business/quotations/${q.body.id}/issue`, { note: 'test' });
  if (bind.status !== 201) throw new Error(`bind failed: ${JSON.stringify(bind.body)}`);
  const dec = await as('uw.head').post(`/api/approvals/${bind.body.approvalId}/decide`, { decision: 'approved', note: 'ok' });
  if (dec.status !== 200) throw new Error(`approve failed: ${JSON.stringify(dec.body)}`);
  const det = await nb.get(`/api/new-business/policies/${bind.body.policyId}`);
  return { policyId: bind.body.policyId as number, policyNo: bind.body.policyNo as string, invoice: det.body.invoices[0], quote: q.body, policy: det.body.policy };
}

export async function payInvoice(invoiceId: number, amount: number) {
  const res = await as('cashier').post('/api/operations/receipts', { invoiceId, amount, method: 'transfer', reference: 'TEST' });
  if (res.status !== 201) throw new Error(`receipt failed: ${JSON.stringify(res.body)}`);
  return res.body;
}
