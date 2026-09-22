import { useState } from 'react';
import { get, post, peso, fmtDate, fmtDateTime } from '../api';
import { DataTable, Field, PageHead, Pill, Tabs, useAction, useLoad } from '../components/ui';

function parseRows(text: string) {
  return text.split('\n').map((l) => l.split(',').map((s) => s.trim())).filter((p) => p[0]).map(([policyNo, clientName, premium, insurerName, expiryDate]) => ({ policyNo, clientName: clientName ?? '', premium: premium ? Number(premium) : null, insurerName: insurerName || undefined, expiryDate: expiryDate || undefined }));
}

function BatchDetail({ sel, onClose, onChange }: { sel: any; onClose: () => void; onChange: () => void }) {
  const { run, busy } = useAction();
  const review = async (row: any, outcome: 'adequate' | 'findings') => {
    const findings = outcome === 'findings' ? window.prompt('Findings (an IAAF will be issued)') : undefined;
    if (outcome === 'findings' && !findings) return;
    const r = await run(() => post(`/api/submitted-policies/rows/${row.id}/review`, { outcome, findings }));
    if (r) { run(async () => r, r.iaafNo ? `IAAF ${r.iaafNo} issued` : 'Marked adequate'); onChange(); }
  };
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}><h2>{sel.batch.batch_no} · {sel.batch.file_name}</h2><button className="btn sm" onClick={onClose}>Close</button></div>
      <DataTable rows={sel.rows} cols={[
        { key: 'policy_no_raw', label: 'Policy (raw)' }, { key: 'client_name_raw', label: 'Client (raw)' }, { key: 'insurer_name_raw', label: 'Insurer', render: (r) => r.insurer_name_raw ?? '—' }, { key: 'premium_raw', label: 'Premium', num: true, render: (r) => (r.premium_raw === null ? '—' : peso(r.premium_raw)) }, { key: 'expiry_date', label: 'Expiry', render: (r) => fmtDate(r.expiry_date) },
        { key: 'classification', label: 'Class', render: (r) => <Pill value={r.classification} /> }, { key: 'matched_policy_no', label: 'Matched', render: (r) => r.matched_policy_no ?? '—' }, { key: 'adequacy_status', label: 'Adequacy', render: (r) => <Pill value={r.adequacy_status} /> }, { key: 'iaaf_no', label: 'IAAF', render: (r) => r.iaaf_no ?? '—' }, { key: 'findings', label: 'Findings', wrap: true, render: (r) => r.findings ?? '' },
        { key: 'act', label: '', render: (r) => r.adequacy_status === 'pending' ? <span className="row"><button className="btn sm green" disabled={busy} onClick={() => review(r, 'adequate')}>Adequate</button><button className="btn sm" disabled={busy} onClick={() => review(r, 'findings')}>Findings → IAAF</button></span> : null },
      ]} />
    </div>
  );
}

export function SubmittedPoliciesPage() {
  const [tab, setTab] = useState('batches');
  const { data, reload } = useLoad(() => get('/api/submitted-policies/batches'), []);
  const expiring = useLoad(() => get('/api/submitted-policies/expiring'), [tab]);
  const insurers = useLoad(() => get('/api/insurers'), []);
  const { run, busy } = useAction();
  const [insurerId, setInsurerId] = useState('');
  const [fileName, setFileName] = useState('submitted-masterlist.csv');
  const [text, setText] = useState('POL-2026-00001, Toyota Motor Philippines Corp., 15656.25\nEXT-2026-77, Home Loan Borrower, 8000, Other Insurer, 2027-01-15\nPOL-2026-00002, Ayala Land Inc.,');
  const [sel, setSel] = useState<any>(null);
  const openBatch = async (id: number) => setSel(await get(`/api/submitted-policies/batches/${id}`));
  async function upload() {
    const r = await run(() => post('/api/submitted-policies/batches', { insurerId: Number(insurerId), fileName, rows: parseRows(text) }));
    if (r) { run(async () => r, `${r.batchNo}: ${r.masterlist} masterlist · ${r.renewal} renewal · ${r.fallout} fallout · ${r.excluded} excluded`); reload(); openBatch(r.id); }
  }
  function onFile(f: File | undefined) {
    if (!f) return;
    setFileName(f.name);
    f.text().then((t) => setText(t.split('\n').filter((l) => l.trim() && !/^policy/i.test(l)).join('\n')));
  }
  return (
    <>
      <PageHead code="SP" title="Submitted Policies" sub="Policies bought elsewhere and submitted to the bank: masterlist pipeline (sanitise → match → classify), adequacy review with IAAF issuance, and the 150-day expiry window for renewal / conversion opportunity." />
      <Tabs tabs={[{ key: 'batches', label: 'Masterlist batches' }, { key: 'expiring', label: 'Expiring (150 days)' }]} active={tab} onChange={setTab} />
      {tab === 'expiring' && <DataTable rows={expiring.data?.rows} empty="No submitted policies expiring in the window." cols={[{ key: 'policy_no_raw', label: 'Policy' }, { key: 'client_name_raw', label: 'Client' }, { key: 'insurer_name_raw', label: 'Insurer', render: (r) => r.insurer_name_raw ?? '—' }, { key: 'expiry_date', label: 'Expiry', render: (r) => fmtDate(r.expiry_date) }, { key: 'days_to_expiry', label: 'Days', num: true }, { key: 'classification', label: 'Class', render: (r) => <Pill value={r.classification} /> }, { key: 'adequacy_status', label: 'Adequacy', render: (r) => <Pill value={r.adequacy_status} /> }, { key: 'batch_no', label: 'Batch' }]} />}
      {tab === 'batches' && (
        <div className="stack">
          <div className="card">
            <h2>Upload submitted masterlist</h2>
            <div className="form-grid">
              <Field label="Insurer (for matching)"><select value={insurerId} onChange={(e) => setInsurerId(e.target.value)} required><option value="">Select…</option>{(insurers.data?.insurers ?? []).map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
              <Field label="File (CSV: policy no, client, premium, insurer, expiry)"><input type="file" accept=".csv,.txt" onChange={(e) => onFile(e.target.files?.[0])} /></Field>
            </div>
            <Field label={`Rows (${fileName})`}><textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} className="mono" /></Field>
            <div className="row end" style={{ marginTop: 10 }}><button className="btn primary" disabled={busy || !insurerId} onClick={upload}>Run pipeline</button></div>
          </div>
          <DataTable rows={data?.batches} onRow={(r) => openBatch(r.id)} cols={[
            { key: 'batch_no', label: 'Batch' }, { key: 'insurer_name', label: 'Insurer' }, { key: 'file_name', label: 'File' }, { key: 'total_rows', label: 'Rows', num: true }, { key: 'masterlist', label: 'Masterlist', num: true }, { key: 'renewal', label: 'Renewal', num: true }, { key: 'fallout', label: 'Fallout', num: true }, { key: 'excluded', label: 'Excluded', num: true }, { key: 'uploaded_at', label: 'Uploaded', render: (r) => fmtDateTime(r.uploaded_at) },
          ]} />
          {sel && <BatchDetail sel={sel} onClose={() => setSel(null)} onChange={() => openBatch(sel.batch.id)} />}
        </div>
      )}
    </>
  );
}
