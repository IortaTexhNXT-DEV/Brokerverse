import { useState, type FormEvent } from 'react';
import { get, post, peso, fmtDate } from '../api';
import { DataTable, Field, PageHead, Pill, Tabs, useAction, useLoad } from '../components/ui';

export function ReinsurancePage() {
  const [tab, setTab] = useState('treaties');
  const treaties = useLoad(() => get('/api/reinsurance/treaties'), [tab]);
  const cessions = useLoad(() => get('/api/reinsurance/cessions'), [tab]);
  const { run, busy } = useAction();
  const yr = new Date().getFullYear();
  const [tf, setTf] = useState({ code: '', name: '', reinsurer: '', reinsurerRating: 'A', type: 'quota_share', cessionRate: '0.4', capacity: '', inceptionDate: `${yr}-01-01`, expiryDate: `${yr}-12-31` });
  const [cf, setCf] = useState({ policyNo: '', treatyId: '' });
  async function addTreaty(e: FormEvent) { e.preventDefault(); if (await run(() => post('/api/reinsurance/treaties', { ...tf, cessionRate: Number(tf.cessionRate), capacity: Number(tf.capacity) }), 'Treaty registered')) { setTf({ ...tf, code: '', name: '', reinsurer: '', capacity: '' }); treaties.reload(); } }
  async function cede(e: FormEvent) { e.preventDefault(); const r = await run(() => post('/api/reinsurance/cessions', { policyNo: cf.policyNo, treatyId: Number(cf.treatyId) })); if (r) { run(async () => r, `Ceded SI ${peso(r.cededSumInsured)} · premium ${peso(r.cededPremium)}`); setCf({ ...cf, policyNo: '' }); cessions.reload(); treaties.reload(); } }
  return (
    <>
      <PageHead code="RI" title="Reinsurance" sub="Treaty register with security-rating gate (BBB or better) and capacity control; per-policy cessions." />
      <Tabs tabs={[{ key: 'treaties', label: 'Treaties' }, { key: 'cessions', label: 'Cessions' }]} active={tab} onChange={setTab} />
      {tab === 'treaties' && (
        <div className="stack">
          <form className="card" onSubmit={addTreaty}>
            <h2>Register treaty</h2>
            <div className="form-grid">
              <Field label="Code"><input value={tf.code} onChange={(e) => setTf({ ...tf, code: e.target.value.toUpperCase() })} required /></Field>
              <Field label="Name"><input value={tf.name} onChange={(e) => setTf({ ...tf, name: e.target.value })} required /></Field>
              <Field label="Reinsurer"><input value={tf.reinsurer} onChange={(e) => setTf({ ...tf, reinsurer: e.target.value })} required /></Field>
              <Field label="Security rating"><select value={tf.reinsurerRating} onChange={(e) => setTf({ ...tf, reinsurerRating: e.target.value })}>{['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'NR'].map((r) => <option key={r}>{r}</option>)}</select></Field>
              <Field label="Type"><select value={tf.type} onChange={(e) => setTf({ ...tf, type: e.target.value })}><option value="quota_share">Quota share</option><option value="surplus">Surplus</option><option value="xol">Excess of loss</option><option value="facultative">Facultative</option></select></Field>
              <Field label="Cession rate (0–1)"><input type="number" min={0} max={1} step="0.01" value={tf.cessionRate} onChange={(e) => setTf({ ...tf, cessionRate: e.target.value })} required /></Field>
              <Field label="Capacity (₱)"><input type="number" min={1} value={tf.capacity} onChange={(e) => setTf({ ...tf, capacity: e.target.value })} required /></Field>
              <Field label="Inception"><input type="date" value={tf.inceptionDate} onChange={(e) => setTf({ ...tf, inceptionDate: e.target.value })} /></Field>
              <Field label="Expiry"><input type="date" value={tf.expiryDate} onChange={(e) => setTf({ ...tf, expiryDate: e.target.value })} /></Field>
            </div>
            <div className="row end" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} type="submit">Register</button></div>
          </form>
          <DataTable rows={treaties.data?.treaties} cols={[
            { key: 'code', label: 'Code' }, { key: 'name', label: 'Treaty' }, { key: 'reinsurer', label: 'Reinsurer' }, { key: 'reinsurer_rating', label: 'Rating', render: (r) => <Pill value={r.reinsurer_rating} /> }, { key: 'type', label: 'Type', render: (r) => <Pill value={r.type} /> },
            { key: 'cession_rate', label: 'Cession', num: true, render: (r) => `${(Number(r.cession_rate) * 100).toFixed(0)}%` }, { key: 'capacity', label: 'Capacity', num: true, render: (r) => peso(r.capacity) }, { key: 'utilised', label: 'Utilised', num: true, render: (r) => peso(r.utilised) },
            { key: 'cessions', label: 'Cessions', num: true }, { key: 'inception_date', label: 'Period', render: (r) => `${fmtDate(r.inception_date)} – ${fmtDate(r.expiry_date)}` },
          ]} />
        </div>
      )}
      {tab === 'cessions' && (
        <div className="stack">
          <form className="card" onSubmit={cede}>
            <h2>Cede policy</h2>
            <div className="form-grid">
              <Field label="Policy number"><input value={cf.policyNo} onChange={(e) => setCf({ ...cf, policyNo: e.target.value })} placeholder="POL-2026-00001" required /></Field>
              <Field label="Treaty"><select value={cf.treatyId} onChange={(e) => setCf({ ...cf, treatyId: e.target.value })} required><option value="">Select…</option>{(treaties.data?.treaties ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.code} · {t.reinsurer}</option>)}</select></Field>
            </div>
            <div className="row end" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} type="submit">Cede</button></div>
          </form>
          <DataTable rows={cessions.data?.cessions} cols={[{ key: 'policy_no', label: 'Policy' }, { key: 'client_name', label: 'Client' }, { key: 'treaty_code', label: 'Treaty' }, { key: 'reinsurer', label: 'Reinsurer' }, { key: 'ceded_sum_insured', label: 'Ceded SI', num: true, render: (r) => peso(r.ceded_sum_insured) }, { key: 'ceded_premium', label: 'Ceded premium', num: true, render: (r) => peso(r.ceded_premium) }]} />
        </div>
      )}
    </>
  );
}
