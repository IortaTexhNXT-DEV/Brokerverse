import { describe, it, expect, afterAll } from 'vitest';
import { as } from './helpers.js';
import { closePool } from '../src/db.js';
import { DEMO_USERS } from '../src/seed.js';
import { MODULES } from '@brokerverse/shared';

afterAll(closePool);

/** Every screen the web app can open, expressed as the GET endpoints it loads. */
const SCREENS: Record<string, string[]> = {
  NB: ['/api/new-business/quotations', '/api/new-business/policies', '/api/clients', '/api/products', '/api/insurers', '/api/tsu'],
  OPS: ['/api/operations/invoices', '/api/operations/receipts', '/api/operations/payments', '/api/operations/direct-payments', '/api/operations/endorsements', '/api/operations/production-recons', '/api/insurers'],
  CLXN: ['/api/collections/outstanding', '/api/collections/cte'],
  ADA: ['/api/disbursements', '/api/accounting/remittances', '/api/accounting/remittances/due', '/api/refunds', '/api/accounting/journals', '/api/accounting/accounts', '/api/accounting/trial-balance', '/api/accounting/periods', '/api/accounting/soa-recons', '/api/insurers'],
  CLM: ['/api/claims'],
  RN: ['/api/renewals/pipeline'],
  RI: ['/api/reinsurance/treaties', '/api/reinsurance/cessions', '/api/reinsurance/placements'],
  EB: ['/api/employee-benefits/schemes', '/api/clients', '/api/insurers'],
  CSF: ['/api/servicing/requests', '/api/clients', '/api/servicing/search?q=POL'],
  SS: ['/api/clients'],
  PM: ['/api/products', '/api/products/release-advisories', '/api/tsu', '/api/clients', '/api/insurers'],
  SP: ['/api/submitted-policies/batches', '/api/submitted-policies/expiring', '/api/insurers'],
  UAM: ['/api/users', '/api/users/roles'],
  DM: ['/api/data-migration/batches'],
  RPT: ['/api/reports/dashboard', '/api/reports/production'],
  CORE: ['/api/approvals', '/api/audit', '/api/outbox'],
};

describe('every persona can open every screen in its menu, and nothing returns a server error', () => {
  const personas = [{ username: 'admin', role: 'ADMIN' }, ...DEMO_USERS];
  for (const p of personas) {
    it(`${p.username} (${p.role})`, async () => {
      const me = await as(p.username).get('/api/auth/me');
      expect(me.status).toBe(200);
      const modules: string[] = me.body.user.modules;
      for (const m of MODULES) {
        const entitled = modules.includes(m.code);
        for (const path of SCREENS[m.code] ?? []) {
          const r = await as(p.username).get(path);
          expect(r.status, `${p.username} GET ${path}`).toBeLessThan(500);
          if (entitled) expect(r.status, `${p.username} GET ${path} (entitled to ${m.code})`).toBe(200);
        }
      }
      // Hand-typed URL outside the persona's modules is refused
      const outside = MODULES.find((m) => !modules.includes(m.code));
      if (outside) {
        const r = await as(p.username).get(SCREENS[outside.code][0]);
        expect(r.status).toBe(403);
      }
    });
  }
});
