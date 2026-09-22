import { ROLES } from '@brokerverse/shared';
import { fixtureFor } from './fixtures';

/**
 * Demo mode: a browser-side stand-in for the API so the published demo runs without a server.
 * Reads return sample data; writes succeed and return representative results, so every screen and action can be tried.
 */
const DEMO_USERS: Record<string, { fullName: string; roleCode: string; department: string }> = {
  admin: { fullName: 'System Administrator', roleCode: 'ADMIN', department: 'IT' },
  'nb.officer': { fullName: 'Maria Santos', roleCode: 'NB_OFFICER', department: 'New Business' },
  'uw.head': { fullName: 'Ramon Villareal', roleCode: 'UW_HEAD', department: 'Underwriting' },
  cashier: { fullName: 'Liza Bautista', roleCode: 'CASHIER', department: 'Operations' },
  collections: { fullName: 'Paolo Reyes', roleCode: 'COLLECTIONS', department: 'Collections' },
  accountant: { fullName: 'Grace Lim', roleCode: 'ACCOUNTANT', department: 'Finance' },
  'fin.head': { fullName: 'Antonio Cruz', roleCode: 'FIN_HEAD', department: 'Finance' },
  claims: { fullName: 'Jenny Ocampo', roleCode: 'CLAIMS', department: 'Claims' },
  renewals: { fullName: 'Carlo Mendoza', roleCode: 'RENEWALS', department: 'Renewals' },
  'ri.officer': { fullName: 'Ana Dizon', roleCode: 'RI_OFFICER', department: 'Reinsurance' },
  'eb.officer': { fullName: 'Mark Tan', roleCode: 'EB_OFFICER', department: 'Employee Benefits' },
  compliance: { fullName: 'Lily Belarmino', roleCode: 'COMPLIANCE', department: 'Compliance' },
};

function userFor(username: string) {
  const u = DEMO_USERS[username.toLowerCase()];
  if (!u) return null;
  const role = ROLES.find((r) => r.code === u.roleCode)!;
  const id = Object.keys(DEMO_USERS).indexOf(username.toLowerCase()) + 1;
  return { id, username: username.toLowerCase(), fullName: u.fullName, email: `${username}@brokerverse.local`, roleCode: u.roleCode, department: u.department, status: 'active', modules: role.modules, canApprove: role.canApprove };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const currentUser = () => { try { return JSON.parse(sessionStorage.getItem('bv.demo.user') ?? 'null'); } catch { return null; } };

function handleLogin(body: any): Response {
  const user = userFor(String(body?.username ?? ''));
  const password = String(body?.password ?? '');
  const ok = user && ((user.username === 'admin' && password === 'Admin@123') || (user.username !== 'admin' && password === 'Broker@123'));
  if (!ok) return json({ error: 'Invalid username or password' }, 401);
  try { sessionStorage.setItem('bv.demo.user', JSON.stringify(user)); } catch { /* ignore */ }
  return json({ token: `demo.${user.username}`, user });
}

function entitled(path: string, user: any): boolean {
  const first = path.replace(/^\/api\//, '').split(/[/?]/)[0];
  const byPath: Record<string, string[]> = { users: ['UAM'], accounting: ['ADA', 'RPT'], disbursements: ['ADA'], refunds: ['NB', 'CLXN', 'CSF', 'ADA', 'OPS'], claims: ['CLM', 'RPT', 'CSF'], renewals: ['RN', 'NB'], reinsurance: ['RI'], 'employee-benefits': ['EB'], servicing: ['CSF', 'CLM', 'CLXN'], 'submitted-policies': ['SP'], 'data-migration': ['DM'], reports: ['RPT'], approvals: ['CORE'], audit: ['CORE', 'UAM'], operations: ['OPS', 'CLXN'], collections: ['CLXN', 'OPS', 'RPT'], 'new-business': ['NB', 'RN'], tsu: ['PM', 'NB', 'RI'] };
  const needed = byPath[first];
  return !needed || needed.some((m) => user.modules.includes(m));
}

async function handle(url: string, init?: RequestInit): Promise<Response> {
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  const method = (init?.method ?? 'GET').toUpperCase();
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  if (path === '/api/auth/login') return handleLogin(body);
  if (path === '/api/health') return json({ ok: true, service: 'brokerverse-demo' });
  const user = currentUser();
  if (!user) return json({ error: 'Missing bearer token' }, 401);
  if (path === '/api/auth/me') return json({ user });
  if (!entitled(path, user)) return json({ error: `Persona ${user.roleCode} is not entitled to this module` }, 403);
  return respond(path, method);
}

async function respond(path: string, method: string): Promise<Response> {
  if (path.startsWith('/api/reports/production') && path.includes('format=csv')) return new Response('policy_no,client,premium\nPOL-2026-00001,Acme Logistics,12500', { headers: { 'Content-Type': 'text/csv' } });
  await new Promise((r) => setTimeout(r, 120));
  return json(fixtureFor(path, method), method === 'GET' ? 200 : 201);
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function installDemoApi() {
  const real = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    return url.includes('/api/') ? handle(url, init) : real(input, init);
  };
}
