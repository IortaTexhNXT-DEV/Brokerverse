/** The sixteen BrokerVerse modules (BRD codes) and their navigation metadata. */
export const MODULES = [
  { code: 'NB',   name: 'New Business',               path: '/new-business',       group: 'Production' },
  { code: 'OPS',  name: 'Operations',                 path: '/operations',         group: 'Production' },
  { code: 'CLXN', name: 'Collections',                path: '/collections',        group: 'Finance' },
  { code: 'ADA',  name: 'Accounting & Disbursement',  path: '/accounting',         group: 'Finance' },
  { code: 'CLM',  name: 'Claims',                     path: '/claims',             group: 'Servicing' },
  { code: 'RN',   name: 'Renewal',                    path: '/renewals',           group: 'Production' },
  { code: 'RI',   name: 'Reinsurance',                path: '/reinsurance',        group: 'Production' },
  { code: 'EB',   name: 'Employee Benefits',          path: '/employee-benefits',  group: 'Production' },
  { code: 'CSF',  name: 'Customer Servicing',         path: '/servicing',          group: 'Servicing' },
  { code: 'SS',   name: 'Sanction Screening & Risk',  path: '/screening',          group: 'Compliance' },
  { code: 'PM',   name: 'Product Maintenance',        path: '/products',           group: 'Configuration' },
  { code: 'SP',   name: 'Submitted Policies',         path: '/submitted-policies', group: 'Production' },
  { code: 'UAM',  name: 'User Access Maintenance',    path: '/user-access',        group: 'Configuration' },
  { code: 'DM',   name: 'Data Migration',             path: '/data-migration',     group: 'Configuration' },
  { code: 'RPT',  name: 'Reports & Analytics',        path: '/reports',            group: 'Insight' },
  { code: 'CORE', name: 'Approvals & Audit',          path: '/approvals',          group: 'Compliance' },
] as const;

export type ModuleCode = (typeof MODULES)[number]['code'];
export const MODULE_CODES = MODULES.map((m) => m.code) as ModuleCode[];

export function moduleByCode(code: string) {
  return MODULES.find((m) => m.code === code);
}
