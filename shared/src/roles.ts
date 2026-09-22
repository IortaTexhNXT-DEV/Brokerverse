import type { ModuleCode } from './modules';

export interface RoleDef {
  code: string;
  name: string;
  description: string;
  modules: ModuleCode[];
  canApprove: boolean;
}

const ALL: ModuleCode[] = ['NB','OPS','CLXN','ADA','CLM','RN','RI','EB','CSF','SS','PM','SP','UAM','DM','RPT','CORE'];

/** The twelve BrokerVerse personas. Every user carries exactly one role. */
export const ROLES: RoleDef[] = [
  { code: 'ADMIN',      name: 'System Administrator',   description: 'Full platform access, configuration and user maintenance.', modules: ALL, canApprove: true },
  { code: 'NB_OFFICER', name: 'New Business Officer',   description: 'Quotes, binds and issues new policies.', modules: ['NB','PM','SS','RPT'], canApprove: false },
  { code: 'UW_HEAD',    name: 'Underwriting Head',      description: 'Approves policy issuance and placements (checker).', modules: ['NB','RN','RI','PM','CORE','RPT'], canApprove: true },
  { code: 'CASHIER',    name: 'Cashier',                description: 'Receives premium payments and issues official receipts.', modules: ['OPS','CLXN','RPT'], canApprove: false },
  { code: 'COLLECTIONS',name: 'Collections Officer',    description: 'Follows up outstanding premiums and statements of account.', modules: ['CLXN','OPS','CSF','RPT'], canApprove: false },
  { code: 'ACCOUNTANT', name: 'Accountant',             description: 'Posts journals, closes periods and prepares remittances.', modules: ['ADA','OPS','CLXN','DM','SP','RPT'], canApprove: false },
  { code: 'FIN_HEAD',   name: 'Finance Head',           description: 'Approves disbursements and period close (checker).', modules: ['ADA','CLXN','CORE','RPT'], canApprove: true },
  { code: 'CLAIMS',     name: 'Claims Officer',         description: 'Registers, reviews and settles claims.', modules: ['CLM','CSF','RPT'], canApprove: false },
  { code: 'RENEWALS',   name: 'Renewal Officer',        description: 'Runs the renewal cycle and notices.', modules: ['RN','NB','SP','RPT'], canApprove: false },
  { code: 'RI_OFFICER', name: 'Reinsurance Officer',    description: 'Maintains treaties and cessions.', modules: ['RI','RPT'], canApprove: false },
  { code: 'EB_OFFICER', name: 'Employee Benefits Officer', description: 'Maintains group schemes and member census.', modules: ['EB','SS','RPT'], canApprove: false },
  { code: 'COMPLIANCE', name: 'Compliance Officer',     description: 'Screens clients, reviews hits and audits access.', modules: ['SS','UAM','CSF','CORE','RPT'], canApprove: true },
];

export function roleByCode(code: string): RoleDef | undefined {
  return ROLES.find((r) => r.code === code);
}

export function roleHasModule(roleCode: string, module: ModuleCode): boolean {
  const r = roleByCode(roleCode);
  return !!r && r.modules.includes(module);
}
