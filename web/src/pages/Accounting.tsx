import { useState, type FormEvent } from 'react';
import { get, post, peso, fmtDate, fmtDateTime, todayIso } from '../api';
import { useAuth } from '../auth';
import { DataTable, Field, PageHead, Pill, Tabs, useAction, useLoad } from '../components/ui';

export function AccountingPage() {
  const { has } = useAuth();
  const [tab, setTab] = useState('remittances');
  return (
    <>
      <PageHead code="ADA" title="Accounting & Disbursement" sub="Double-entry ledger, accounting periods, trial balance, and insurer remittances under maker-checker." />
      <Tabs tabs={[{ key: 'remittances', label: 'Remittances' }, { key: 'journals', label: 'Journals' }, { key: 'trial', label: 'Trial balance' }, { key: 'periods', label: 'Periods' }]} active={tab} onChange={setTab} />
      {tab === 'remittances' && <Remittances canEdit={has('ADA')} />}
      {tab === 'journals' && <Journals canEdit={has('ADA')} />}
      {tab === 'trial' && <TrialBalance />}
      {tab === 'periods' && <Periods canEdit={has('ADA')} />}
    </>
  );
}

function Remittances({ canEdit }: { canEdit: boolean }) {
  const due = useLoad(() => get('/api/accounting/remittances/due'), []);
  const list = useLoad(() => get('/api/accounting/remittances'), []);
  const { run, busy } = useAction();
  async function create(d: any) {
    if (await run(() => post('/api/accounting/remittances', { insurerId: d.insurer_id, policyIds: d.policy_ids }), 'Remittance voucher raised for approval')) { due.reload(); list.reload(); }
  }
  async function pay(id: number) {
    const chequeNo = window.prompt('Cheque number'); if (!chequeNo) return;
    if (await run(() => post(`/api/accounting/remittances/${id}/pay`, { chequeNo }), 'Remittance paid and posted')) list.reload();
  }
  return (
    <div className="stack">
      <div className="card">
        <h2>Due to insurers (collected, not yet remitted)</h2>
        <DataTable rows={due.data?.due} empty="Nothing due for remittance." rowKey="insurer_id" cols={[
          { key: 'insurer_name', label: 'Insurer' }, { key: 'policies', label: 'Policies', num: true }, { key: 'amount', label: 'Net amount', num: true, render: (r) => <b>{peso(r.amount)}</b> },
          { key: 'act', label: '', render: (r) => canEdit ? <button className="btn sm primary" disabled={busy} onClick={() => create(r)}>Raise voucher</button> : null },
        ]} />
      </div>
      <DataTable rows={list.data?.remittances} cols={[
        { key: 'voucher_no', label: 'Voucher' }, { key: 'insurer_name', label: 'Insurer' }, { key: 'amount', label: 'Amount', num: true, render: (r) => peso(r.amount) }, { key: 'policy_ids', label: 'Policies', num: true, render: (r) => r.policy_ids.length },
        { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }, { key: 'cheque_no', label: 'Cheque', render: (r) => r.cheque_no ?? '—' }, { key: 'created_by_name', label: 'Maker' }, { key: 'paid_at', label: 'Paid', render: (r) => fmtDateTime(r.paid_at) },
        { key: 'act', label: '', render: (r) => r.status === 'approved' && canEdit ? <button className="btn sm green" disabled={busy} onClick={() => pay(r.id)}>Pay</button> : r.status === 'pending_approval' ? <span className="small muted">awaiting Finance Head</span> : null },
      ]} />
    </div>
  );
}

function Journals({ canEdit }: { canEdit: boolean }) {
  const [period, setPeriod] = useState('');
  const { data, reload } = useLoad(() => get(`/api/accounting/journals?period=${period}`), [period]);
  const accounts = useLoad(() => get('/api/accounting/accounts'), []);
  const { run, busy } = useAction();
  const [form, setForm] = useState({ entryDate: todayIso(), description: '', lines: [{ accountCode: '', debit: '', credit: '' }, { accountCode: '', debit: '', credit: '' }] });
  const setLine = (i: number, k: string, v: string) => setForm({ ...form, lines: form.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) });
  const totals = form.lines.reduce((t, l) => ({ d: t.d + Number(l.debit || 0), c: t.c + Number(l.credit || 0) }), { d: 0, c: 0 });
  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = await run(() => post('/api/accounting/journals', { entryDate: form.entryDate, description: form.description, lines: form.lines.filter((l) => l.accountCode).map((l) => ({ accountCode: l.accountCode, debit: Number(l.debit || 0), credit: Number(l.credit || 0) })) }));
    if (r) { run(async () => r, `${r.jvNo} posted to ${r.period}`); setForm({ ...form, description: '', lines: [{ accountCode: '', debit: '', credit: '' }, { accountCode: '', debit: '', credit: '' }] }); reload(); }
  }
  return (
    <div className="stack">
      {canEdit && (
        <form className="card" onSubmit={submit}>
          <h2>Proforma journal entry</h2>
          <div className="form-grid">
            <Field label="Entry date"><input type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} required /></Field>
            <Field label="Description"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required minLength={3} /></Field>
          </div>
          <table style={{ marginTop: 10 }}><thead><tr><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead><tbody>
            {form.lines.map((l, i) => (
              <tr key={i}>
                <td><select value={l.accountCode} onChange={(e) => setLine(i, 'accountCode', e.target.value)}><option value="">Select…</option>{(accounts.data?.accounts ?? []).map((a: any) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select></td>
                <td className="num"><input type="number" step="0.01" min={0} value={l.debit} onChange={(e) => setLine(i, 'debit', e.target.value)} style={{ width: 130, textAlign: 'right' }} /></td>
                <td className="num"><input type="number" step="0.01" min={0} value={l.credit} onChange={(e) => setLine(i, 'credit', e.target.value)} style={{ width: 130, textAlign: 'right' }} /></td>
              </tr>
            ))}
            <tr><td><button type="button" className="btn sm" onClick={() => setForm({ ...form, lines: [...form.lines, { accountCode: '', debit: '', credit: '' }] })}>+ line</button></td><td className="num"><b>{peso(totals.d)}</b></td><td className="num"><b>{peso(totals.c)}</b></td></tr>
          </tbody></table>
          <div className="row end" style={{ marginTop: 10 }}>{Math.abs(totals.d - totals.c) > 0.004 && <span className="pill bad">out of balance</span>}<button className="btn primary" disabled={busy || Math.abs(totals.d - totals.c) > 0.004 || totals.d === 0} type="submit">Post</button></div>
        </form>
      )}
      <div className="search"><input placeholder="Period (YYYY-MM)" value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
      <div className="tablewrap"><table>
        <thead><tr><th>JV</th><th>Date</th><th>Period</th><th>Description</th><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
        <tbody>{!data ? <tr><td colSpan={7}><div className="empty">Loading…</div></td></tr> : data.journals.length === 0 ? <tr><td colSpan={7}><div className="empty">No journals.</div></td></tr> : data.journals.flatMap((j: any) => j.lines.map((l: any, i: number) => (
          <tr key={l.id}>{i === 0 ? <><td rowSpan={j.lines.length}><span className="mono">{j.jv_no}</span></td><td rowSpan={j.lines.length}>{fmtDate(j.entry_date)}</td><td rowSpan={j.lines.length}>{j.period}</td><td rowSpan={j.lines.length} className="wrap">{j.description}</td></> : null}
            <td>{l.account_code} · {l.account_name}</td><td className="num">{Number(l.debit) ? peso(l.debit) : ''}</td><td className="num">{Number(l.credit) ? peso(l.credit) : ''}</td></tr>
        )))}</tbody>
      </table></div>
    </div>
  );
}

function TrialBalance() {
  const [period, setPeriod] = useState('');
  const { data } = useLoad(() => get(`/api/accounting/trial-balance?period=${period}`), [period]);
  return (
    <div className="stack">
      <div className="search"><input placeholder="Period (YYYY-MM), blank = all" value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
      <DataTable rows={data?.rows} rowKey="code" cols={[{ key: 'code', label: 'Account' }, { key: 'name', label: 'Name' }, { key: 'type', label: 'Type', render: (r) => <Pill value={r.type} /> }, { key: 'debit', label: 'Debit', num: true, render: (r) => peso(r.debit) }, { key: 'credit', label: 'Credit', num: true, render: (r) => peso(r.credit) }]} />
      {data && <div className="alert ok">Totals · Debit {peso(data.totals.debit)} · Credit {peso(data.totals.credit)} · {data.totals.debit === data.totals.credit ? 'balanced' : 'OUT OF BALANCE'}</div>}
    </div>
  );
}

function Periods({ canEdit }: { canEdit: boolean }) {
  const { data, reload } = useLoad(() => get('/api/accounting/periods'), []);
  const { run, busy } = useAction();
  return (
    <DataTable rows={data?.periods} rowKey="period" cols={[
      { key: 'period', label: 'Period' }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }, { key: 'closed_at', label: 'Closed', render: (r) => fmtDateTime(r.closed_at) }, { key: 'reopened_at', label: 'Reopened', render: (r) => fmtDateTime(r.reopened_at) },
      { key: 'act', label: '', render: (r) => !canEdit ? null : r.status === 'open'
        ? <button className="btn sm" disabled={busy} onClick={async () => { if (window.confirm(`Close ${r.period}?`) && (await run(() => post(`/api/accounting/periods/${r.period}/close`), 'Period closed'))) reload(); }}>Close</button>
        : <button className="btn sm" disabled={busy} onClick={async () => { const reason = window.prompt('Reason to reopen'); if (reason && (await run(() => post(`/api/accounting/periods/${r.period}/reopen`, { reason }), 'Period reopened'))) reload(); }}>Reopen</button> },
    ]} />
  );
}
