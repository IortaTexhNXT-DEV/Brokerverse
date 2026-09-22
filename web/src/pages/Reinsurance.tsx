import { useState, type FormEvent } from 'react';
import { get, post, peso, fmtDate, fmtDateTime } from '../api';
import { DataTable, Field, PageHead, Pill, Tabs, useAction, useLoad } from '../components/ui';

const RATINGS = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'NR'];

function TreatyForm({ onDone }: { onDone: () => void }) {
  const { run, busy } = useAction();
  const yr = new Date().getFullYear();
  const [tf, setTf] = useState({ code: '', name: '', reinsurer: '', reinsurerRating: 'A', type: 'quota_share', cessionRate: '0.4', capacity: '', inceptionDate: `${yr}-01-01`, expiryDate: `${yr}-12-31` });
  async function submit(e: FormEvent) { e.preventDefault(); if (await run(() => post('/api/reinsurance/treaties', { ...tf, cessionRate: Number(tf.cessionRate), capacity: Number(tf.capacity) }), 'Treaty registered')) { setTf({ ...tf, code: '', name: '', reinsurer: '', capacity: '' }); onDone(); } }
  return (
    <form className="card" onSubmit={submit}>
      <h2>Register treaty</h2>
      <div className="form-grid">
        <Field label="Code"><input value={tf.code} onChange={(e) => setTf({ ...tf, code: e.target.value.toUpperCase() })} required /></Field>
        <Field label="Name"><input value={tf.name} onChange={(e) => setTf({ ...tf, name: e.target.value })} required /></Field>
        <Field label="Reinsurer"><input value={tf.reinsurer} onChange={(e) => setTf({ ...tf, reinsurer: e.target.value })} required /></Field>
        <Field label="Security rating"><select value={tf.reinsurerRating} onChange={(e) => setTf({ ...tf, reinsurerRating: e.target.value })}>{RATINGS.map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Type"><select value={tf.type} onChange={(e) => setTf({ ...tf, type: e.target.value })}><option value="quota_share">Quota share</option><option value="surplus">Surplus</option><option value="xol">Excess of loss</option><option value="facultative">Facultative</option></select></Field>
        <Field label="Cession rate (0–1)"><input type="number" min={0} max={1} step="0.01" value={tf.cessionRate} onChange={(e) => setTf({ ...tf, cessionRate: e.target.value })} required /></Field>
        <Field label="Capacity (₱)"><input type="number" min={1} value={tf.capacity} onChange={(e) => setTf({ ...tf, capacity: e.target.value })} required /></Field>
        <Field label="Inception"><input type="date" value={tf.inceptionDate} onChange={(e) => setTf({ ...tf, inceptionDate: e.target.value })} /></Field>
        <Field label="Expiry"><input type="date" value={tf.expiryDate} onChange={(e) => setTf({ ...tf, expiryDate: e.target.value })} /></Field>
      </div>
      <div className="row end" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} type="submit">Register</button></div>
    </form>
  );
}

function Treaties() {
  const treaties = useLoad(() => get('/api/reinsurance/treaties'), []);
  const cessions = useLoad(() => get('/api/reinsurance/cessions'), []);
  const { run, busy } = useAction();
  const [cf, setCf] = useState({ policyNo: '', treatyId: '' });
  async function cede(e: FormEvent) { e.preventDefault(); const r = await run(() => post('/api/reinsurance/cessions', { policyNo: cf.policyNo, treatyId: Number(cf.treatyId) })); if (r) { run(async () => r, `Ceded SI ${peso(r.cededSumInsured)} · premium ${peso(r.cededPremium)}`); setCf({ ...cf, policyNo: '' }); cessions.reload(); treaties.reload(); } }
  return (
    <div className="stack">
      <TreatyForm onDone={treaties.reload} />
      <DataTable rows={treaties.data?.treaties} cols={[
        { key: 'code', label: 'Code' }, { key: 'name', label: 'Treaty' }, { key: 'reinsurer', label: 'Reinsurer' }, { key: 'reinsurer_rating', label: 'Rating', render: (r) => <Pill value={r.reinsurer_rating} /> }, { key: 'type', label: 'Type', render: (r) => <Pill value={r.type} /> },
        { key: 'cession_rate', label: 'Cession', num: true, render: (r) => `${(Number(r.cession_rate) * 100).toFixed(0)}%` }, { key: 'capacity', label: 'Capacity', num: true, render: (r) => peso(r.capacity) }, { key: 'utilised', label: 'Utilised', num: true, render: (r) => peso(r.utilised) }, { key: 'cessions', label: 'Cessions', num: true }, { key: 'inception_date', label: 'Period', render: (r) => `${fmtDate(r.inception_date)} – ${fmtDate(r.expiry_date)}` },
      ]} />
      <form className="card" onSubmit={cede}>
        <h2>Cede policy to treaty</h2>
        <div className="form-grid">
          <Field label="Policy number"><input value={cf.policyNo} onChange={(e) => setCf({ ...cf, policyNo: e.target.value })} placeholder="POL-2026-00001" required /></Field>
          <Field label="Treaty"><select value={cf.treatyId} onChange={(e) => setCf({ ...cf, treatyId: e.target.value })} required><option value="">Select…</option>{(treaties.data?.treaties ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.code} · {t.reinsurer}</option>)}</select></Field>
        </div>
        <div className="row end" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} type="submit">Cede</button></div>
      </form>
      <DataTable rows={cessions.data?.cessions} cols={[{ key: 'policy_no', label: 'Policy' }, { key: 'client_name', label: 'Client' }, { key: 'treaty_code', label: 'Treaty' }, { key: 'reinsurer', label: 'Reinsurer' }, { key: 'ceded_sum_insured', label: 'Ceded SI', num: true, render: (r) => peso(r.ceded_sum_insured) }, { key: 'ceded_premium', label: 'Ceded premium', num: true, render: (r) => peso(r.ceded_premium) }]} />
    </div>
  );
}

function SlipEditor({ placement, onDone, onCancel }: { placement: any; onDone: () => void; onCancel: () => void }) {
  const { run, busy } = useAction();
  const [lines, setLines] = useState<any[]>([{ reinsurer: '', rating: 'AA', share: '', premium: '', signedSlip: false }]);
  const set = (i: number, k: string, v: unknown) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const total = lines.reduce((s, l) => s + Number(l.share || 0), 0);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await run(() => post(`/api/reinsurance/placements/${placement.id}/transition`, { to: 'slip_prepared', lines: lines.filter((l) => l.reinsurer).map((l) => ({ ...l, share: Number(l.share), premium: Number(l.premium || 0) })) }), 'Reinsurance slip prepared')) onDone();
  }
  return (
    <form className="card" onSubmit={submit}>
      <h2>Facultative slip · {placement.request_no} · seeking {(Number(placement.requested_share) * 100).toFixed(2)}%</h2>
      <table><thead><tr><th>Reinsurer</th><th>Rating</th><th className="num">Share</th><th className="num">Premium</th><th>Signed slip</th></tr></thead><tbody>
        {lines.map((l, i) => (
          <tr key={i}>
            <td><input value={l.reinsurer} onChange={(e) => set(i, 'reinsurer', e.target.value)} /></td>
            <td><select value={l.rating} onChange={(e) => set(i, 'rating', e.target.value)}>{RATINGS.map((r) => <option key={r}>{r}</option>)}</select></td>
            <td className="num"><input type="number" min={0} max={1} step="0.01" value={l.share} onChange={(e) => set(i, 'share', e.target.value)} style={{ width: 90 }} /></td>
            <td className="num"><input type="number" min={0} value={l.premium} onChange={(e) => set(i, 'premium', e.target.value)} style={{ width: 130 }} /></td>
            <td><input type="checkbox" checked={l.signedSlip} onChange={(e) => set(i, 'signedSlip', e.target.checked)} /></td>
          </tr>
        ))}
      </tbody></table>
      <div className="row end" style={{ marginTop: 10 }}><button type="button" className="btn sm" onClick={() => setLines([...lines, { reinsurer: '', rating: 'AA', share: '', premium: '', signedSlip: false }])}>+ reinsurer</button><span className="mono">placed {(total * 100).toFixed(2)}%</span><button type="button" className="btn" onClick={onCancel}>Cancel</button><button className="btn primary" disabled={busy} type="submit">Save slip</button></div>
    </form>
  );
}

function slipTat(r: any): string {
  if (r.slip_prepared_at) return `done ${fmtDateTime(r.slip_prepared_at)}`;
  if (r.slip_due_at) return `due ${fmtDateTime(r.slip_due_at)}`;
  return '—';
}

function PlacementActions({ p, onAct, onSlip }: { p: any; onAct: (to: string, note?: string) => void; onSlip: () => void }) {
  switch (p.status) {
    case 'requested': return <><button className="btn sm primary" onClick={() => onAct('acknowledged')}>Acknowledge</button><button className="btn sm" onClick={() => { const n = window.prompt('What is missing?'); if (n) onAct('info_incomplete', n); }}>Info incomplete</button></>;
    case 'info_incomplete': return <button className="btn sm" onClick={() => onAct('requested')}>Info received</button>;
    case 'acknowledged': return <><button className="btn sm primary" onClick={onSlip}>Prepare slip</button><button className="btn sm danger" onClick={() => onAct('declined')}>Decline</button></>;
    case 'slip_prepared': return <><button className="btn sm" onClick={onSlip}>Revise slip</button><button className="btn sm green" onClick={() => onAct('placed')}>Close &amp; debit note</button></>;
    default: return null;
  }
}

function Placements() {
  const list = useLoad(() => get('/api/reinsurance/placements'), []);
  const { run, busy } = useAction();
  const [form, setForm] = useState({ cedant: 'BDOI TSU', riskDescription: '', sumInsured: '', requestedShare: '0.5', policyNo: '' });
  const [slipFor, setSlipFor] = useState<any>(null);
  const act = async (id: number, to: string, note?: string) => { const r = await run(() => post(`/api/reinsurance/placements/${id}/transition`, { to, note })); if (r) { run(async () => r, r.debitNoteNo ? `Placed · closing and debit note ${r.debitNoteNo} sent to cedant` : `Placement ${to.replaceAll('_', ' ')}`); list.reload(); } };
  return (
    <div className="stack">
      <form className="card" onSubmit={async (e) => { e.preventDefault(); if (await run(() => post('/api/reinsurance/placements', { ...form, sumInsured: Number(form.sumInsured), requestedShare: Number(form.requestedShare), policyNo: form.policyNo || undefined }), 'Facultative request logged · acknowledge within 24h')) { setForm({ ...form, riskDescription: '', sumInsured: '' }); list.reload(); } }}>
        <h2>Facultative placement request (from TSU)</h2>
        <div className="form-grid">
          <Field label="Cedant"><input value={form.cedant} onChange={(e) => setForm({ ...form, cedant: e.target.value })} required /></Field>
          <Field label="Sum insured (₱)"><input type="number" min={1} value={form.sumInsured} onChange={(e) => setForm({ ...form, sumInsured: e.target.value })} required /></Field>
          <Field label="Share sought (0–1)"><input type="number" min={0.01} max={1} step="0.01" value={form.requestedShare} onChange={(e) => setForm({ ...form, requestedShare: e.target.value })} required /></Field>
          <Field label="Policy no. (optional)"><input value={form.policyNo} onChange={(e) => setForm({ ...form, policyNo: e.target.value })} /></Field>
          <Field label="Risk description"><input value={form.riskDescription} onChange={(e) => setForm({ ...form, riskDescription: e.target.value })} minLength={10} required /></Field>
        </div>
        <div className="row end" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} type="submit">Request placement</button></div>
      </form>
      {slipFor && <SlipEditor placement={slipFor} onDone={() => { setSlipFor(null); list.reload(); }} onCancel={() => setSlipFor(null)} />}
      <DataTable rows={list.data?.placements} cols={[
        { key: 'request_no', label: 'Request' }, { key: 'cedant', label: 'Cedant' }, { key: 'risk_description', label: 'Risk', wrap: true }, { key: 'sum_insured', label: 'Sum insured', num: true, render: (r) => peso(r.sum_insured) }, { key: 'requested_share', label: 'Sought', num: true, render: (r) => `${(Number(r.requested_share) * 100).toFixed(0)}%` }, { key: 'placed_share', label: 'Placed', num: true, render: (r) => `${(Number(r.placed_share) * 100).toFixed(0)}%` },
        { key: 'ack_due_at', label: 'Ack TAT', render: (r) => <span className={r.ack_overdue ? 'pill bad' : ''}>{r.acknowledged_at ? `ack ${fmtDateTime(r.acknowledged_at)}` : `due ${fmtDateTime(r.ack_due_at)}`}</span> }, { key: 'slip_due_at', label: 'Slip TAT', render: (r) => <span className={r.slip_overdue ? 'pill bad' : ''}>{slipTat(r)}</span> },
        { key: 'debit_note_no', label: 'Debit note', render: (r) => r.debit_note_no ?? '—' }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> },
        { key: 'act', label: '', render: (r) => <span className="row"><PlacementActions p={r} onAct={(to, note) => act(r.id, to, note)} onSlip={() => setSlipFor(r)} /></span> },
      ]} />
    </div>
  );
}

export function ReinsurancePage() {
  const [tab, setTab] = useState('placements');
  return (
    <>
      <PageHead code="RI" title="Reinsurance" sub="Facultative placement from TSU with turnaround times (acknowledge within 24 hours, slip within 3 working days), security-rating gate, signed slips, closing and debit note to the cedant; treaty register and cessions." />
      <Tabs tabs={[{ key: 'placements', label: 'Facultative placements' }, { key: 'treaties', label: 'Treaties & cessions' }]} active={tab} onChange={setTab} />
      {tab === 'placements' && <Placements />}
      {tab === 'treaties' && <Treaties />}
    </>
  );
}
