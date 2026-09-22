import { useState } from 'react';
import { get, post, peso, fmtDate } from '../api';
import { useAuth } from '../auth';
import { DataTable, PageHead, Pill, useAction, useLoad } from '../components/ui';

function DaysPill({ days }: { days: number }) {
  let tone = '';
  if (days < 0) tone = 'bad';
  else if (days <= 45) tone = 'warn';
  return <span className={`pill ${tone}`}>{days}</span>;
}

function DispositionButtons({ r, act, busy }: { r: any; act: (path: string, body: unknown, msg: string) => void; busy: boolean }) {
  return (
    <>
      <button className="btn sm primary" disabled={busy} onClick={() => act(`/api/renewals/${r.id}/disposition`, { disposition: 'for_renewal' }, 'Dispositioned for renewal')}>For renewal</button>
      <button className="btn sm" disabled={busy} onClick={() => act(`/api/renewals/${r.id}/disposition`, { disposition: 'remarket' }, 'Dispositioned for remarketing')}>Remarket</button>
      <button className="btn sm danger" disabled={busy} onClick={() => { const note = window.prompt('Reason (NRNS letter will be sent)'); if (note) act(`/api/renewals/${r.id}/disposition`, { disposition: 'not_for_renewal', note }, 'Not for renewal · NRNS letter sent'); }}>Not for renewal</button>
    </>
  );
}

function NoticeButtons({ r, act, busy }: { r: any; act: (path: string, body: unknown, msg: string) => void; busy: boolean }) {
  const notices: string[] = r.notices ?? [];
  const initialDue = !notices.includes('initial') && r.days_to_expiry <= 70;
  const finalDue = notices.includes('initial') && !notices.includes('final') && r.days_to_expiry <= 45;
  return (
    <>
      {initialDue && <button className="btn sm" disabled={busy} onClick={() => act(`/api/renewals/${r.id}/notice`, { noticeType: 'initial' }, 'Initial RA letter sent')}>Initial RA (−70d)</button>}
      {finalDue && <button className="btn sm" disabled={busy} onClick={() => act(`/api/renewals/${r.id}/notice`, { noticeType: 'final' }, 'Final RA letter sent')}>Final RA (−45d)</button>}
    </>
  );
}

function RenewalActions({ r, onDone }: { r: any; onDone: () => void }) {
  const { run, busy } = useAction();
  const act = async (path: string, body: unknown, msg: string) => { if (await run(() => post(path, body), msg)) onDone(); };
  const forRenewal = ['for_renewal', 'remarket'].includes(r.disposition);
  const renew = async () => {
    const si = window.prompt('Renewal sum insured', String(r.sum_insured));
    if (!si) return;
    const res = await run(() => post(`/api/renewals/${r.id}/renew`, { sumInsured: Number(si) }));
    if (res) { run(async () => res, `Renewal ${res.policyNo} placed with insurer (variance ${peso(res.premiumVariance)})`); onDone(); }
  };
  return (
    <span className="row">
      {!r.disposition && <DispositionButtons r={r} act={act} busy={busy} />}
      {forRenewal && <NoticeButtons r={r} act={act} busy={busy} />}
      {forRenewal && !r.client_accepted && <button className="btn sm green" disabled={busy} onClick={() => act(`/api/renewals/${r.id}/client-acceptance`, { accepted: true }, 'Client acceptance recorded')}>Client accepted</button>}
      {forRenewal && r.client_accepted && !r.renewal_policy_no && <button className="btn sm primary" disabled={busy} onClick={renew}>Renew → placement</button>}
    </span>
  );
}

export function RenewalsPage() {
  const { has } = useAuth();
  const [days, setDays] = useState(140);
  const { data, reload } = useLoad(() => get(`/api/renewals/pipeline?days=${days}`), [days]);
  return (
    <>
      <PageHead code="RN" title="Renewal – RMEL pipeline" sub="Renewal Master Expiry List extracted 140 days before expiry; sanitation handler dispositions each account; initial renewal advice at −70 days and final at −45; client acceptance triggers placement, then booking.">
        <label className="small muted">Window <select value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={45}>45 days</option><option value={70}>70 days</option><option value={140}>140 days (RMEL)</option><option value={180}>180 days</option></select></label>
      </PageHead>
      <DataTable rows={data?.policies} empty="No policies expiring in this window." cols={[
        { key: 'policy_no', label: 'Policy' }, { key: 'client_name', label: 'Client' }, { key: 'product_name', label: 'Product' }, { key: 'expiry_date', label: 'Expiry', render: (r) => fmtDate(r.expiry_date) },
        { key: 'days_to_expiry', label: 'Days', num: true, render: (r) => <DaysPill days={r.days_to_expiry} /> },
        { key: 'premium', label: 'Premium', num: true, render: (r) => peso(r.premium) }, { key: 'disposition', label: 'Disposition', render: (r) => (r.disposition ? <Pill value={r.disposition} /> : <span className="muted">pending sanitation</span>) },
        { key: 'notices', label: 'RA letters', render: (r) => (r.notices ?? []).map((n: string) => <Pill key={n} value={n} />) }, { key: 'client_accepted', label: 'Accepted', render: (r) => (r.client_accepted ? '✓' : '—') },
        { key: 'renewal_policy_no', label: 'Renewal', render: (r) => (r.renewal_policy_no ? <>{r.renewal_policy_no} <Pill value={r.renewal_status} /></> : '—') }, { key: 'has_open_claim', label: 'Open claim', render: (r) => (r.has_open_claim ? <Pill value="review" /> : '—') },
        { key: 'act', label: '', render: (r) => (has('RN') ? <RenewalActions r={r} onDone={reload} /> : null) },
      ]} />
    </>
  );
}
