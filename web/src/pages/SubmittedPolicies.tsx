import { useState } from 'react';
import { get, post, peso, fmtDateTime } from '../api';
import { DataTable, Field, PageHead, Pill, useAction, useLoad } from '../components/ui';

export function SubmittedPoliciesPage() {
  const { data, reload } = useLoad(() => get('/api/submitted-policies/batches'), []);
  const insurers = useLoad(() => get('/api/insurers'), []);
  const { run, busy } = useAction();
  const [insurerId, setInsurerId] = useState('');
  const [fileName, setFileName] = useState('masterlist.csv');
  const [text, setText] = useState('POL-2026-00001, Toyota Motor Philippines Corp., 15656.25\nPOL-1999-00001, Unknown Client, 1000\nPOL-2026-00002, Ayala Land Inc.,');
  const [sel, setSel] = useState<any>(null);
  async function upload() {
    const rows = text.split('\n').map((l) => l.split(',').map((s) => s.trim())).filter((p) => p[0]).map(([policyNo, clientName, premium]) => ({ policyNo, clientName: clientName ?? '', premium: premium ? Number(premium) : null }));
    const r = await run(() => post('/api/submitted-policies/batches', { insurerId: Number(insurerId), fileName, rows }));
    if (r) { run(async () => r, `${r.batchNo}: ${r.masterlist} masterlist · ${r.renewal} renewal · ${r.fallout} fallout · ${r.excluded} excluded`); reload(); setSel(await get(`/api/submitted-policies/batches/${r.id}`)); }
  }
  function onFile(f: File | undefined) { if (!f) return; setFileName(f.name); f.text().then((t) => setText(t.split('\n').filter((l) => l.trim() && !/^policy/i.test(l)).join('\n'))); }
  return (
    <>
      <PageHead code="SP" title="Submitted Policies" sub="Insurer masterlist pipeline: sanitise → match in-force policies → classify as Masterlist, Renewal (expiring ≤60 days), Excluded (no premium) or Fallout (unmatched)." />
      <div className="stack">
        <div className="card">
          <h2>Upload masterlist</h2>
          <div className="form-grid">
            <Field label="Insurer"><select value={insurerId} onChange={(e) => setInsurerId(e.target.value)} required><option value="">Select…</option>{(insurers.data?.insurers ?? []).map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
            <Field label="File (CSV: policy no, client name, premium)"><input type="file" accept=".csv,.txt" onChange={(e) => onFile(e.target.files?.[0])} /></Field>
          </div>
          <Field label={`Rows (${fileName})`}><textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} className="mono" /></Field>
          <div className="row end" style={{ marginTop: 10 }}><button className="btn primary" disabled={busy || !insurerId} onClick={upload}>Run pipeline</button></div>
        </div>
        <DataTable rows={data?.batches} onRow={async (r) => setSel(await get(`/api/submitted-policies/batches/${r.id}`))} cols={[
          { key: 'batch_no', label: 'Batch' }, { key: 'insurer_name', label: 'Insurer' }, { key: 'file_name', label: 'File' }, { key: 'total_rows', label: 'Rows', num: true }, { key: 'masterlist', label: 'Masterlist', num: true }, { key: 'renewal', label: 'Renewal', num: true }, { key: 'fallout', label: 'Fallout', num: true }, { key: 'excluded', label: 'Excluded', num: true }, { key: 'uploaded_at', label: 'Uploaded', render: (r) => fmtDateTime(r.uploaded_at) },
        ]} />
        {sel && (
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}><h2>{sel.batch.batch_no} · {sel.batch.file_name}</h2><button className="btn sm" onClick={() => setSel(null)}>Close</button></div>
            <DataTable rows={sel.rows} cols={[{ key: 'policy_no_raw', label: 'Policy (raw)' }, { key: 'client_name_raw', label: 'Client (raw)' }, { key: 'premium_raw', label: 'Premium', num: true, render: (r) => (r.premium_raw === null ? '—' : peso(r.premium_raw)) }, { key: 'classification', label: 'Class', render: (r) => <Pill value={r.classification} /> }, { key: 'matched_policy_no', label: 'Matched', render: (r) => r.matched_policy_no ?? '—' }]} />
          </div>
        )}
      </div>
    </>
  );
}
