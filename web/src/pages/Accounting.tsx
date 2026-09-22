import { useState, type FormEvent } from 'react';
import { get, post, peso, fmtDate, fmtDateTime, todayIso } from '../api';
import { useAuth } from '../auth';
import { DataTable, Field, PageHead, Pill, Tabs, useAction, useLoad } from '../components/ui';

export function AccountingPage() {
  const { has } = useAuth();
  const canEdit = has('ADA');
  const [tab, setTab] = useState('disbursements');
  return (
    <>
      <PageHead code="ADA" title="Accounting & Disbursement" sub="FRBS general ledger (system and manual journals under TL posting, periods, year-end close), remittance schedules, disbursement chain (maker → reviewer → Finance Head → payment), refund requests and ACSL statement reconciliation." />
      <Tabs tabs={[{ key: 'disbursements', label: 'Disbursements' }, { key: 'remittances', label: 'Remittances' }, { key: 'refunds', label: 'Refund requests' }, { key: 'journals', label: 'Journals' }, { key: 'trial', label: 'Trial balance' }, { key: 'periods', label: 'Periods & year-end' }, { key: 'soa', label: 'ACSL / SOA recon' }]} active={tab} onChange={setTab} />
      {tab === 'disbursements' && <Disbursements canEdit={canEdit} />}
      {tab === 'remittances' && <Remittances canEdit={canEdit} />}
      {tab === 'refunds' && <Refunds />}
      {tab === 'journals' && <Journals canEdit={canEdit} />}
      {tab === 'trial' && <TrialBalance />}
      {tab === 'periods' && <Periods canEdit={canEdit} />}
      {tab === 'soa' && <SoaRecon canEdit={canEdit} />}
    </>
  );
}

function Disbursements({ canEdit }: { canEdit: boolean }) {
  const { user } = useAuth();
  const list = useLoad(() => get('/api/disbursements'), []);
  const { run, busy } = useAction();
  const [form, setForm] = useState({ type: 'supplier', payeeName: '', amount: '', mode: 'cheque', bankDetails: '' });
  const act = async (path: string, body: unknown, msg: string) => { if (await run(() => post(path, body), msg)) list.reload(); };
  return (
    <div className="stack">
      {canEdit && (
        <form className="card" onSubmit={async (e) => { e.preventDefault(); if (await run(() => post('/api/disbursements', { ...form, amount: Number(form.amount) }), 'Disbursement requested')) { setForm({ ...form, payeeName: '', amount: '' }); list.reload(); } }}>
          <h2>Other disbursement request (supplier, reimbursement, cash advance)</h2>
          <div className="form-grid">
            <Field label="Type"><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{['supplier', 'reimbursement', 'cash_advance', 'other'].map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}</select></Field>
            <Field label="Payee"><input value={form.payeeName} onChange={(e) => setForm({ ...form, payeeName: e.target.value })} required /></Field>
            <Field label="Amount (₱)"><input type="number" min={0.01} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></Field>
            <Field label="Mode"><select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>{['cheque', 'credit_to_account', 'online_banking', 'managers_cheque'].map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}</select></Field>
            <Field label="Bank details"><input value={form.bankDetails} onChange={(e) => setForm({ ...form, bankDetails: e.target.value })} /></Field>
          </div>
          <div className="row end" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} type="submit">Request</button></div>
        </form>
      )}
      <DataTable rows={list.data?.disbursements} cols={[
        { key: 'voucher_no', label: 'Voucher' }, { key: 'type', label: 'Type', render: (r) => <Pill value={r.type} /> }, { key: 'payee_name', label: 'Payee' }, { key: 'amount', label: 'Amount', num: true, render: (r) => peso(r.amount) }, { key: 'mode', label: 'Mode', render: (r) => String(r.mode).replaceAll('_', ' ') },
        { key: 'requested_by_name', label: 'Maker' }, { key: 'reviewed_by_name', label: 'Reviewer', render: (r) => r.reviewed_by_name ?? '—' }, { key: 'approved_by_name', label: 'Approver', render: (r) => r.approved_by_name ?? '—' }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }, { key: 'paid_at', label: 'Paid', render: (r) => fmtDateTime(r.paid_at) },
        { key: 'act', label: '', render: (r) => !canEdit ? null : (
          <span className="row">
            {r.status === 'pending_review' && r.requested_by !== user?.id && <><button className="btn sm" disabled={busy} onClick={() => act(`/api/disbursements/${r.id}/review`, { ok: true }, 'Reviewed; sent to Finance Head')}>Review OK</button><button className="btn sm danger" disabled={busy} onClick={() => { const note = window.prompt('Rejection note'); if (note) act(`/api/disbursements/${r.id}/review`, { ok: false, note }, 'Rejected'); }}>Reject</button></>}
            {r.status === 'pending_review' && r.requested_by === user?.id && <span className="small muted">awaiting another reviewer</span>}
            {r.status === 'pending_approval' && <span className="small muted">awaiting Finance Head</span>}
            {r.status === 'approved' && <button className="btn sm green" disabled={busy} onClick={() => { const ref = window.prompt('Cheque / transaction reference'); if (ref) act(`/api/disbursements/${r.id}/pay`, { reference: ref }, 'Paid, posted and confirmation emailed'); }}>Pay</button>}
          </span>
        ) },
      ]} />
    </div>
  );
}

function Remittances({ canEdit }: { canEdit: boolean }) {
  const due = useLoad(() => get('/api/accounting/remittances/due'), []);
  const list = useLoad(() => get('/api/accounting/remittances'), []);
  const { run, busy } = useAction();
  const reloadAll = () => { due.reload(); list.reload(); };
  return (
    <div className="stack">
      <div className="card">
        <h2>Weekly remittance extract (applied payments, sanitised)</h2>
        <DataTable rows={due.data?.due} empty="Nothing due for remittance." rowKey="insurer_id" cols={[
          { key: 'insurer_name', label: 'Insurer' }, { key: 'policies', label: 'Policies', num: true }, { key: 'amount', label: 'Net amount', num: true, render: (r) => <b>{peso(r.amount)}</b> },
          { key: 'act', label: '', render: (r) => canEdit ? <button className="btn sm primary" disabled={busy} onClick={async () => { if (await run(() => post('/api/accounting/remittances', { insurerId: r.insurer_id, policyIds: r.policy_ids }), 'Remittance schedule extracted')) reloadAll(); }}>Extract schedule</button> : null },
        ]} />
      </div>
      <DataTable rows={list.data?.remittances} cols={[
        { key: 'voucher_no', label: 'Schedule' }, { key: 'insurer_name', label: 'Insurer' }, { key: 'amount', label: 'Amount', num: true, render: (r) => peso(r.amount) }, { key: 'policy_ids', label: 'Policies', num: true, render: (r) => r.policy_ids.length },
        { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }, { key: 'disbursement_status', label: 'Disbursement', render: (r) => r.disbursement_status ? <Pill value={r.disbursement_status} /> : '—' }, { key: 'cheque_no', label: 'Cheque', render: (r) => r.cheque_no ?? '—' }, { key: 'paid_at', label: 'Paid', render: (r) => fmtDateTime(r.paid_at) },
        { key: 'act', label: '', render: (r) => r.status === 'extracted' && canEdit ? <button className="btn sm" disabled={busy} onClick={async () => { if (await run(() => post(`/api/accounting/remittances/${r.id}/submit`), 'Submitted to Disbursement')) reloadAll(); }}>Submit to disbursement</button> : null },
      ]} />
    </div>
  );
}

function Refunds() {
  const { user, has } = useAuth();
  const list = useLoad(() => get('/api/refunds'), []);
  const { run, busy } = useAction();
  const act = async (path: string, body: unknown, msg: string) => { if (await run(() => post(path, body), msg)) list.reload(); };
  return (
    <DataTable rows={list.data?.refunds} empty="No refund requests." cols={[
      { key: 'rrf_no', label: 'RRF' }, { key: 'client_name', label: 'Client' }, { key: 'amount', label: 'Amount', num: true, render: (r) => peso(r.amount) }, { key: 'payment_mode', label: 'Mode', render: (r) => String(r.payment_mode).replaceAll('_', ' ') }, { key: 'reason', label: 'Reason', wrap: true },
      { key: 'requested_by_name', label: 'MAO' }, { key: 'reviewed_by_name', label: 'TL', render: (r) => r.reviewed_by_name ?? '—' }, { key: 'approved_by_name', label: 'UH', render: (r) => r.approved_by_name ?? '—' }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }, { key: 'voucher_no', label: 'Voucher', render: (r) => r.voucher_no ? `${r.voucher_no} (${r.disbursement_status})` : '—' },
      { key: 'act', label: '', render: (r) => <span className="row">
        {r.status === 'submitted' && r.requested_by !== user?.id && <button className="btn sm" disabled={busy} onClick={() => act(`/api/refunds/${r.id}/review`, { ok: true }, 'RRF reviewed')}>TL review OK</button>}
        {r.status === 'reviewed' && user?.canApprove && has('ADA', 'NB', 'CLXN') && <button className="btn sm green" disabled={busy} onClick={() => act(`/api/refunds/${r.id}/approve`, {}, 'Approved; disbursement request created')}>UH approve</button>}
      </span> },
    ]} />
  );
}

function JournalLinesEditor({ lines, accounts, onChange }: { lines: any[]; accounts: any[]; onChange: (l: any[]) => void }) {
  const set = (i: number, k: string, v: string) => onChange(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return (
    <table style={{ marginTop: 10 }}><thead><tr><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead><tbody>
      {lines.map((l, i) => (
        <tr key={l.key}>
          <td><select value={l.accountCode} onChange={(e) => set(i, 'accountCode', e.target.value)}><option value="">Select…</option>{accounts.map((a: any) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select></td>
          <td className="num"><input type="number" step="0.01" min={0} value={l.debit} onChange={(e) => set(i, 'debit', e.target.value)} style={{ width: 130, textAlign: 'right' }} /></td>
          <td className="num"><input type="number" step="0.01" min={0} value={l.credit} onChange={(e) => set(i, 'credit', e.target.value)} style={{ width: 130, textAlign: 'right' }} /></td>
        </tr>
      ))}
    </tbody></table>
  );
}
let lineKey = 0;
const newLine = () => ({ key: ++lineKey, accountCode: '', debit: '', credit: '' });
const totalsOf = (lines: any[]) => lines.reduce((t, l) => ({ d: t.d + Number(l.debit || 0), c: t.c + Number(l.credit || 0) }), { d: 0, c: 0 });

function Journals({ canEdit }: { canEdit: boolean }) {
  const [period, setPeriod] = useState('');
  const { data, reload } = useLoad(() => get(`/api/accounting/journals?period=${period}`), [period]);
  const accounts = useLoad(() => get('/api/accounting/accounts'), []);
  const { run, busy } = useAction();
  const [form, setForm] = useState({ entryDate: todayIso(), description: '', lines: [newLine(), newLine()] });
  const totals = totalsOf(form.lines);
  const balanced = Math.abs(totals.d - totals.c) < 0.005 && totals.d > 0;
  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = await run(() => post('/api/accounting/journals', { entryDate: form.entryDate, description: form.description, lines: form.lines.filter((l) => l.accountCode).map((l) => ({ accountCode: l.accountCode, debit: Number(l.debit || 0), credit: Number(l.credit || 0) })) }), 'Manual journal drafted; awaiting TL/Head posting');
    if (r) { setForm({ ...form, description: '', lines: [newLine(), newLine()] }); reload(); }
  }
  return (
    <div className="stack">
      {canEdit && (
        <form className="card" onSubmit={submit}>
          <h2>Manual journal entry (posted by TL/Head after review)</h2>
          <div className="form-grid">
            <Field label="Entry date"><input type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} required /></Field>
            <Field label="Description"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required minLength={3} /></Field>
          </div>
          <JournalLinesEditor lines={form.lines} accounts={accounts.data?.accounts ?? []} onChange={(lines) => setForm({ ...form, lines })} />
          <div className="row end" style={{ marginTop: 10 }}><button type="button" className="btn sm" onClick={() => setForm({ ...form, lines: [...form.lines, newLine()] })}>+ line</button><span className="mono">Dr {peso(totals.d)} · Cr {peso(totals.c)}</span>{!balanced && totals.d > 0 && <span className="pill bad">out of balance</span>}<button className="btn primary" disabled={busy || !balanced} type="submit">Submit for posting</button></div>
        </form>
      )}
      <div className="search"><input placeholder="Period (YYYY-MM)" value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
      <JournalTable journals={data?.journals} />
    </div>
  );
}

function JournalTable({ journals }: { journals: any[] | undefined }) {
  let body;
  if (!journals) body = <tr><td colSpan={7}><div className="empty">Loading…</div></td></tr>;
  else if (journals.length === 0) body = <tr><td colSpan={7}><div className="empty">No journals.</div></td></tr>;
  else body = journals.flatMap((j: any) => j.lines.map((l: any, i: number) => (
    <tr key={l.id}>{i === 0 && <><td rowSpan={j.lines.length}><span className="mono">{j.jv_no}</span></td><td rowSpan={j.lines.length}>{fmtDate(j.entry_date)}</td><td rowSpan={j.lines.length}>{j.period}</td><td rowSpan={j.lines.length} className="wrap">{j.description}</td></>}
      <td>{l.account_code} · {l.account_name}</td><td className="num">{Number(l.debit) ? peso(l.debit) : ''}</td><td className="num">{Number(l.credit) ? peso(l.credit) : ''}</td></tr>
  )));
  return <div className="tablewrap"><table><thead><tr><th>JV</th><th>Date</th><th>Period</th><th>Description</th><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead><tbody>{body}</tbody></table></div>;
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
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [acct, setAcct] = useState({ code: '', name: '', type: 'expense' });
  return (
    <div className="stack">
      <div className="grid cols-2">
        <div className="card">
          <h2>Year-end closing</h2>
          <p className="small muted">Closes nominal (income/expense) accounts to retained earnings; real accounts carry forward. All periods of the year must be closed first.</p>
          {canEdit && <div className="row"><input type="number" value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 110 }} /><button className="btn primary" disabled={busy} onClick={async () => { const r = await run(() => post(`/api/accounting/fiscal-years/${year}/close`)); if (r) { run(async () => r, `Year ${year} closed · net result ${peso(r.netResult)}`); reload(); } }}>Close fiscal year</button></div>}
          <DataTable rows={data?.fiscalYears} rowKey="year" empty="No years closed yet." cols={[{ key: 'year', label: 'Year' }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }, { key: 'closed_at', label: 'Closed', render: (r) => fmtDateTime(r.closed_at) }]} />
        </div>
        <div className="card">
          <h2>Chart of accounts</h2>
          {canEdit && <form className="row" onSubmit={async (e) => { e.preventDefault(); if (await run(() => post('/api/accounting/accounts', acct), 'GL account created')) setAcct({ code: '', name: '', type: 'expense' }); }}><input placeholder="Code" value={acct.code} onChange={(e) => setAcct({ ...acct, code: e.target.value })} required pattern="\d{4}" style={{ width: 80 }} className="mono" /><input placeholder="Name" value={acct.name} onChange={(e) => setAcct({ ...acct, name: e.target.value })} required /><select value={acct.type} onChange={(e) => setAcct({ ...acct, type: e.target.value })}>{['asset', 'liability', 'equity', 'income', 'expense'].map((t) => <option key={t}>{t}</option>)}</select><button className="btn sm primary" disabled={busy}>Add</button></form>}
        </div>
      </div>
      <DataTable rows={data?.periods} rowKey="period" cols={[
        { key: 'period', label: 'Period' }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }, { key: 'closed_at', label: 'Closed', render: (r) => fmtDateTime(r.closed_at) }, { key: 'reopened_at', label: 'Reopened', render: (r) => fmtDateTime(r.reopened_at) },
        { key: 'act', label: '', render: (r) => <PeriodAction row={r} canEdit={canEdit} onDone={reload} /> },
      ]} />
    </div>
  );
}

function PeriodAction({ row, canEdit, onDone }: { row: any; canEdit: boolean; onDone: () => void }) {
  const { run, busy } = useAction();
  if (!canEdit) return null;
  if (row.status === 'open') return <button className="btn sm" disabled={busy} onClick={async () => { if (window.confirm(`Close ${row.period}?`) && (await run(() => post(`/api/accounting/periods/${row.period}/close`), 'Period closed'))) onDone(); }}>Close</button>;
  return <button className="btn sm" disabled={busy} onClick={async () => { const reason = window.prompt('Reason to reopen'); if (reason && (await run(() => post(`/api/accounting/periods/${row.period}/reopen`, { reason }), 'Period reopened'))) onDone(); }}>Reopen</button>;
}

function SoaLines({ lines }: { lines: any[] }) {
  return <DataTable rows={lines} rowKey="policyNo" cols={[{ key: 'policyNo', label: 'Policy' }, { key: 'statementAmount', label: 'Statement', num: true, render: (r) => peso(r.statementAmount) }, { key: 'ledgerAmount', label: 'Ledger', num: true, render: (r) => peso(r.ledgerAmount) }, { key: 'variance', label: 'Variance', num: true, render: (r) => peso(r.variance) }, { key: 'known', label: 'Known', render: (r) => (r.known ? '✓' : 'unknown policy') }]} />;
}

function AdjustmentForm({ adj, setAdj, accounts, onDone }: { adj: { id: number; description: string; lines: any[] }; setAdj: (a: any) => void; accounts: any[]; onDone: () => void }) {
  const { run, busy } = useAction();
  const t = totalsOf(adj.lines);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const lines = adj.lines.filter((l) => l.accountCode).map((l) => ({ accountCode: l.accountCode, debit: Number(l.debit || 0), credit: Number(l.credit || 0) }));
    if (await run(() => post(`/api/accounting/soa-recons/${adj.id}/adjust`, { description: adj.description, lines }), 'Adjustment drafted for FRBS approver posting')) onDone();
  }
  return (
    <form className="card" onSubmit={submit}>
      <h2>Adjustment entries (routed to FRBS approver)</h2>
      <Field label="Description"><input value={adj.description} onChange={(e) => setAdj({ ...adj, description: e.target.value })} required minLength={5} /></Field>
      <JournalLinesEditor lines={adj.lines} accounts={accounts} onChange={(lines) => setAdj({ ...adj, lines })} />
      <div className="row end" style={{ marginTop: 10 }}><button type="button" className="btn sm" onClick={() => setAdj({ ...adj, lines: [...adj.lines, newLine()] })}>+ line</button><button type="button" className="btn" onClick={() => setAdj(null)}>Cancel</button><button className="btn primary" disabled={busy || Math.abs(t.d - t.c) > 0.004 || t.d === 0} type="submit">Route for posting</button></div>
    </form>
  );
}

function SoaRecon({ canEdit }: { canEdit: boolean }) {
  const list = useLoad(() => get('/api/accounting/soa-recons'), []);
  const insurers = useLoad(() => get('/api/insurers'), []);
  const accounts = useLoad(() => get('/api/accounting/accounts'), []);
  const { run, busy } = useAction();
  const [insurerId, setInsurerId] = useState('');
  const [text, setText] = useState('POL-2026-00001, 13781.25');
  const [result, setResult] = useState<any>(null);
  const [adj, setAdj] = useState<{ id: number; description: string; lines: any[] } | null>(null);
  async function reconcile() {
    const lines = text.split('\n').map((l) => l.split(',').map((s) => s.trim())).filter((p) => p[0]).map(([policyNo, amount]) => ({ policyNo, amount: Number(amount || 0) }));
    const r = await run(() => post('/api/accounting/soa-recons', { insurerId: Number(insurerId), lines }));
    if (r) { run(async () => r, `${r.reconNo}: ${r.status} (variance ${peso(r.variance)})`); setResult(r); list.reload(); }
  }
  return (
    <div className="stack">
      {canEdit && (
        <div className="card">
          <h2>Insurer statement of account vs ledger (ACSL)</h2>
          <div className="form-grid"><Field label="Insurer"><select value={insurerId} onChange={(e) => setInsurerId(e.target.value)}><option value="">Select…</option>{(insurers.data?.insurers ?? []).map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field></div>
          <Field label="SOA lines: policy no, amount"><textarea rows={4} className="mono" value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <div className="row end" style={{ marginTop: 10 }}><button className="btn primary" disabled={busy || !insurerId} onClick={reconcile}>Reconcile</button></div>
          {result && <SoaLines lines={result.lines} />}
        </div>
      )}
      <DataTable rows={list.data?.recons} cols={[{ key: 'recon_no', label: 'Recon' }, { key: 'insurer_name', label: 'Insurer' }, { key: 'statement_total', label: 'Statement', num: true, render: (r) => peso(r.statement_total) }, { key: 'ledger_total', label: 'Ledger', num: true, render: (r) => peso(r.ledger_total) }, { key: 'variance', label: 'Variance', num: true, render: (r) => peso(r.variance) }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }, { key: 'created_at', label: 'Run', render: (r) => fmtDateTime(r.created_at) },
        { key: 'act', label: '', render: (r) => canEdit && r.status === 'discrepancy' ? <button className="btn sm" onClick={() => setAdj({ id: r.id, description: '', lines: [newLine(), newLine()] })}>Manual SL adjustment</button> : null }]} />
      {adj && <AdjustmentForm adj={adj} setAdj={setAdj} accounts={accounts.data?.accounts ?? []} onDone={() => { setAdj(null); list.reload(); }} />}
    </div>
  );
}
