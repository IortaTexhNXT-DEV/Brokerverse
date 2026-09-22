import { useState } from 'react';
import { get, post, peso, fmtDate } from '../api';
import { useAuth } from '../auth';
import { DataTable, PageHead, Pill, useAction, useLoad } from '../components/ui';

export function RenewalsPage() {
  const { has } = useAuth();
  const [days, setDays] = useState(60);
  const { data, reload } = useLoad(() => get(`/api/renewals/pipeline?days=${days}`), [days]);
  const { run, busy } = useAction();
  const nextNotice = (n: string[] | null) => (!n?.includes('first') ? 'first' : !n.includes('second') ? 'second' : !n.includes('final') ? 'final' : null);
  return (
    <>
      <PageHead code="RN" title="Renewal pipeline" sub="Policies approaching expiry. Notices go out first → second → final; renewal re-rates at current product rates and needs checker approval.">
        <label className="small muted">Window <select value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option><option value={180}>180 days</option></select></label>
      </PageHead>
      <DataTable rows={data?.policies} empty="No policies expiring in this window." cols={[
        { key: 'policy_no', label: 'Policy' }, { key: 'client_name', label: 'Client' }, { key: 'product_name', label: 'Product' }, { key: 'expiry_date', label: 'Expiry', render: (r) => fmtDate(r.expiry_date) },
        { key: 'days_to_expiry', label: 'Days', num: true, render: (r) => <span className={r.days_to_expiry < 0 ? 'pill bad' : r.days_to_expiry <= 15 ? 'pill warn' : 'pill'}>{r.days_to_expiry}</span> },
        { key: 'premium', label: 'Premium', num: true, render: (r) => peso(r.premium) }, { key: 'notices', label: 'Notices', render: (r) => (r.notices ?? []).map((n: string) => <Pill key={n} value={n} />) },
        { key: 'has_open_claim', label: 'Open claim', render: (r) => (r.has_open_claim ? <Pill value="review" /> : '—') },
        { key: 'act', label: '', render: (r) => has('RN') ? <span className="row">
          {nextNotice(r.notices) && <button className="btn sm" disabled={busy} onClick={async () => { if (await run(() => post(`/api/renewals/${r.id}/notice`, { noticeType: nextNotice(r.notices) }), `${nextNotice(r.notices)} notice sent`)) reload(); }}>Send {nextNotice(r.notices)} notice</button>}
          <button className="btn sm primary" disabled={busy} onClick={async () => { const si = window.prompt('Renewal sum insured', String(r.sum_insured)); if (si) { const res = await run(() => post(`/api/renewals/${r.id}/renew`, { sumInsured: Number(si) })); if (res) { run(async () => res, `Renewal ${res.policyNo} raised for approval (variance ${peso(res.premiumVariance)})`); reload(); } } }}>Renew</button>
        </span> : null },
      ]} />
    </>
  );
}
