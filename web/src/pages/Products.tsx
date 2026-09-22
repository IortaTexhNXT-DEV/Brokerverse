import { useState, type FormEvent } from 'react';
import { get, post, peso, fmtDate, fmtDateTime, todayIso } from '../api';
import { useAuth } from '../auth';
import { DataTable, Field, PageHead, Pill, Tabs, useAction, useLoad } from '../components/ui';

const pct = (v: number) => `${(Number(v) * 100).toFixed(2)}%`;
const LINES = ['motor', 'property', 'fire', 'marine', 'casualty', 'accident', 'life', 'eb'];

function ProductForm({ onDone }: { onDone: () => void }) {
  const { run, busy } = useAction();
  const [form, setForm] = useState({ code: '', name: '', line: 'motor', packaged: true, baseRate: '', minPremium: '0', commissionRate: '', vatRate: '0.12', dstRate: '0.125', lgtRate: '0.0075', fstRate: '0', maxSumInsured: '', surveyRequiredAbove: '' });
  const num = (v: string) => (v === '' ? undefined : Number(v));
  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = { code: form.code, name: form.name, line: form.line, packaged: form.packaged, baseRate: Number(form.baseRate), minPremium: Number(form.minPremium), commissionRate: Number(form.commissionRate), vatRate: Number(form.vatRate), dstRate: Number(form.dstRate), lgtRate: Number(form.lgtRate), fstRate: Number(form.fstRate), maxSumInsured: num(form.maxSumInsured), surveyRequiredAbove: num(form.surveyRequiredAbove) };
    if (await run(() => post('/api/products', body), 'Package maintenance request raised; activates on approval')) { setForm({ ...form, code: '', name: '', baseRate: '', commissionRate: '' }); onDone(); }
  }
  return (
    <form className="card" onSubmit={submit}>
      <h2>New package (maintenance request)</h2>
      <div className="form-grid">
        <Field label="Code"><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required /></Field>
        <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
        <Field label="Line"><select value={form.line} onChange={(e) => setForm({ ...form, line: e.target.value })}>{LINES.map((l) => <option key={l}>{l}</option>)}</select></Field>
        <Field label="Packaged"><span className="row"><input type="checkbox" checked={form.packaged} onChange={(e) => setForm({ ...form, packaged: e.target.checked })} style={{ width: 'auto' }} /> packaged (non-packaged accounts go through TSU)</span></Field>
        <Field label="Base rate (fraction)" hint="0.0125 = 1.25% of sum insured"><input type="number" step="0.000001" min={0} value={form.baseRate} onChange={(e) => setForm({ ...form, baseRate: e.target.value })} required /></Field>
        <Field label="Minimum premium"><input type="number" min={0} value={form.minPremium} onChange={(e) => setForm({ ...form, minPremium: e.target.value })} /></Field>
        <Field label="Commission (fraction)"><input type="number" step="0.001" min={0} max={0.5} value={form.commissionRate} onChange={(e) => setForm({ ...form, commissionRate: e.target.value })} required /></Field>
        <Field label="VAT"><input type="number" step="0.001" value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: e.target.value })} /></Field>
        <Field label="DST"><input type="number" step="0.001" value={form.dstRate} onChange={(e) => setForm({ ...form, dstRate: e.target.value })} /></Field>
        <Field label="LGT"><input type="number" step="0.0001" value={form.lgtRate} onChange={(e) => setForm({ ...form, lgtRate: e.target.value })} /></Field>
        <Field label="FST (fire lines)"><input type="number" step="0.001" value={form.fstRate} onChange={(e) => setForm({ ...form, fstRate: e.target.value })} /></Field>
        <Field label="Max sum insured"><input type="number" min={0} value={form.maxSumInsured} onChange={(e) => setForm({ ...form, maxSumInsured: e.target.value })} /></Field>
        <Field label="Survey required above"><input type="number" min={0} value={form.surveyRequiredAbove} onChange={(e) => setForm({ ...form, surveyRequiredAbove: e.target.value })} /></Field>
      </div>
      <div className="row end" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} type="submit">Submit maintenance request</button></div>
    </form>
  );
}

function taxesOf(r: any) {
  const fst = Number(r.fst_rate) ? ` · FST ${pct(r.fst_rate)}` : '';
  return `VAT ${pct(r.vat_rate)} · DST ${pct(r.dst_rate)} · LGT ${pct(r.lgt_rate)}${fst}`;
}

function PackagesTab({ canEdit }: { canEdit: boolean }) {
  const { data, reload } = useLoad(() => get('/api/products'), []);
  const advisories = useLoad(() => get('/api/products/release-advisories'), []);
  const { run, busy } = useAction();
  const changeRequest = async (r: any) => {
    const field = window.prompt('Field to change (commissionRate, baseRate, minPremium, maxSumInsured, status)'); if (!field) return;
    const value = window.prompt(`New value for ${field}`); if (value === null) return;
    const summary = window.prompt('Change summary for the release advisory'); if (!summary) return;
    const parsed: unknown = field === 'status' ? value : Number(value);
    if (await run(() => post(`/api/products/${r.id}/change-request`, { changes: { [field]: parsed }, summary, effectiveDate: todayIso() }), 'Maintenance request raised for approval')) reload();
  };
  return (
    <div className="stack">
      {canEdit && <ProductForm onDone={reload} />}
      <DataTable rows={data?.products} cols={[
        { key: 'code', label: 'Code' }, { key: 'name', label: 'Package' }, { key: 'line', label: 'Line' }, { key: 'packaged', label: 'Type', render: (r) => <Pill value={r.packaged ? 'packaged' : 'non-packaged'} /> }, { key: 'base_rate', label: 'Rate', num: true, render: (r) => `${(Number(r.base_rate) * 100).toFixed(3)}%` }, { key: 'min_premium', label: 'Min premium', num: true, render: (r) => peso(r.min_premium) },
        { key: 'commission_rate', label: 'Comm.', num: true, render: (r) => pct(r.commission_rate) }, { key: 'taxes', label: 'Taxes', render: taxesOf }, { key: 'max_sum_insured', label: 'Max SI', num: true, render: (r) => (r.max_sum_insured ? peso(r.max_sum_insured) : '—') }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> },
        { key: 'act', label: '', render: (r) => (canEdit ? <button className="btn sm" disabled={busy} onClick={() => changeRequest(r)}>Change request</button> : null) },
      ]} />
      <div className="card">
        <h2>Release advisories</h2>
        <DataTable rows={advisories.data?.advisories} empty="No advisories yet." cols={[{ key: 'advisory_no', label: 'Advisory' }, { key: 'product_code', label: 'Package' }, { key: 'summary', label: 'Summary', wrap: true }, { key: 'changes', label: 'Changes', wrap: true, render: (r) => <span className="mono small">{JSON.stringify(r.changes)}</span> }, { key: 'effective_date', label: 'Effective', render: (r) => fmtDate(r.effective_date) }, { key: 'approved_by_name', label: 'Approved by' }, { key: 'created_at', label: 'Published', render: (r) => fmtDateTime(r.created_at) }]} />
      </div>
    </div>
  );
}

const TSU_NEXT: Record<string, { to: string; label: string; approver?: boolean }[]> = {
  submitted: [{ to: 'acknowledged', label: 'Acknowledge' }, { to: 'incomplete', label: 'Return incomplete' }],
  incomplete: [{ to: 'submitted', label: 'Resubmitted' }],
  acknowledged: [{ to: 'qs_prepared', label: 'Prepare quotation slip' }],
  qs_prepared: [{ to: 'qs_approved', label: 'TL approve QS', approver: true }, { to: 'acknowledged', label: 'Revise' }],
  qs_approved: [{ to: 'ri_referred', label: 'Refer to RI' }, { to: 'sent_to_insurers', label: 'Send QS to insurers' }],
  ri_referred: [{ to: 'sent_to_insurers', label: 'RI cleared → send to insurers' }],
  sent_to_insurers: [{ to: 'comparative_ready', label: 'Comparative table ready' }],
  comparative_ready: [{ to: 'proposal_approved', label: 'Approve proposal slip', approver: true }, { to: 'sent_to_insurers', label: 'Request more quotes' }, { to: 'closed', label: 'Close' }],
  proposal_approved: [{ to: 'closed', label: 'Close' }],
};

function collectStepInput(to: string, insurers: any[]): Record<string, unknown> | null {
  if (to === 'qs_prepared') {
    const quotationSlip = window.prompt('Quotation slip: risk details, terms, pricing');
    return quotationSlip ? { quotationSlip } : null;
  }
  if (to === 'sent_to_insurers') {
    const options = insurers.map((i) => i.id + '=' + i.code).join(', ');
    const ids = window.prompt(`Insurer ids, comma separated (${options})`);
    return ids ? { insurerIds: ids.split(',').map((x) => Number(x.trim())).filter(Boolean) } : null;
  }
  if (to === 'proposal_approved') {
    const ins = window.prompt('Selected insurer id');
    const proposalSlip = ins ? window.prompt('Proposal slip: selected insurer, justification, exceptions') : null;
    return ins && proposalSlip ? { selectedInsurerId: Number(ins), proposalSlip } : null;
  }
  return {};
}

function TsuActions({ t, insurers, onAct }: { t: any; insurers: any[]; onAct: (to: string, extra: Record<string, unknown>) => void }) {
  const { user } = useAuth();
  const pick = (step: { to: string }) => {
    const extra = collectStepInput(step.to, insurers);
    if (extra) onAct(step.to, extra);
  };
  return <span className="row">{(TSU_NEXT[t.status] ?? []).filter((s) => !s.approver || user?.canApprove).map((s) => <button key={s.to} className={`btn sm ${s.approver ? 'green' : ''}`} onClick={() => pick(s)}>{s.label}</button>)}</span>;
}

function TsuTab() {
  const list = useLoad(() => get('/api/tsu'), []);
  const clients = useLoad(() => get('/api/clients'), []);
  const insurers = useLoad(() => get('/api/insurers'), []);
  const { run, busy } = useAction();
  const [form, setForm] = useState({ clientId: '', line: 'fire', sumInsured: '', riskDetails: '', expiringTerms: '' });
  const [sel, setSel] = useState<any>(null);
  const act = async (id: number, to: string, extra: Record<string, unknown>) => { if (await run(() => post(`/api/tsu/${id}/transition`, { to, ...extra }), `Request ${to.replaceAll('_', ' ')}`)) { list.reload(); if (sel?.request.id === id) setSel(await get(`/api/tsu/${id}`)); } };
  const respond = async (t: any, ins: any) => {
    const response = window.prompt(`${ins.insurer_name}: accepted / declined / conditional`, 'accepted'); if (!response) return;
    const premium = window.prompt('Premium quoted'); const evidence = response === 'accepted' ? window.prompt('Acceptance evidence (signed slip / stamped slip / explicit email)') : undefined; const conditions = response !== 'accepted' ? window.prompt('Conditions / reason') : undefined;
    if (await run(() => post(`/api/tsu/${t.id}/responses`, { insurerId: ins.insurer_id, response, premium: premium ? Number(premium) : undefined, evidence: evidence ?? undefined, conditions: conditions ?? undefined }), 'Response recorded')) setSel(await get(`/api/tsu/${t.id}`));
  };
  return (
    <div className="stack">
      <form className="card" onSubmit={async (e) => { e.preventDefault(); if (await run(() => post('/api/tsu', { ...form, clientId: Number(form.clientId), sumInsured: Number(form.sumInsured) }), 'TSU request submitted')) { setForm({ ...form, sumInsured: '', riskDetails: '' }); list.reload(); } }}>
        <h2>TSU request form (non-packaged accounts)</h2>
        <div className="form-grid">
          <Field label="Client"><select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} required><option value="">Select…</option>{(clients.data?.clients ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.client_no} · {c.name}</option>)}</select></Field>
          <Field label="Line"><select value={form.line} onChange={(e) => setForm({ ...form, line: e.target.value })}>{LINES.map((l) => <option key={l}>{l}</option>)}</select></Field>
          <Field label="Sum insured (₱)"><input type="number" min={1} value={form.sumInsured} onChange={(e) => setForm({ ...form, sumInsured: e.target.value })} required /></Field>
          <Field label="Expiring terms"><input value={form.expiringTerms} onChange={(e) => setForm({ ...form, expiringTerms: e.target.value })} /></Field>
          <Field label="Risk details, coverage requirements, special conditions"><input value={form.riskDetails} onChange={(e) => setForm({ ...form, riskDetails: e.target.value })} minLength={10} required /></Field>
        </div>
        <div className="row end" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} type="submit">Submit to TSU</button></div>
      </form>
      <DataTable rows={list.data?.requests} onRow={async (r) => setSel(await get(`/api/tsu/${r.id}`))} cols={[
        { key: 'request_no', label: 'Request' }, { key: 'client_name', label: 'Client' }, { key: 'line', label: 'Line' }, { key: 'sum_insured', label: 'Sum insured', num: true, render: (r) => peso(r.sum_insured) }, { key: 'requires_ri', label: 'RI', render: (r) => (r.requires_ri ? '✓' : '—') },
        { key: 'insurers_approached', label: 'Insurers', num: true, render: (r) => `${r.insurers_accepted}/${r.insurers_approached}` }, { key: 'selected_insurer_name', label: 'Selected', render: (r) => r.selected_insurer_name ?? '—' }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }, { key: 'updated_at', label: 'Updated', render: (r) => fmtDateTime(r.updated_at) },
        { key: 'act', label: '', render: (r) => <TsuActions t={r} insurers={insurers.data?.insurers ?? []} onAct={(to, extra) => act(r.id, to, extra)} /> },
      ]} />
      {sel && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}><h2>{sel.request.request_no} · comparative table</h2><button className="btn sm" onClick={() => setSel(null)}>Close</button></div>
          {sel.request.quotation_slip && <p className="small"><b>Quotation slip:</b> {sel.request.quotation_slip}</p>}
          {sel.request.proposal_slip && <p className="small"><b>Proposal slip:</b> {sel.request.proposal_slip}</p>}
          <DataTable rows={sel.responses} empty="Quotation slip not yet sent to insurers." cols={[{ key: 'insurer_name', label: 'Insurer' }, { key: 'security_rating', label: 'Rating' }, { key: 'response', label: 'Response', render: (r) => <Pill value={r.response} /> }, { key: 'premium', label: 'Premium', num: true, render: (r) => (r.premium ? peso(r.premium) : '—') }, { key: 'conditions', label: 'Conditions', wrap: true }, { key: 'evidence', label: 'Evidence', wrap: true }, { key: 'act', label: '', render: (r) => sel.request.status === 'sent_to_insurers' ? <button className="btn sm" disabled={busy} onClick={() => respond(sel.request, r)}>Record response</button> : null }]} />
        </div>
      )}
    </div>
  );
}

function InsurerPanel({ canEdit }: { canEdit: boolean }) {
  const insurers = useLoad(() => get('/api/insurers'), []);
  const { run, busy } = useAction();
  const [insForm, setInsForm] = useState({ code: '', name: '', securityRating: 'A', accredited: true, sftpEnrolled: false });
  return (
    <div className="card">
      <h2>Insurer panel</h2>
      {canEdit && (
        <form className="row" style={{ marginBottom: 12 }} onSubmit={async (e) => { e.preventDefault(); if (await run(() => post('/api/insurers', insForm), 'Insurer added')) { setInsForm({ code: '', name: '', securityRating: 'A', accredited: true, sftpEnrolled: false }); insurers.reload(); } }}>
          <input placeholder="Code" value={insForm.code} onChange={(e) => setInsForm({ ...insForm, code: e.target.value.toUpperCase() })} required style={{ width: 90 }} className="mono" />
          <input placeholder="Insurer name" value={insForm.name} onChange={(e) => setInsForm({ ...insForm, name: e.target.value })} required />
          <select value={insForm.securityRating} onChange={(e) => setInsForm({ ...insForm, securityRating: e.target.value })}>{['AAA', 'AA', 'A', 'BBB', 'BB'].map((r) => <option key={r}>{r}</option>)}</select>
          <label className="small"><input type="checkbox" checked={insForm.accredited} onChange={(e) => setInsForm({ ...insForm, accredited: e.target.checked })} /> accredited</label>
          <label className="small"><input type="checkbox" checked={insForm.sftpEnrolled} onChange={(e) => setInsForm({ ...insForm, sftpEnrolled: e.target.checked })} /> SFTP</label>
          <button className="btn sm primary" disabled={busy}>Add</button>
        </form>
      )}
      <DataTable rows={insurers.data?.insurers} cols={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Insurer' }, { key: 'security_rating', label: 'Rating', render: (r) => <Pill value={r.security_rating} /> }, { key: 'accredited', label: 'Accredited', render: (r) => (r.accredited ? '✓' : '—') }, { key: 'sftp_enrolled', label: 'SFTP', render: (r) => (r.sftp_enrolled ? '✓' : '—') }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }]} />
    </div>
  );
}

export function ProductsPage() {
  const { has } = useAuth();
  const [tab, setTab] = useState('packages');
  return (
    <>
      <PageHead code="PM" title="Product Maintenance & TSU" sub="Packages change only through an approved maintenance request that publishes a release advisory. Non-packaged accounts go through the TSU: request → completeness check → quotation slip → TL approval → RI referral → insurer quotes with acceptance evidence → comparative table → proposal slip approval." />
      <Tabs tabs={[{ key: 'packages', label: 'Packages' }, { key: 'tsu', label: 'TSU requests' }, { key: 'insurers', label: 'Insurers' }]} active={tab} onChange={setTab} />
      {tab === 'packages' && <PackagesTab canEdit={has('PM')} />}
      {tab === 'tsu' && <TsuTab />}
      {tab === 'insurers' && <InsurerPanel canEdit={has('PM')} />}
    </>
  );
}
