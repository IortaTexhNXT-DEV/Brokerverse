import { useState, type FormEvent } from 'react';
import { get, post, peso, fmtDate, todayIso } from '../api';
import { ClientSelect, DataTable, Field, PageHead, Pill, useAction, useLoad } from '../components/ui';

function SchemeForm({ onDone }: { onDone: () => void }) {
  const clients = useLoad(() => get('/api/clients'), []);
  const insurers = useLoad(() => get('/api/insurers'), []);
  const { run, busy } = useAction();
  const [form, setForm] = useState({ clientId: '' as number | '', insurerId: '', planName: '', perMemberPremium: '', inceptionDate: todayIso() });
  async function create(e: FormEvent) { e.preventDefault(); if (await run(() => post('/api/employee-benefits/schemes', { ...form, clientId: Number(form.clientId), insurerId: Number(form.insurerId), perMemberPremium: Number(form.perMemberPremium) }), 'Prospect scheme created')) { setForm({ ...form, planName: '', perMemberPremium: '' }); onDone(); } }
  return (
    <form className="card" onSubmit={create}>
      <h2>New scheme (prospect)</h2>
      <div className="form-grid">
        <Field label="Corporate client"><ClientSelect value={form.clientId} onChange={(v) => setForm({ ...form, clientId: v })} clients={(clients.data?.clients ?? []).filter((c: any) => c.type === 'corporate')} /></Field>
        <Field label="Incumbent insurer"><select value={form.insurerId} onChange={(e) => setForm({ ...form, insurerId: e.target.value })} required><option value="">Select…</option>{(insurers.data?.insurers ?? []).map((i: any) => <option key={i.id} value={i.id}>{i.name}{i.accredited ? '' : ' (non-accredited)'}</option>)}</select></Field>
        <Field label="Plan"><input value={form.planName} onChange={(e) => setForm({ ...form, planName: e.target.value })} required /></Field>
        <Field label="Indicative premium per life (₱)"><input type="number" min={1} value={form.perMemberPremium} onChange={(e) => setForm({ ...form, perMemberPremium: e.target.value })} required /></Field>
        <Field label="Inception"><input type="date" value={form.inceptionDate} onChange={(e) => setForm({ ...form, inceptionDate: e.target.value })} /></Field>
      </div>
      <div className="row end" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} type="submit">Create scheme</button></div>
    </form>
  );
}

function SchemeDetail({ sel, onClose, onChange }: { sel: any; onClose: () => void; onChange: () => void }) {
  const insurers = useLoad(() => get('/api/insurers'), []);
  const { run, busy } = useAction();
  const [census, setCensus] = useState('E001, Juan Santos, 1990-05-12, 2\nE002, Maria Reyes, 1988-11-03, 0');
  const [picked, setPicked] = useState<number[]>([]);
  const s = sel.scheme;
  const act = async (path: string, body: unknown, msg: string) => { if (await run(() => post(path, body), msg)) onChange(); };
  async function upload() {
    const members = census.split('\n').map((l) => l.split(',').map((x) => x.trim())).filter((p) => p[0] && p[1]).map(([memberNo, name, birthDate, dependents]) => ({ memberNo, name, birthDate: birthDate || undefined, dependents: Number(dependents || 0) }));
    const r = await run(() => post(`/api/employee-benefits/schemes/${s.id}/members`, { members }));
    if (r) { run(async () => r, `Census: ${r.added} added, ${r.updated} updated`); onChange(); }
  }
  const recordProposal = async (p: any) => {
    const prem = window.prompt(`${p.insurer_name}: premium per life`); const benefits = prem ? window.prompt('Benefits summary') : null; const score = benefits ? window.prompt('Capabilities score 0–100 (stability, providers, technology)', '70') : null;
    if (prem && benefits && score) act(`/api/employee-benefits/schemes/${s.id}/proposals/${p.insurer_id}`, { premiumPerLife: Number(prem), benefits, capabilitiesScore: Number(score) }, 'Proposal recorded');
  };
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}><h2>{s.scheme_no} · {s.plan_name} · {s.covered_lives} lives · {peso(s.annual_premium)} <Pill value={s.status} /></h2><button className="btn sm" onClick={onClose}>Close</button></div>
      <div className="row" style={{ margin: '8px 0 14px' }}>
        <span className={`pill ${s.bor_received ? 'ok' : 'warn'}`}>BOR {s.bor_received ? 'received' : 'pending'}</span>
        <span className={`pill ${s.tor_prepared ? 'ok' : 'warn'}`}>TOR {s.tor_prepared ? 'prepared' : 'pending'}</span>
        {s.isacom_required && <span className="pill warn">ISACOM approval</span>}
        {!s.bor_received && <button className="btn sm" disabled={busy} onClick={() => act(`/api/employee-benefits/schemes/${s.id}/documents`, { borReceived: true }, 'BOR received')}>BOR received</button>}
        {!s.tor_prepared && <button className="btn sm" disabled={busy} onClick={() => act(`/api/employee-benefits/schemes/${s.id}/documents`, { torPrepared: true }, 'TOR prepared')}>TOR prepared</button>}
      </div>
      <div className="grid cols-2">
        <div>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Master list / census</h3>
          <Field label="member no, name, birth date, dependents"><textarea rows={4} value={census} onChange={(e) => setCensus(e.target.value)} /></Field>
          <div className="row end" style={{ margin: '10px 0' }}><button className="btn primary" disabled={busy} onClick={upload}>Upload census</button></div>
          <DataTable rows={sel.members} cols={[{ key: 'member_no', label: 'Member' }, { key: 'name', label: 'Name' }, { key: 'birth_date', label: 'Birth date', render: (r) => fmtDate(r.birth_date) }, { key: 'dependents', label: 'Dep.', num: true }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }, { key: 'act', label: '', render: (r) => r.status === 'active' ? <button className="btn sm" disabled={busy} onClick={() => act(`/api/employee-benefits/schemes/${s.id}/members/${r.id}/withdraw`, {}, 'Member withdrawn')}>Withdraw</button> : null }]} />
        </div>
        <div>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Remarketing & comparative analysis</h3>
          <div className="row" style={{ marginBottom: 8 }}>
            <select multiple value={picked.map(String)} onChange={(e) => setPicked(Array.from(e.target.selectedOptions).map((o) => Number(o.value)))} style={{ minWidth: 220, minHeight: 80 }}>{(insurers.data?.insurers ?? []).map((i: any) => <option key={i.id} value={i.id}>{i.name}{i.accredited ? '' : ' (non-accredited)'}</option>)}</select>
            <button className="btn primary" disabled={busy || picked.length === 0} onClick={() => act(`/api/employee-benefits/schemes/${s.id}/proposals`, { insurerIds: picked }, 'TOR, master list and utilisation released to insurers')}>Release TOR to insurers</button>
          </div>
          <DataTable rows={sel.proposals} empty="No proposals requested yet." cols={[
            { key: 'insurer_name', label: 'Insurer', render: (r) => `${r.insurer_name}${r.accredited ? '' : ' ⚠ non-accredited'}` }, { key: 'premium_per_life', label: 'Premium / life', num: true, render: (r) => (r.premium_per_life ? peso(r.premium_per_life) : '—') }, { key: 'benefits', label: 'Benefits', wrap: true }, { key: 'capabilities_score', label: 'Capabilities', num: true }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> },
            { key: 'act', label: '', render: (r) => <span className="row">{r.status === 'requested' && <button className="btn sm" disabled={busy} onClick={() => recordProposal(r)}>Record proposal</button>}{['received', 'shortlisted'].includes(r.status) && s.status !== 'placed' && <button className="btn sm green" disabled={busy} onClick={async () => { const res = await run(() => post(`/api/employee-benefits/schemes/${s.id}/award`, { proposalId: r.id })); if (res) { run(async () => res, res.status === 'isacom_pending' ? 'Non-accredited provider: ISACOM approval requested' : 'Awarded · handoff to processing and collections'); onChange(); } }}>Award</button>}</span> },
          ]} />
        </div>
      </div>
    </div>
  );
}

export function EmployeeBenefitsPage() {
  const schemes = useLoad(() => get('/api/employee-benefits/schemes'), []);
  const [sel, setSel] = useState<any>(null);
  const loadScheme = async (id: number) => setSel(await get(`/api/employee-benefits/schemes/${id}`));
  return (
    <>
      <PageHead code="EB" title="Employee Benefits" sub="Renewal advice → BOR and master list/utilisation → TOR → release to insurers with franchise → comparative analysis (premium, benefits, capabilities) → client confirmation → award (ISACOM approval for non-accredited providers) → handoff." />
      <div className="stack">
        <SchemeForm onDone={schemes.reload} />
        <DataTable rows={schemes.data?.schemes} onRow={(r) => loadScheme(r.id)} cols={[{ key: 'scheme_no', label: 'Scheme' }, { key: 'client_name', label: 'Client' }, { key: 'plan_name', label: 'Plan' }, { key: 'insurer_name', label: 'Insurer' }, { key: 'active_members', label: 'Members', num: true }, { key: 'covered_lives', label: 'Lives', num: true }, { key: 'annual_premium', label: 'Annual premium', num: true, render: (r) => peso(r.annual_premium) }, { key: 'proposals_received', label: 'Proposals', num: true }, { key: 'expiry_date', label: 'Expiry', render: (r) => fmtDate(r.expiry_date) }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }]} />
        {sel && <SchemeDetail sel={sel} onClose={() => setSel(null)} onChange={() => { loadScheme(sel.scheme.id); schemes.reload(); }} />}
      </div>
    </>
  );
}
