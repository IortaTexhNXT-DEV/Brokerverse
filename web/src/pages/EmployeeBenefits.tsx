import { useState, type FormEvent } from 'react';
import { get, post, peso, fmtDate, todayIso } from '../api';
import { ClientSelect, DataTable, Field, PageHead, Pill, useAction, useLoad } from '../components/ui';

export function EmployeeBenefitsPage() {
  const schemes = useLoad(() => get('/api/employee-benefits/schemes'), []);
  const clients = useLoad(() => get('/api/clients'), []);
  const insurers = useLoad(() => get('/api/insurers'), []);
  const { run, busy } = useAction();
  const [form, setForm] = useState({ clientId: '' as number | '', insurerId: '', planName: '', perMemberPremium: '', inceptionDate: todayIso() });
  const [sel, setSel] = useState<any>(null);
  const [census, setCensus] = useState('E001, Juan Santos, 1990-05-12, 2\nE002, Maria Reyes, 1988-11-03, 0');
  const loadScheme = async (id: number) => setSel(await get(`/api/employee-benefits/schemes/${id}`));
  async function create(e: FormEvent) { e.preventDefault(); if (await run(() => post('/api/employee-benefits/schemes', { ...form, clientId: Number(form.clientId), insurerId: Number(form.insurerId), perMemberPremium: Number(form.perMemberPremium) }), 'Scheme created')) { setForm({ ...form, planName: '', perMemberPremium: '' }); schemes.reload(); } }
  async function upload() {
    const members = census.split('\n').map((l) => l.split(',').map((s) => s.trim())).filter((p) => p[0] && p[1]).map(([memberNo, name, birthDate, dependents]) => ({ memberNo, name, birthDate: birthDate || undefined, dependents: Number(dependents || 0) }));
    const r = await run(() => post(`/api/employee-benefits/schemes/${sel.scheme.id}/members`, { members }));
    if (r) { run(async () => r, `Census: ${r.added} added, ${r.updated} updated`); loadScheme(sel.scheme.id); schemes.reload(); }
  }
  return (
    <>
      <PageHead code="EB" title="Employee Benefits" sub="Group schemes for corporate clients with member census; premium is computed on covered lives (members + dependents)." />
      <div className="stack">
        <form className="card" onSubmit={create}>
          <h2>New scheme</h2>
          <div className="form-grid">
            <Field label="Corporate client"><ClientSelect value={form.clientId} onChange={(v) => setForm({ ...form, clientId: v })} clients={(clients.data?.clients ?? []).filter((c: any) => c.type === 'corporate')} /></Field>
            <Field label="Insurer"><select value={form.insurerId} onChange={(e) => setForm({ ...form, insurerId: e.target.value })} required><option value="">Select…</option>{(insurers.data?.insurers ?? []).map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
            <Field label="Plan"><input value={form.planName} onChange={(e) => setForm({ ...form, planName: e.target.value })} required /></Field>
            <Field label="Premium per life (₱)"><input type="number" min={1} value={form.perMemberPremium} onChange={(e) => setForm({ ...form, perMemberPremium: e.target.value })} required /></Field>
            <Field label="Inception"><input type="date" value={form.inceptionDate} onChange={(e) => setForm({ ...form, inceptionDate: e.target.value })} /></Field>
          </div>
          <div className="row end" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} type="submit">Create scheme</button></div>
        </form>
        <DataTable rows={schemes.data?.schemes} onRow={(r) => loadScheme(r.id)} cols={[{ key: 'scheme_no', label: 'Scheme' }, { key: 'client_name', label: 'Client' }, { key: 'plan_name', label: 'Plan' }, { key: 'insurer_name', label: 'Insurer' }, { key: 'active_members', label: 'Members', num: true }, { key: 'covered_lives', label: 'Lives', num: true }, { key: 'annual_premium', label: 'Annual premium', num: true, render: (r) => peso(r.annual_premium) }, { key: 'expiry_date', label: 'Expiry', render: (r) => fmtDate(r.expiry_date) }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }]} />
        {sel && (
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}><h2>{sel.scheme.scheme_no} · {sel.scheme.plan_name} · {sel.scheme.covered_lives} lives · {peso(sel.scheme.annual_premium)}</h2><button className="btn sm" onClick={() => setSel(null)}>Close</button></div>
            <Field label="Census upload (member no, name, birth date, dependents — one per line)"><textarea rows={4} value={census} onChange={(e) => setCensus(e.target.value)} /></Field>
            <div className="row end" style={{ margin: '10px 0' }}><button className="btn primary" disabled={busy} onClick={upload}>Upload census</button></div>
            <DataTable rows={sel.members} cols={[{ key: 'member_no', label: 'Member' }, { key: 'name', label: 'Name' }, { key: 'birth_date', label: 'Birth date', render: (r) => fmtDate(r.birth_date) }, { key: 'dependents', label: 'Dependents', num: true }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }, { key: 'act', label: '', render: (r) => r.status === 'active' ? <button className="btn sm" disabled={busy} onClick={async () => { if (await run(() => post(`/api/employee-benefits/schemes/${sel.scheme.id}/members/${r.id}/withdraw`), 'Member withdrawn')) loadScheme(sel.scheme.id); }}>Withdraw</button> : null }]} />
          </div>
        )}
      </div>
    </>
  );
}
