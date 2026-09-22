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
      <PageHead code="CLM" title="Claims" sub="Notice of loss → Preliminary Loss Advice → document checklist → Formal Loss Advice to insurer → evaluation (adjuster) → offer → insured acceptance or contest → settlement (cash or LOA) under approval → close. Claims Acceptance Control reads Collections." />
      <div className="stack">
        {has('CLM') && (
          <form className="card" onSubmit={submit}>
            <h2>Notice of loss</h2>
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
          { key: 'age_days', label: 'Age (d)', num: true }, { key: 'missing_documents', label: 'Docs missing', num: true }, { key: 'reserve_amount', label: 'Reserve', num: true, render: (r) => peso(r.reserve_amount) }, { key: 'paid_amount', label: 'Paid', num: true, render: (r) => peso(r.paid_amount) }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> },
        ]} />
      </div>
      <Outlet />
    </>
  );
}

function ClaimActions({ c, onAct }: { c: any; onAct: (event: string, extra?: Record<string, unknown>) => void }) {
  const ask = (label: string, dflt?: string) => window.prompt(label, dflt);
  switch (c.status) {
    case 'documents_complete': return <><button className="btn sm primary" onClick={() => onAct('fla_sent', { adjusterRequired: window.confirm('Adjuster inspection needed?') })}>Send Formal Loss Advice</button><button className="btn sm danger" onClick={() => { const n = ask('Decline reason'); if (n) onAct('declined', { note: n }); }}>Decline</button></>;
    case 'fla_sent': return <button className="btn sm" onClick={() => onAct('under_review')}>Insurer evaluating</button>;
    case 'under_review': return <><button className="btn sm primary" onClick={() => { const a = ask('Offer amount from insurer'); if (a) onAct('offer_received', { amount: Number(a), insurerClaimRef: ask("Insurer claim ref") ?? undefined }); }}>Offer received</button><button className="btn sm danger" onClick={() => { const n = ask('Decline reason'); if (n) onAct('declined', { note: n }); }}>Insurer declined</button></>;
    case 'offer_received': return <><button className="btn sm green" onClick={() => onAct('offer_accepted')}>Insured accepts</button><button className="btn sm" onClick={() => { const n = ask("Insured's position"); if (n) onAct('offer_contested', { note: n }); }}>Contest offer</button></>;
    case 'offer_accepted': return <button className="btn sm primary" onClick={() => { const mode = window.confirm('Settle by LOA to casa/dealer? (Cancel = cash)') ? 'loa' : 'cash'; onAct('settlement_requested', { settlementMode: mode, note: 'Signed offer received' }); }}>Request settlement approval</button>;
    case 'approved': return <button className="btn sm green" onClick={() => onAct('settled')}>Mark settled / paid</button>;
    case 'settled': case 'declined': return <button className="btn sm" onClick={() => onAct('closed')}>Close</button>;
    case 'registered': return <button className="btn sm danger" onClick={() => { const n = ask('Decline reason'); if (n) onAct('declined', { note: n }); }}>Decline</button>;
    default: return null;
  }
}

export function ClaimDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { has } = useAuth();
  const { data, reload } = useLoad(() => get(`/api/claims/${id}`), [id]);
  const { run, busy } = useAction();
  if (!data) return null;
  const c = data.claim;
  const act = async (event: string, extra: Record<string, unknown> = {}) => { if (await run(() => post(`/api/claims/${c.id}/transition`, { event, ...extra }), `Claim ${event.replaceAll('_', ' ')}`)) reload(); };
  const toggleDoc = async (d: any) => { if (await run(() => post(`/api/claims/${c.id}/documents`, { name: d.name, received: !d.received }), d.received ? 'Document unmarked' : 'Document received')) reload(); };
  return (
    <Drawer title={`Claim ${c.claim_no}`} onClose={() => nav('/claims')}>
      <div className="row" style={{ marginBottom: 12 }}><Pill value={c.status} />{c.adjuster_required && <span className="pill warn">adjuster</span>}{c.settlement_mode && <span className="pill">{c.settlement_mode}</span>}</div>
      <dl className="dl">
        <dt>Policy</dt><dd>{c.policy_no} · {c.product_name} · {c.insurer_name}</dd><dt>Client</dt><dd>{c.client_name}</dd><dt>Loss date</dt><dd>{fmtDate(c.loss_date)}</dd><dt>Reported</dt><dd>{fmtDate(c.reported_date)}</dd>
        <dt>Description</dt><dd>{c.description}</dd><dt>Estimate</dt><dd>{peso(c.estimated_amount)}</dd><dt>Offer</dt><dd>{c.offer_amount ? `${peso(c.offer_amount)} (${fmtDateTime(c.offer_received_at)})` : '—'}</dd><dt>Reserve</dt><dd>{peso(c.reserve_amount)}</dd><dt>Paid</dt><dd>{peso(c.paid_amount)}</dd>
        <dt>FLA sent</dt><dd>{fmtDateTime(c.fla_sent_at)}{c.insurer_claim_ref && ` · ref ${c.insurer_claim_ref}`}</dd>
      </dl>
      <h3 style={{ fontSize: 14, margin: '14px 0 8px' }}>Document checklist</h3>
      <DataTable rows={data.documents} cols={[{ key: 'name', label: 'Document' }, { key: 'required', label: 'Required', render: (r) => (r.required ? 'yes' : 'optional') }, { key: 'received', label: 'Received', render: (r) => (r.received ? <Pill value="ok" /> : <Pill value="pending" />) }, { key: 'received_at', label: 'On', render: (r) => fmtDateTime(r.received_at) }, { key: 'act', label: '', render: (r) => has('CLM') && ['registered', 'documents_complete'].includes(c.status) ? <button className="btn sm" disabled={busy} onClick={() => toggleDoc(r)}>{r.received ? 'Unmark' : 'Received'}</button> : null }]} />
      {has('CLM') && <div className="row" style={{ margin: '16px 0' }}><ClaimActions c={c} onAct={act} /></div>}
      <h3 style={{ fontSize: 14, margin: '10px 0 8px' }}>Timeline</h3>
      <ul className="timeline">{data.events.map((e: any) => <li key={e.id}><b>{e.event.replaceAll('_', ' ')}</b> {e.note && <span className="muted">· {e.note}</span>}<div className="when">{fmtDateTime(e.at)} · {e.user_name ?? 'system'}</div></li>)}</ul>
    </Drawer>
  );
}
