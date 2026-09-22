import { Link } from 'react-router-dom';
import { MODULES } from '@brokerverse/shared';
import { get, peso } from '../api';
import { useAuth } from '../auth';
import { Kpi, PageHead, useLoad, Pill } from '../components/ui';

function KpiGrid({ k }: { k: any }) {
  return (
    <div className="grid cols-4" style={{ marginBottom: 18 }}>
      <Kpi n={k.policies_in_force} label="Policies in force" />
      <Kpi n={k.in_placement} label="In placement with insurers" tone="navy" />
      <Kpi n={peso(k.premium_ytd)} label="Premium written YTD" tone="green" />
      <Kpi n={peso(k.commission_ytd)} label="Commission income YTD" tone="green" />
      <Kpi n={peso(k.outstanding_premium)} label="Outstanding premium" tone="warn" />
      <Kpi n={k.unapplied_payments} label="Unapplied payments (UPP)" tone="warn" />
      <Kpi n={k.pending_approvals} label="Pending approvals" tone="warn" />
      <Kpi n={k.disbursements_in_flight} label="Disbursements in flight" tone="navy" />
      <Kpi n={k.open_claims} label="Open claims" tone="navy" />
      <Kpi n={k.renewals_due} label="Renewals due (60 days)" tone="navy" />
      <Kpi n={k.past_tat_requests} label="Cases past TAT" tone={k.past_tat_requests ? 'warn' : 'green'} />
      <Kpi n={k.screening_hits} label="Screening hits to review" tone={k.screening_hits ? 'warn' : 'green'} />
    </div>
  );
}

function Bars({ rows, labelKey, valueKey }: { rows: any[]; labelKey: string; valueKey: string }) {
  const max = Math.max(1, ...rows.map((p) => Number(p[valueKey])));
  return (
    <div className="bars">
      {rows.map((p) => (
        <div key={p[labelKey]} style={{ display: 'contents' }}>
          <span>{p[labelKey]}</span>
          <div className="bar"><i style={{ width: `${(Number(p[valueKey]) / max) * 100}%` }} /></div>
          <span className="mono">{peso(p[valueKey])}</span>
        </div>
      ))}
    </div>
  );
}

function ClaimsByStatus({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <p className="muted">No claims registered.</p>;
  return (
    <div className="bars">
      {rows.map((c) => <div key={c.status} style={{ display: 'contents' }}><Pill value={c.status} /><span>{c.count} claim{c.count === 1 ? '' : 's'}</span><span className="mono">{peso(c.reserve)}</span></div>)}
    </div>
  );
}

export function DashboardPage() {
  const { user, has } = useAuth();
  const { data, error } = useLoad(() => (has('RPT') ? get('/api/reports/dashboard') : Promise.resolve(null)), [user?.id]);
  const firstName = user?.fullName.split(' ')[0] ?? '';
  const myModules = MODULES.filter((m) => user?.modules.includes(m.code));
  return (
    <>
      <PageHead title={`Good day, ${firstName}`} sub={`${user?.roleCode.replaceAll('_', ' ')} · ${user?.modules.length} of ${MODULES.length} modules entitled.`} />
      {error && <div className="alert error">{error}</div>}
      {data?.kpis && <KpiGrid k={data.kpis} />}
      <div className="grid cols-2">
        {data && <div className="card"><h2>Production by product</h2><Bars rows={data.byProduct} labelKey="code" valueKey="premium" /></div>}
        {data && <div className="card"><h2>Claims by status</h2><ClaimsByStatus rows={data.claimsByStatus} /></div>}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h2>Your modules</h2>
          <div className="row">{myModules.map((m) => <Link key={m.code} to={m.path} className="btn"><span className="pill navy">{m.code}</span>{m.name}</Link>)}</div>
        </div>
      </div>
    </>
  );
}
