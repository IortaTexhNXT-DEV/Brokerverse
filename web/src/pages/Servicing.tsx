import { useState, type FormEvent } from 'react';
import { get, post, fmtDateTime } from '../api';
import { ClientSelect, DataTable, Field, PageHead, Pill, useAction, useLoad } from '../components/ui';

export function ServicingPage() {
  const { data, reload } = useLoad(() => get('/api/servicing/requests'), []);
  const clients = useLoad(() => get('/api/clients'), []);
  const { run, busy } = useAction();
  const [form, setForm] = useState({ clientId: '' as number | '', channel: 'email', category: 'policy', description: '', verificationAnswer: '' });
  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = await run(() => post('/api/servicing/requests', { ...form, clientId: form.clientId || undefined, verificationAnswer: form.verificationAnswer || undefined }));
    if (r) { run(async () => r, `${r.requestNo} routed to ${r.owningUnit}${r.identityVerified ? ' · identity verified' : ''}`); setForm({ ...form, description: '', verificationAnswer: '' }); reload(); }
  }
  const next: Record<string, string> = { open: 'in_progress', in_progress: 'resolved', resolved: 'closed' };
  return (
    <>
      <PageHead code="CSF" title="Customer Servicing" sub="Log requests from any channel, verify caller identity (TIN or registered email on phone), and route to the owning unit." />
      <div className="stack">
        <form className="card" onSubmit={submit}>
          <h2>New service request</h2>
          <div className="form-grid">
            <Field label="Client"><ClientSelect value={form.clientId} onChange={(v) => setForm({ ...form, clientId: v })} clients={clients.data?.clients} /></Field>
            <Field label="Channel"><select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}><option value="email">Email</option><option value="phone">Phone</option><option value="walk-in">Walk-in</option><option value="portal">Portal</option></select></Field>
            <Field label="Category"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="policy">Policy (→ NB)</option><option value="billing">Billing (→ OPS)</option><option value="claims">Claims (→ CLM)</option><option value="renewal">Renewal (→ RN)</option><option value="complaint">Complaint (→ CSF)</option><option value="document">Document (→ CSF)</option></select></Field>
            <Field label="Identity check" hint="TIN or registered email quoted by the caller"><input value={form.verificationAnswer} onChange={(e) => setForm({ ...form, verificationAnswer: e.target.value })} /></Field>
            <Field label="Description"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} minLength={5} required /></Field>
          </div>
          <div className="row end" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} type="submit">Log request</button></div>
        </form>
        <DataTable rows={data?.requests} cols={[
          { key: 'request_no', label: 'Request' }, { key: 'client_name', label: 'Client', render: (r) => r.client_name ?? '—' }, { key: 'channel', label: 'Channel' }, { key: 'category', label: 'Category' }, { key: 'owning_unit', label: 'Unit', render: (r) => <Pill value={r.owning_unit} /> },
          { key: 'identity_verified', label: 'Verified', render: (r) => (r.identity_verified ? '✓' : '—') }, { key: 'description', label: 'Description', wrap: true }, { key: 'created_at', label: 'Logged', render: (r) => fmtDateTime(r.created_at) }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> },
          { key: 'act', label: '', render: (r) => next[r.status] ? <button className="btn sm" disabled={busy} onClick={async () => { if (await run(() => post(`/api/servicing/requests/${r.id}/status`, { status: next[r.status] }), 'Updated')) reload(); }}>{next[r.status].replace('_', ' ')}</button> : null },
        ]} />
      </div>
    </>
  );
}
