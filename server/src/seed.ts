import { one, pool, query, tx } from './db.js';
import { hashPassword } from './lib/auth.js';
import { ROLES } from '@brokerverse/shared';
import { ensurePeriod, today } from './domain/ledger.js';
import { periodOf } from '@brokerverse/shared';

/** Reference data that every environment needs: personas, GL chart, sanctions list, default admin. Idempotent. */
export async function seedBaseline() {
  for (const r of ROLES) {
    await query('INSERT INTO roles(code, name, description, modules, can_approve) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, modules=EXCLUDED.modules, can_approve=EXCLUDED.can_approve',
      [r.code, r.name, r.description, r.modules, r.canApprove]);
  }
  const gl: [string, string, string][] = [
    ['1000', 'Cash and Bank', 'asset'], ['1200', 'Premium Receivable', 'asset'], ['1300', 'Claims Recoverable', 'asset'],
    ['2100', 'Due to Insurers', 'liability'], ['2200', 'Taxes Payable', 'liability'], ['2300', 'Due to Reinsurers', 'liability'],
    ['3000', 'Retained Earnings', 'equity'], ['4100', 'Commission Income', 'income'], ['4200', 'Claims Recovery Income', 'income'],
    ['5100', 'Bank Charges', 'expense'], ['5200', 'Operating Expenses', 'expense'],
  ];
  for (const [code, name, type] of gl) await query('INSERT INTO gl_accounts(code, name, type) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [code, name, type]);
  const sanctions: [string, string, string][] = [
    ['Abu Sayyaf Group', 'UN', 'terrorism'], ['Maute Group', 'UN', 'terrorism'], ['Juan Dela Cruz Sanctioned', 'OFAC', 'sanction'],
    ['Viktor Bout', 'OFAC', 'sanction'], ['Rodrigo Villanueva', 'AMLC', 'pep'], ['Ivan Petrov Holdings', 'EU', 'sanction'],
  ];
  const count = await one<{ n: number }>('SELECT COUNT(*)::int AS n FROM sanctions_list');
  if (!count || count.n === 0) for (const [name, src, cat] of sanctions) await query('INSERT INTO sanctions_list(name, list_source, category) VALUES ($1,$2,$3)', [name, src, cat]);
  if (!(await one('SELECT 1 FROM users WHERE username=$1', ['admin']))) {
    await query('INSERT INTO users(username, password_hash, full_name, email, role_code, department) VALUES ($1,$2,$3,$4,$5,$6)',
      ['admin', await hashPassword('Admin@123'), 'System Administrator', 'admin@brokerverse.local', 'ADMIN', 'IT']);
  }
  await ensurePeriod(pool, periodOf(today()));
}

export const DEMO_USERS: { username: string; fullName: string; role: string; department: string }[] = [
  { username: 'nb.officer', fullName: 'Maria Santos', role: 'NB_OFFICER', department: 'New Business' },
  { username: 'uw.head', fullName: 'Ramon Villareal', role: 'UW_HEAD', department: 'Underwriting' },
  { username: 'cashier', fullName: 'Liza Bautista', role: 'CASHIER', department: 'Operations' },
  { username: 'collections', fullName: 'Paolo Reyes', role: 'COLLECTIONS', department: 'Collections' },
  { username: 'accountant', fullName: 'Grace Lim', role: 'ACCOUNTANT', department: 'Finance' },
  { username: 'fin.head', fullName: 'Antonio Cruz', role: 'FIN_HEAD', department: 'Finance' },
  { username: 'claims', fullName: 'Jenny Ocampo', role: 'CLAIMS', department: 'Claims' },
  { username: 'renewals', fullName: 'Carlo Mendoza', role: 'RENEWALS', department: 'Renewals' },
  { username: 'ri.officer', fullName: 'Ana Dizon', role: 'RI_OFFICER', department: 'Reinsurance' },
  { username: 'eb.officer', fullName: 'Mark Tan', role: 'EB_OFFICER', department: 'Employee Benefits' },
  { username: 'compliance', fullName: 'Lily Belarmino', role: 'COMPLIANCE', department: 'Compliance' },
];
export const DEMO_PASSWORD = 'Broker@123';

/** Demo dataset for walkthroughs: one user per persona, products, insurers, treaties, clients and a threaded policy. */
export async function seedDemo() {
  const pw = await hashPassword(DEMO_PASSWORD);
  for (const u of DEMO_USERS) {
    await query('INSERT INTO users(username, password_hash, full_name, email, role_code, department) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (username) DO NOTHING',
      [u.username, pw, u.fullName, `${u.username}@brokerverse.local`, u.role, u.department]);
  }
  const insurers: [string, string, string][] = [['MAL', 'Malayan Insurance', 'A'], ['FPG', 'FPG Insurance', 'A'], ['STD', 'Standard Insurance', 'BBB'], ['PRU', 'Pru Life UK', 'AA']];
  for (const [code, name, rating] of insurers) await query('INSERT INTO insurers(code, name, security_rating) VALUES ($1,$2,$3) ON CONFLICT (code) DO NOTHING', [code, name, rating]);
  const products: any[] = [
    ['MTR-CMP', 'Motor Comprehensive', 'motor', 0.0125, 3000, 0.15, 0, 5_000_000, 2_000_000],
    ['MTR-CTPL', 'Motor CTPL', 'motor', 0.0056, 560, 0.10, 0, 200_000, null],
    ['FIRE-RES', 'Fire – Residential', 'fire', 0.0018, 1500, 0.20, 0.02, 50_000_000, 10_000_000],
    ['FIRE-COM', 'Fire – Commercial', 'fire', 0.0025, 5000, 0.20, 0.02, 500_000_000, 20_000_000],
    ['MAR-CGO', 'Marine Cargo', 'marine', 0.0040, 2500, 0.15, 0, 100_000_000, 25_000_000],
    ['PA-GRP', 'Group Personal Accident', 'accident', 0.0030, 1000, 0.15, 0, 20_000_000, null],
    ['CGL', 'Comprehensive General Liability', 'casualty', 0.0050, 5000, 0.175, 0, 100_000_000, 50_000_000],
  ];
  for (const [code, name, line, rate, min, comm, fst, max, survey] of products) {
    await query('INSERT INTO products(code, name, line, base_rate, min_premium, commission_rate, fst_rate, max_sum_insured, survey_required_above) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (code) DO NOTHING',
      [code, name, line, rate, min, comm, fst, max, survey]);
  }
  const yr = new Date().getUTCFullYear();
  const treaties: any[] = [
    ['QS-FIRE', 'Fire Quota Share', 'Munich Re', 'AA', 'quota_share', 0.40, 200_000_000],
    ['SURP-PROP', 'Property Surplus', 'Swiss Re', 'AA', 'surplus', 0.60, 500_000_000],
    ['XOL-MTR', 'Motor Excess of Loss', 'Hannover Re', 'A', 'xol', 0.10, 100_000_000],
  ];
  for (const [code, name, re, rating, type, rate, cap] of treaties) {
    await query('INSERT INTO treaties(code, name, reinsurer, reinsurer_rating, type, cession_rate, capacity, inception_date, expiry_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (code) DO NOTHING',
      [code, name, re, rating, type, rate, cap, `${yr}-01-01`, `${yr}-12-31`]);
  }
  if (await one('SELECT 1 FROM clients LIMIT 1')) return; // demo clients already present
  const admin = await one<{ id: number }>('SELECT id FROM users WHERE username=$1', ['admin']);
  const clients: any[] = [
    ['CLT-DEMO-0001', 'Toyota Motor Philippines Corp.', 'corporate', '000-123-456-000', 'fleet@toyota.example', false],
    ['CLT-DEMO-0002', 'Ayala Land Inc.', 'corporate', '000-222-333-000', 'risk@ayalaland.example', false],
    ['CLT-DEMO-0003', 'Jose Rizal Mercado', 'individual', '123-456-789-000', 'jose.rizal@example.com', false],
    ['CLT-DEMO-0004', 'Andrea Bonifacio', 'individual', '234-567-890-000', 'andrea.b@example.com', false],
    ['CLT-DEMO-0005', 'Rodrigo Villanueva', 'individual', '345-678-901-000', 'r.villanueva@example.com', true],
  ];
  await tx(async (c) => {
    for (const [no, name, type, tin, email, pep] of clients) {
      const risk = pep ? { score: 45, tier: 'medium', cdd: 'standard', status: 'review' } : { score: 5, tier: 'low', cdd: 'simplified', status: 'clear' };
      const row = await one<{ id: number }>('INSERT INTO clients(client_no, name, type, tin, email, pep, risk_score, risk_tier, cdd_level, screening_status, screened_at, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),$11) RETURNING id',
        [no, name, type, tin, email, pep, risk.score, risk.tier, risk.cdd, risk.status, admin!.id], c);
      if (pep) await query('INSERT INTO screening_results(client_id, matched_name, list_source, method, score) VALUES ($1,$2,$3,$4,$5)', [row!.id, 'Rodrigo Villanueva', 'AMLC', 'exact', 100], c);
    }
  });
}
