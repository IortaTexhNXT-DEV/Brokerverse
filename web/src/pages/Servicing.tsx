import { useState, type FormEvent } from 'react';
import { get, post, patch, peso, fmtDateTime } from '../api';
import { ClientSelect, DataTable, Field, PageHead, Pill, Tabs, useAction, useLoad } from '../components/ui';

function CaseForm({ onDone }: { onDone: () => void }) {
  const clients = useLoad(() => get('/api/clients'), []);
  const { run, busy } = useAction();
  const [form, setForm] = useState({ clientId: '' as number | '', channel: 'phone', category: 'inquiry', description: '', verificationAnswer: '', handledAtPointOfContact: false, tatHours: '48' });
  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = await run(() => post('/api/servicing/requests', { ...form, clientId: form.clientId || undefined, verificationAnswer: form.verificationAnswer || undefined, tatHours: Number(form.tatHours) }));
    if (r) { run(async () => r, r.status === 'closed' ? `${r.requestNo} logged and closed at point of contact` : `${r.requestNo} referred to ${r.owningUnit} (TAT ${form.tatHours}h)`); setForm({ ...form, description: '', verificationAnswer: '' }); onDone(); }
  }
  return (
    <form className="card" onSubmit={submit}>
      <h2>Log contact</h2>
      <div className="form-grid">
        <Field label="Client (blank = general inquiry)"><ClientSelect value={form.clientId} onChange={(v) => setForm({ ...form, clientId: v })} clients={clients.data?.clients} required={false} /></Field>
        <Field label="Channel"><select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}><option value="phone">Phone</option><option value="email">Email</option><option value="walk-in">Walk-in</option><option value="portal">Web / digital</option></select></Field>
        <Field label="Concern"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="inquiry">General inquiry</option><option value="policy">Policy (→ NB)</option><option value="billing">Billing (→ OPS)</option><option value="claims">Claims (→ CLM)</option><option value="renewal">Renewal (→ RN)</option><option value="complaint">Complaint (→ CSF)</option><option value="document">Document (→ CSF)</option></select></Field>
        <Field label="Positive identification" hint="Registered TIN or email quoted by the caller"><input value={form.verificationAnswer} onChange={(e) => setForm({ ...form, verificationAnswer: e.target.value })} /></Field>
        <Field label="TAT (hours)"><input type="number" min={1} value={form.tatHours} onChange={(e) => setForm({ ...form, tatHours: e.target.value })} /></Field>
        <Field label="Handled at point of contact"><span className="row"><input type="checkbox" checked={form.handledAtPointOfContact} onChange={(e) => setForm({ ...form, handledAtPointOfContact: e.target.checked })} style={{ width: 'auto' }} /> fulfilled and closed by the agent</span></Field>
        <Field label="Description"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} minLength={5} required /></Field>
      </div>
      <div className="row end" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} type="submit">Log case</button></div>
    </form>
  );
}

function CaseActions({ r, onAct }: { r: any; onAct: (status: string, reason?: string) => void }) {
  const next: Record<string, string> = { open: 'in_progress', in_progress: 'resolved', resolved: 'closed', returned: 'open' };
  if (!next[r.status]) return null;
  return (
    <span className="row">
      <button className="btn sm" onClick={() => onAct(next[r.status])}>{r.status === 'returned' ? 'Re-log' : next[r.status].replace('_', ' ')}</button>
      {['open', 'in_progress'].includes(r.status) && <button className="btn sm danger" onClick={() => { const reason = window.prompt('Return reason (mis-routed / error)'); if (reason) onAct('returned', reason); }}>Return to CCC</button>}
    </span>
  );
}

function Facility() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<any>(null);
  const { run, busy } = useAction();
  const search = async () => setRes(await get(`/api/servicing/search?q=${encodeURIComponent(q)}`));
  const update = async (c: any) => { const phone = window.prompt('Phone', c.phone ?? ''); const email = window.prompt('Email', c.email ?? ''); if (await run(() => patch(`/api/servicing/clients/${c.id}/contact`, { phone: phone || undefined, email: email || undefined }), 'Contact details updated')) search(); };
  return (
    <div className="stack">
      <form className="row" onSubmit={(e) => { e.preventDefault(); search(); }}><input placeholder="Invoice no., policy no., or client name" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 320 }} /><button className="btn primary">Search</button></form>
      {res && <>
        <div className="card"><h2>Clients</h2><DataTable rows={res.clients} empty="No clients." cols={[{ key: 'client_no', label: 'No.' }, { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'screening_status', label: 'Screening', render: (r) => <Pill value={r.screening_status} /> }, { key: 'act', label: '', render: (r) => <button className="btn sm" disabled={busy} onClick={() => update(r)}>Update contact</button> }]} /></div>
        <div className="card"><h2>Policies</h2><DataTable rows={res.policies} empty="No policies." cols={[{ key: 'policy_no', label: 'Policy' }, { key: 'client_name', label: 'Client' }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }]} /></div>
        <div className="card"><h2>Invoices</h2><DataTable rows={res.invoices} empty="No invoices." cols={[{ key: 'invoice_no', label: 'Invoice' }, { key: 'policy_no', label: 'Policy' }, { key: 'client_name', label: 'Client' }, { key: 'balance', label: 'Balance', num: true, render: (r) => peso(r.balance) }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }]} /></div>
      </>}
    </div>
  );
}

export function ServicingPage() {
  const [tab, setTab] = useState('cases');
  const { data, reload } = useLoad(() => get('/api/servicing/requests'), [tab]);
  const { run } = useAction();
  const onAct = async (id: number, status: string, reason?: string) => { if (await run(() => post(`/api/servicing/requests/${id}/status`, { status, reason }), 'Case updated')) reload(); };
  return (
    <>
      <PageHead code="CSF" title="Customer Servicing & Case Management" sub="Contact centre logs the concern; general inquiries close at point of contact; account cases pass positive identification and route to the owning unit with a turnaround time. Mis-routed cases return to the contact centre for re-logging." />
      <Tabs tabs={[{ key: 'cases', label: 'Cases' }, { key: 'facility', label: 'Servicing facility' }]} active={tab} onChange={setTab} />
      {tab === 'facility' && <Facility />}
      {tab === 'cases' && (
        <div className="stack">
          <CaseForm onDone={reload} />
          <DataTable rows={data?.requests} cols={[
            { key: 'request_no', label: 'Case' }, { key: 'case_type', label: 'Type', render: (r) => <Pill value={r.case_type} /> }, { key: 'client_name', label: 'Client', render: (r) => r.client_name ?? '—' }, { key: 'channel', label: 'Channel' }, { key: 'category', label: 'Concern' }, { key: 'owning_unit', label: 'Unit', render: (r) => <Pill value={r.owning_unit} /> },
            { key: 'identity_verified', label: 'PID', render: (r) => (r.identity_verified ? '✓' : '—') }, { key: 'tat_due_at', label: 'TAT due', render: (r) => <span className={r.past_tat ? 'pill bad' : ''}>{fmtDateTime(r.tat_due_at)}{r.past_tat ? ' · past TAT' : ''}</span> }, { key: 'description', label: 'Description', wrap: true },
            { key: 'return_reason', label: 'Return reason', wrap: true, render: (r) => r.return_reason ?? '' }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> },
            { key: 'act', label: '', render: (r) => <CaseActions r={r} onAct={(s, reason) => onAct(r.id, s, reason)} /> },
          ]} />
        </div>
      )}
    </>
  );
}
