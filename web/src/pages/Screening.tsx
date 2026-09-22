import { useState, type FormEvent } from 'react';
import { get, post, fmtDateTime } from '../api';
import { useAuth } from '../auth';
import { DataTable, Field, PageHead, Pill, useAction, useLoad } from '../components/ui';

export function ScreeningPage() {
  const { has, user } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const { data, reload } = useLoad(() => get(`/api/clients?q=${encodeURIComponent(q)}&status=${status}`), [q, status]);
  const { run, busy } = useAction();
  const [form, setForm] = useState({ name: '', type: 'corporate', tin: '', email: '', phone: '', address: '', country: 'PH', pep: false });
  const [sel, setSel] = useState<any>(null);
  const open = async (id: number) => setSel(await get(`/api/clients/${id}`));
  async function create(e: FormEvent) {
    e.preventDefault();
    const r = await run(() => post('/api/clients', { ...form, email: form.email || undefined }));
    if (r) { run(async () => r, `${r.clientNo} created · screening ${r.screening.status} · tier ${r.screening.tier}`); setForm({ ...form, name: '', tin: '', email: '', phone: '', address: '', pep: false }); reload(); open(r.id); }
  }
  async function dispose(decision: 'clear' | 'declined') {
    const note = window.prompt(decision === 'clear' ? 'Why is this a false positive?' : 'Decline reason'); if (!note) return;
    if (await run(() => post(`/api/clients/${sel.client.id}/disposition`, { decision, note }), `Client ${decision}`)) { open(sel.client.id); reload(); }
  }
  return (
    <>
      <PageHead code="SS" title="Sanction Screening & Risk" sub="Every client is screened on creation: exact, fuzzy and phonetic name matching against sanctions and PEP lists, then scored into a risk tier and CDD level." />
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          {has('SS', 'NB', 'EB', 'CSF') && (
            <form className="card" onSubmit={create}>
              <h2>New client</h2>
              <div className="form-grid">
                <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} /></Field>
                <Field label="Type"><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="corporate">Corporate</option><option value="individual">Individual</option></select></Field>
                <Field label="TIN"><input value={form.tin} onChange={(e) => setForm({ ...form, tin: e.target.value })} /></Field>
                <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
                <Field label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
                <Field label="Country"><input value={form.country} maxLength={2} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} /></Field>
                <Field label="Address"><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
                <Field label="PEP"><span className="row"><input type="checkbox" checked={form.pep} onChange={(e) => setForm({ ...form, pep: e.target.checked })} style={{ width: 'auto' }} /> Politically exposed person</span></Field>
              </div>
              <div className="row end" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} type="submit">Create &amp; screen</button></div>
            </form>
          )}
          <div className="row">
            <div className="search"><input placeholder="Search name or client no…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="clear">Clear</option><option value="review">Review</option><option value="hit">Hit</option><option value="declined">Declined</option></select>
          </div>
          <DataTable rows={data?.clients} onRow={(r) => open(r.id)} cols={[
            { key: 'client_no', label: 'Client no.' }, { key: 'name', label: 'Name' }, { key: 'type', label: 'Type' }, { key: 'risk_tier', label: 'Risk', render: (r) => <Pill value={r.risk_tier} /> }, { key: 'risk_score', label: 'Score', num: true },
            { key: 'cdd_level', label: 'CDD' }, { key: 'pep', label: 'PEP', render: (r) => (r.pep ? '✓' : '—') }, { key: 'screening_status', label: 'Screening', render: (r) => <Pill value={r.screening_status} /> },
          ]} />
        </div>
        <div className="card" style={{ position: 'sticky', top: 80 }}>
          {!sel ? <p className="muted">Select a client to see the screening file.</p> : (
            <>
              <div className="row" style={{ justifyContent: 'space-between' }}><h2>{sel.client.name}</h2><Pill value={sel.client.screening_status} /></div>
              <dl className="dl">
                <dt>Client no.</dt><dd>{sel.client.client_no}</dd><dt>Type</dt><dd>{sel.client.type}</dd><dt>TIN</dt><dd>{sel.client.tin ?? '—'}</dd><dt>Email</dt><dd>{sel.client.email ?? '—'}</dd>
                <dt>Risk</dt><dd><Pill value={sel.client.risk_tier} /> score {sel.client.risk_score} · CDD {sel.client.cdd_level}</dd><dt>PEP</dt><dd>{sel.client.pep ? 'Yes' : 'No'}</dd><dt>Screened</dt><dd>{fmtDateTime(sel.client.screened_at)}</dd>
              </dl>
              <h3 style={{ fontSize: 14, margin: '14px 0 8px' }}>Matches</h3>
              <DataTable rows={sel.hits} empty="No list matches." cols={[{ key: 'matched_name', label: 'List name' }, { key: 'list_source', label: 'Source' }, { key: 'method', label: 'Method', render: (r) => <Pill value={r.method} /> }, { key: 'score', label: 'Score', num: true }, { key: 'decision', label: 'Decision', render: (r) => r.decision ? <Pill value={r.decision === 'false_positive' ? 'clear' : 'declined'} /> : '—' }]} />
              <div className="row" style={{ marginTop: 12 }}>
                {has('SS') && <button className="btn sm" disabled={busy} onClick={async () => { if (await run(() => post(`/api/clients/${sel.client.id}/rescreen`), 'Re-screened')) { open(sel.client.id); reload(); } }}>Re-screen</button>}
                {user?.canApprove && ['review', 'hit'].includes(sel.client.screening_status) && <><button className="btn sm green" disabled={busy} onClick={() => dispose('clear')}>Clear (false positive)</button><button className="btn sm danger" disabled={busy} onClick={() => dispose('declined')}>Decline</button></>}
              </div>
              {sel.policies.length > 0 && <><h3 style={{ fontSize: 14, margin: '14px 0 8px' }}>Policies</h3><DataTable rows={sel.policies} cols={[{ key: 'policy_no', label: 'Policy' }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }]} /></>}
            </>
          )}
        </div>
      </div>
    </>
  );
}
