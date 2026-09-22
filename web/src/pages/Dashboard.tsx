import { Link } from 'react-router-dom';
import { MODULES } from '@brokerverse/shared';
import { get, peso } from '../api';
import { useAuth } from '../auth';
import { Kpi, PageHead, useLoad, Pill } from '../components/ui';

export function DashboardPage() {
  const { user, has } = useAuth();
  const { data, error } = useLoad(() => (has('RPT') ? get('/api/reports/dashboard') : Promise.resolve(null)), [user?.id]);
  const k = data?.kpis;
  const maxPrem = Math.max(1, ...((data?.byProduct ?? []) as any[]).map((p) => Number(p.premium)));
  return (
    <>
      <PageHead title={`Good day, ${user?.fullName.split(' ')[0]}`} sub={`${user?.roleCode.replace(/_/g, ' ')} · ${user?.modules.length} of ${MODULES.length} modules entitled.`} />
      {error && <div className="alert error">{error}</div>}
      {k && (
        <div className="grid cols-4" style={{ marginBottom: 18 }}>
          <Kpi n={k.policies_in_force} label="Policies in force" />
          <Kpi n={peso(k.premium_ytd)} label="Premium written YTD" tone="green" />
          <Kpi n={peso(k.commission_ytd)} label="Commission income YTD" tone="green" />
          <Kpi n={peso(k.outstanding_premium)} label="Outstanding premium" tone="warn" />
          <Kpi n={k.pending_approvals} label="Pending approvals" tone="warn" />
          <Kpi n={k.open_claims} label="Open claims" tone="navy" />
          <Kpi n={k.renewals_due} label="Renewals due (60 days)" tone="navy" />
          <Kpi n={k.screening_hits} label="Screening hits to review" tone={k.screening_hits ? 'warn' : 'green'} />
        </div>
      )}
      <div className="grid cols-2">
        {data && (
          <div className="card">
            <h2>Production by product</h2>
            <div className="bars">
              {(data.byProduct as any[]).map((p) => (
                <div key={p.code} style={{ display: 'contents' }}>
                  <span>{p.code}</span>
                  <div className="bar"><i style={{ width: `${(Number(p.premium) / maxPrem) * 100}%` }} /></div>
                  <span className="mono">{peso(p.premium)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {data && (
          <div className="card">
            <h2>Claims by status</h2>
            {data.claimsByStatus.length === 0 ? <p className="muted">No claims registered.</p> : (
              <div className="bars">
                {(data.claimsByStatus as any[]).map((c) => (
                  <div key={c.status} style={{ display: 'contents' }}><Pill value={c.status} /><span>{c.count} claim{c.count === 1 ? '' : 's'}</span><span className="mono">{peso(c.reserve)}</span></div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h2>Your modules</h2>
          <div className="row">
            {MODULES.filter((m) => user?.modules.includes(m.code)).map((m) => (
              <Link key={m.code} to={m.path} className="btn"><span className="pill navy">{m.code}</span>{m.name}</Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
