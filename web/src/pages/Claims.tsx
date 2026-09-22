import { useState, type FormEvent } from 'react';
import { useNavigate, useParams, Outlet } from 'react-router-dom';
import { get, post, peso, fmtDate, fmtDateTime, todayIso } from '../api';
import { useAuth } from '../auth';
import { Alert, DataTable, Drawer, Field, PageHead, Pill, useAction, useLoad } from '../components/ui';

export function ClaimsPage() {
  const { has } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const { data, reload } = useLoad(() => get(`/api/claims?q=${encodeURIComponent(q)}`), [q]);
  const { run, busy } = useAction();
  const [form, setForm] = useState({ policyNo: '', lossDate: todayIso(), description: '', estimatedAmount: '' });
  const [cac, setCac] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault(); setCac(null);
    try {
      const r = await post('/api/claims', { policyNo: form.policyNo, lossDate: form.lossDate, description: form.description, estimatedAmount: Number(form.estimatedAmount) });
      run(async () => r, `Claim ${r.claimNo} registered · Preliminary Loss Advice sent`); setForm({ ...form, policyNo: '', description: '', estimatedAmount: '' }); reload();
    } catch (err: any) { setCac(err.message); }
  }
  return (
    <>
      <PageHead code="CLM" title="Claims" sub="Register, review, and settle claims. Claims Acceptance Control reads Collections: unpaid premium blocks registration." />
      <div className="stack">
        {has('CLM') && (
          <form className="card" onSubmit={submit}>
            <h2>Register claim</h2>
            <div className="form-grid">
              <Field label="Policy number"><input value={form.policyNo} onChange={(e) => setForm({ ...form, policyNo: e.target.value })} placeholder="POL-2026-00001" required /></Field>
              <Field label="Date of loss"><input type="date" value={form.lossDate} onChange={(e) => setForm({ ...form, lossDate: e.target.value })} required /></Field>
              <Field label="Estimated amount (₱)"><input type="number" min={0} step="0.01" value={form.estimatedAmount} onChange={(e) => setForm({ ...form, estimatedAmount: e.target.value })} required /></Field>
              <Field label="Description"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} minLength={5} required /></Field>
            </div>
            {cac && <div style={{ marginTop: 12 }}><Alert kind="error">{cac}</Alert></div>}
            <div className="row end" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} type="submit">Register</button></div>
          </form>
        )}
        <div className="search"><input placeholder="Search claim, policy or client…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <DataTable rows={data?.claims} onRow={(r) => nav(`/claims/${r.id}`)} cols={[
          { key: 'claim_no', label: 'Claim' }, { key: 'policy_no', label: 'Policy' }, { key: 'client_name', label: 'Client' }, { key: 'product_name', label: 'Product' }, { key: 'loss_date', label: 'Loss', render: (r) => fmtDate(r.loss_date) },
          { key: 'age_days', label: 'Age (d)', num: true }, { key: 'reserve_amount', label: 'Reserve', num: true, render: (r) => peso(r.reserve_amount) }, { key: 'paid_amount', label: 'Paid', num: true, render: (r) => peso(r.paid_amount) }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> },
        ]} />
      </div>
      <Outlet />
    </>
  );
}

export function ClaimDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { has } = useAuth();
  const { data, reload } = useLoad(() => get(`/api/claims/${id}`), [id]);
  const { run, busy } = useAction();
  if (!data) return null;
  const c = data.claim;
  const act = async (event: string, extra: Record<string, unknown> = {}) => { if (await run(() => post(`/api/claims/${c.id}/transition`, { event, ...extra }), `Claim ${event.replace(/_/g, ' ')}`)) reload(); };
  return (
    <Drawer title={`Claim ${c.claim_no}`} onClose={() => nav('/claims')}>
      <div className="row" style={{ marginBottom: 12 }}><Pill value={c.status} /></div>
      <dl className="dl">
        <dt>Policy</dt><dd>{c.policy_no} · {c.product_name}</dd><dt>Client</dt><dd>{c.client_name}</dd><dt>Loss date</dt><dd>{fmtDate(c.loss_date)}</dd><dt>Reported</dt><dd>{fmtDate(c.reported_date)}</dd>
        <dt>Description</dt><dd>{c.description}</dd><dt>Estimate</dt><dd>{peso(c.estimated_amount)}</dd><dt>Reserve</dt><dd>{peso(c.reserve_amount)}</dd><dt>Paid</dt><dd>{peso(c.paid_amount)}</dd>
      </dl>
      {has('CLM') && (
        <div className="row" style={{ margin: '16px 0' }}>
          {c.status === 'registered' && <button className="btn sm" disabled={busy} onClick={() => act('under_review')}>Start review</button>}
          {c.status === 'under_review' && !data.events.some((e: any) => e.event === 'settlement_requested' && !data.events.some((x: any) => x.id > e.id && ['approved', 'settlement_rejected'].includes(x.event))) && <button className="btn sm primary" disabled={busy} onClick={() => { const a = window.prompt('Settlement amount', String(c.reserve_amount)); if (a) act('settlement_requested', { amount: Number(a), note: 'Adjuster recommendation' }); }}>Request settlement</button>}
          {c.status === 'approved' && <button className="btn sm green" disabled={busy} onClick={() => act('settled')}>Mark settled</button>}
          {['registered', 'under_review'].includes(c.status) && <button className="btn sm danger" disabled={busy} onClick={() => { const n = window.prompt('Decline reason'); if (n) act('declined', { note: n }); }}>Decline</button>}
          {['settled', 'declined'].includes(c.status) && <button className="btn sm" disabled={busy} onClick={() => act('closed')}>Close</button>}
        </div>
      )}
      <h3 style={{ fontSize: 14, margin: '10px 0 8px' }}>Timeline</h3>
      <ul className="timeline">{data.events.map((e: any) => <li key={e.id}><b>{e.event.replace(/_/g, ' ')}</b> {e.note && <span className="muted">· {e.note}</span>}<div className="when">{fmtDateTime(e.at)} · {e.user_name ?? 'system'}</div></li>)}</ul>
    </Drawer>
  );
}
