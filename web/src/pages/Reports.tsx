import { api, get, peso, fmtDate } from '../api';
import { DataTable, Kpi, PageHead, Pill, useLoad } from '../components/ui';

export function ReportsPage() {
  const dash = useLoad(() => get('/api/reports/dashboard'), []);
  const prod = useLoad(() => get('/api/reports/production'), []);
  async function exportCsv() {
    const csv = await api<string>('/api/reports/production?format=csv', { raw: true });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'production.csv'; a.click(); URL.revokeObjectURL(url);
  }
  const k = dash.data?.kpis;
  const maxM = Math.max(1, ...((dash.data?.byMonth ?? []) as any[]).map((m) => Number(m.premium)));
  return (
    <>
      <PageHead code="RPT" title="Reports & Analytics" sub="Production register, monthly written premium, claims position and CSV export."><button className="btn" onClick={exportCsv}>Export production CSV</button></PageHead>
      {k && <div className="grid cols-4" style={{ marginBottom: 16 }}><Kpi n={k.policies_in_force} label="Policies in force" /><Kpi n={peso(k.premium_ytd)} label="Premium YTD" tone="green" /><Kpi n={peso(k.commission_ytd)} label="Commission YTD" tone="green" /><Kpi n={peso(k.outstanding_premium)} label="Outstanding" tone="warn" /></div>}
      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card"><h2>Written premium by month</h2>{dash.data?.byMonth?.length ? <div className="bars">{(dash.data.byMonth as any[]).map((m) => <div key={m.month} style={{ display: 'contents' }}><span className="mono">{m.month}</span><div className="bar"><i style={{ width: `${(Number(m.premium) / maxM) * 100}%` }} /></div><span className="mono">{peso(m.premium)}</span></div>)}</div> : <p className="muted">No issued policies yet.</p>}</div>
        <div className="card"><h2>Claims position</h2>{dash.data?.claimsByStatus?.length ? <div className="bars">{(dash.data.claimsByStatus as any[]).map((c) => <div key={c.status} style={{ display: 'contents' }}><Pill value={c.status} /><span>{c.count}</span><span className="mono">{peso(c.reserve)}</span></div>)}</div> : <p className="muted">No claims.</p>}</div>
      </div>
      <h2 style={{ fontSize: 15, marginBottom: 10 }}>Production register</h2>
      <DataTable rows={prod.data?.rows} rowKey="policy_no" cols={[{ key: 'policy_no', label: 'Policy' }, { key: 'issued', label: 'Issued', render: (r) => fmtDate(r.issued) }, { key: 'client', label: 'Client' }, { key: 'product', label: 'Product' }, { key: 'insurer', label: 'Insurer' }, { key: 'sum_insured', label: 'Sum insured', num: true, render: (r) => peso(r.sum_insured) }, { key: 'premium', label: 'Premium', num: true, render: (r) => peso(r.premium) }, { key: 'total_amount', label: 'Total', num: true, render: (r) => peso(r.total_amount) }, { key: 'commission', label: 'Commission', num: true, render: (r) => peso(r.commission) }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }]} />
    </>
  );
}
