import { useState, type FormEvent } from 'react';
import { get, post, patch, peso } from '../api';
import { useAuth } from '../auth';
import { DataTable, Field, PageHead, Pill, useAction, useLoad } from '../components/ui';

export function ProductsPage() {
  const { has } = useAuth();
  const { data, reload } = useLoad(() => get('/api/products'), []);
  const insurers = useLoad(() => get('/api/insurers'), []);
  const { run, busy } = useAction();
  const [form, setForm] = useState({ code: '', name: '', line: 'motor', baseRate: '', minPremium: '0', commissionRate: '', vatRate: '0.12', dstRate: '0.125', lgtRate: '0.0075', fstRate: '0', maxSumInsured: '', surveyRequiredAbove: '' });
  const [insForm, setInsForm] = useState({ code: '', name: '', securityRating: 'A' });
  async function submit(e: FormEvent) {
    e.preventDefault();
    const num = (v: string) => (v === '' ? undefined : Number(v));
    if (await run(() => post('/api/products', { code: form.code, name: form.name, line: form.line, baseRate: Number(form.baseRate), minPremium: Number(form.minPremium), commissionRate: Number(form.commissionRate), vatRate: Number(form.vatRate), dstRate: Number(form.dstRate), lgtRate: Number(form.lgtRate), fstRate: Number(form.fstRate), maxSumInsured: num(form.maxSumInsured), surveyRequiredAbove: num(form.surveyRequiredAbove) }), 'Product created')) { setForm({ ...form, code: '', name: '', baseRate: '', commissionRate: '' }); reload(); }
  }
  const pct = (v: number) => `${(Number(v) * 100).toFixed(2)}%`;
  return (
    <>
      <PageHead code="PM" title="Product Maintenance" sub="Rating engine parameters: base rate, minimum premium, statutory taxes (VAT, DST, LGT, FST), commission, acceptance limits and survey thresholds." />
      <div className="stack">
        {has('PM') && (
          <form className="card" onSubmit={submit}>
            <h2>New product</h2>
            <div className="form-grid">
              <Field label="Code"><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required /></Field>
              <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
              <Field label="Line"><select value={form.line} onChange={(e) => setForm({ ...form, line: e.target.value })}>{['motor', 'property', 'fire', 'marine', 'casualty', 'accident', 'life', 'eb'].map((l) => <option key={l}>{l}</option>)}</select></Field>
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
            <div className="row end" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} type="submit">Create product</button></div>
          </form>
        )}
        <DataTable rows={data?.products} cols={[
          { key: 'code', label: 'Code' }, { key: 'name', label: 'Product' }, { key: 'line', label: 'Line' }, { key: 'base_rate', label: 'Rate', num: true, render: (r) => `${(Number(r.base_rate) * 100).toFixed(3)}%` }, { key: 'min_premium', label: 'Min premium', num: true, render: (r) => peso(r.min_premium) },
          { key: 'commission_rate', label: 'Comm.', num: true, render: (r) => pct(r.commission_rate) }, { key: 'taxes', label: 'Taxes', render: (r) => `VAT ${pct(r.vat_rate)} · DST ${pct(r.dst_rate)} · LGT ${pct(r.lgt_rate)}${Number(r.fst_rate) ? ` · FST ${pct(r.fst_rate)}` : ''}` },
          { key: 'max_sum_insured', label: 'Max SI', num: true, render: (r) => (r.max_sum_insured ? peso(r.max_sum_insured) : '—') }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> },
          { key: 'act', label: '', render: (r) => has('PM') ? <button className="btn sm" disabled={busy} onClick={async () => { if (await run(() => patch(`/api/products/${r.id}`, { status: r.status === 'active' ? 'retired' : 'active' }), 'Updated')) reload(); }}>{r.status === 'active' ? 'Retire' : 'Reactivate'}</button> : null },
        ]} />
        <div className="card">
          <h2>Insurer panel</h2>
          {has('PM') && (
            <form className="row" style={{ marginBottom: 12 }} onSubmit={async (e) => { e.preventDefault(); if (await run(() => post('/api/insurers', insForm), 'Insurer added')) { setInsForm({ code: '', name: '', securityRating: 'A' }); insurers.reload(); } }}>
              <input placeholder="Code" value={insForm.code} onChange={(e) => setInsForm({ ...insForm, code: e.target.value.toUpperCase() })} required style={{ width: 90 }} className="mono" />
              <input placeholder="Insurer name" value={insForm.name} onChange={(e) => setInsForm({ ...insForm, name: e.target.value })} required />
              <select value={insForm.securityRating} onChange={(e) => setInsForm({ ...insForm, securityRating: e.target.value })}>{['AAA', 'AA', 'A', 'BBB', 'BB'].map((r) => <option key={r}>{r}</option>)}</select>
              <button className="btn sm primary" disabled={busy}>Add</button>
            </form>
          )}
          <DataTable rows={insurers.data?.insurers} cols={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Insurer' }, { key: 'security_rating', label: 'Security rating', render: (r) => <Pill value={r.security_rating} /> }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }]} />
        </div>
      </div>
    </>
  );
}
