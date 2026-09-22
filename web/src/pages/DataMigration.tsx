import { useState, type FormEvent } from 'react';
import { get, post, peso, fmtDateTime } from '../api';
import { DataTable, Field, PageHead, Pill, useAction, useLoad } from '../components/ui';

export function DataMigrationPage() {
  const { data, reload } = useLoad(() => get('/api/data-migration/batches'), []);
  const { run, busy } = useAction();
  const [form, setForm] = useState({ entity: 'policies', sourceCount: '', sourceValue: '0' });
  async function submit(e: FormEvent) { e.preventDefault(); if (await run(() => post('/api/data-migration/batches', { entity: form.entity, sourceCount: Number(form.sourceCount), sourceValue: Number(form.sourceValue) }), 'Batch registered')) { setForm({ ...form, sourceCount: '' }); reload(); } }
  async function load(id: number) {
    const c = window.prompt('Loaded count'); if (c === null) return; const v = window.prompt('Loaded value', '0'); if (v === null) return;
    const r = await run(() => post(`/api/data-migration/batches/${id}/load`, { loadedCount: Number(c), loadedValue: Number(v) }));
    if (r) { run(async () => r, r.status === 'reconciled' ? 'Reconciled: count and value match' : `Variance: count ${r.countVariance}, value ${peso(r.valueVariance)} – disposition required`); reload(); }
  }
  return (
    <>
      <PageHead code="DM" title="Data Migration" sub="Legacy extracts are registered with control totals, loaded, and reconciled on count and value. Any variance must be dispositioned before the gate opens." />
      <div className="stack">
        <form className="card" onSubmit={submit}>
          <h2>Register extract</h2>
          <div className="form-grid">
            <Field label="Entity"><select value={form.entity} onChange={(e) => setForm({ ...form, entity: e.target.value })}><option value="clients">Clients</option><option value="policies">Policies</option><option value="claims">Claims</option><option value="receivables">Receivables</option></select></Field>
            <Field label="Source count"><input type="number" min={0} value={form.sourceCount} onChange={(e) => setForm({ ...form, sourceCount: e.target.value })} required /></Field>
            <Field label="Source value (₱)"><input type="number" min={0} step="0.01" value={form.sourceValue} onChange={(e) => setForm({ ...form, sourceValue: e.target.value })} /></Field>
          </div>
          <div className="row end" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} type="submit">Register</button></div>
        </form>
        <DataTable rows={data?.batches} cols={[
          { key: 'batch_no', label: 'Batch' }, { key: 'entity', label: 'Entity' }, { key: 'source_count', label: 'Source #', num: true }, { key: 'loaded_count', label: 'Loaded #', num: true }, { key: 'source_value', label: 'Source ₱', num: true, render: (r) => peso(r.source_value) }, { key: 'loaded_value', label: 'Loaded ₱', num: true, render: (r) => peso(r.loaded_value) },
          { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }, { key: 'disposition_note', label: 'Disposition', wrap: true, render: (r) => r.disposition_note ?? '—' }, { key: 'created_at', label: 'Registered', render: (r) => fmtDateTime(r.created_at) },
          { key: 'act', label: '', render: (r) => r.status === 'pending' || r.status === 'disposition_required' ? <span className="row">
            <button className="btn sm" disabled={busy} onClick={() => load(r.id)}>Load &amp; reconcile</button>
            {r.status === 'disposition_required' && <button className="btn sm primary" disabled={busy} onClick={async () => { const note = window.prompt('Disposition note'); if (note && (await run(() => post(`/api/data-migration/batches/${r.id}/disposition`, { note }), 'Dispositioned'))) reload(); }}>Disposition</button>}
          </span> : null },
        ]} />
      </div>
    </>
  );
}
