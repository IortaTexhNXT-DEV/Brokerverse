import { useState, type FormEvent } from 'react';
import { get, post, peso, fmtDate, fmtDateTime, todayIso } from '../api';
import { useAuth } from '../auth';
import { DataTable, Field, PageHead, Pill, Tabs, useAction, useLoad } from '../components/ui';

const CHANNELS = [['otc_cash', 'Over-the-counter cash'], ['otc_cheque', 'Over-the-counter cheque (PDC hold 4 days)'], ['bills_payment', 'Bills payment file'], ['clpc_file', 'CLPC file'], ['trade_file', 'Trade file'], ['direct_credit', 'Direct credit'], ['autopay', 'Autopay']];

function paymentMessage(r: any): string {
  if (r.status === 'held') return `Cheque held until ${r.holdUntil} (PDC monitoring)`;
  if (!r.receiptNo) return `Payment ${r.paymentNo} recorded as ${r.status}`;
  const upp = r.unapplied ? ` · ₱${r.unapplied} unapplied` : '';
  return `Official receipt ${r.receiptNo} issued${upp}`;
}

function chequeCell(r: any): string {
  if (!r.cheque_no) return '—';
  const hold = r.hold_until ? ` (hold to ${fmtDate(r.hold_until)})` : '';
  return `${r.cheque_no}${hold}`;
}

function PaymentForm({ invoice, onDone, onCancel }: { invoice: any | null; onDone: () => void; onCancel: () => void }) {
  const { run, busy } = useAction();
  const [form, setForm] = useState({ amount: invoice ? String(invoice.balance) : '', channel: 'otc_cash', reference: '', chequeNo: '', chequeDate: todayIso(), receivedAt: todayIso(), clientId: '' });
  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = { invoiceId: invoice?.id, clientId: form.clientId ? Number(form.clientId) : undefined, amount: Number(form.amount), channel: form.channel, reference: form.reference || undefined, chequeNo: form.chequeNo || undefined, chequeDate: form.channel === 'otc_cheque' ? form.chequeDate : undefined, receivedAt: form.receivedAt };
    const r = await run(() => post('/api/operations/payments', body));
    if (!r) return;
    run(async () => r, paymentMessage(r)); onDone();
  }
  return (
    <form className="card" onSubmit={submit}>
      <h2>{invoice ? `Receive payment for ${invoice.invoice_no} · ${invoice.client_name} · balance ${peso(invoice.balance)}` : 'Record payment without invoice match (goes to unapplied)'}</h2>
      <div className="form-grid">
        <Field label="Channel"><select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>{CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Amount (₱)"><input type="number" min={0.01} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></Field>
        {form.channel === 'otc_cheque' && <><Field label="Cheque no."><input value={form.chequeNo} onChange={(e) => setForm({ ...form, chequeNo: e.target.value })} required /></Field><Field label="Cheque date"><input type="date" value={form.chequeDate} onChange={(e) => setForm({ ...form, chequeDate: e.target.value })} /></Field></>}
        <Field label="Reference"><input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Transaction / file ref" /></Field>
        <Field label="Received on"><input type="date" value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} /></Field>
        {!invoice && <Field label="Client id (optional)"><input type="number" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} /></Field>}
      </div>
      <div className="row end" style={{ marginTop: 12 }}><button type="button" className="btn" onClick={onCancel}>Cancel</button><button className="btn primary" disabled={busy} type="submit">Record payment</button></div>
    </form>
  );
}

function InvoicesTab({ canEdit }: { canEdit: boolean }) {
  const [q, setQ] = useState('');
  const invoices = useLoad(() => get(`/api/operations/invoices?q=${encodeURIComponent(q)}`), [q]);
  const [sel, setSel] = useState<any | null | 'free'>(null);
  return (
    <div className="stack">
      <div className="row"><div className="search"><input placeholder="Search invoice, policy or client…" value={q} onChange={(e) => setQ(e.target.value)} /></div>{canEdit && <button className="btn" onClick={() => setSel('free')}>Payment without invoice</button>}</div>
      {sel && canEdit && <PaymentForm invoice={sel === 'free' ? null : sel} onDone={() => { setSel(null); invoices.reload(); }} onCancel={() => setSel(null)} />}
      <DataTable rows={invoices.data?.invoices} cols={[
        { key: 'invoice_no', label: 'Invoice' }, { key: 'policy_no', label: 'Policy' }, { key: 'client_name', label: 'Client' }, { key: 'due_date', label: 'Due', render: (r) => fmtDate(r.due_date) },
        { key: 'amount', label: 'Amount', num: true, render: (r) => peso(r.amount) }, { key: 'paid_amount', label: 'Paid', num: true, render: (r) => peso(r.paid_amount) }, { key: 'balance', label: 'Balance', num: true, render: (r) => <b>{peso(r.balance)}</b> },
        { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> },
        { key: 'act', label: '', render: (r) => (r.status !== 'paid' && canEdit ? <button className="btn sm primary" onClick={() => setSel(r)}>Receive</button> : null) },
      ]} />
    </div>
  );
}

function PaymentsTab({ canEdit }: { canEdit: boolean }) {
  const [status, setStatus] = useState('');
  const payments = useLoad(() => get(`/api/operations/payments?status=${status}`), [status]);
  const { run, busy } = useAction();
  const act = async (path: string, body: unknown, msg: string) => { if (await run(() => post(path, body), msg)) payments.reload(); };
  return (
    <div className="stack">
      <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 240 }}><option value="">All payments</option>{['held', 'matured', 'bounced', 'applied', 'unapplied', 'zero_pr', 'excluded'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
      <DataTable rows={payments.data?.payments} cols={[
        { key: 'payment_no', label: 'Payment' }, { key: 'channel', label: 'Channel', render: (r) => <Pill value={r.channel} /> }, { key: 'client_name', label: 'Client', render: (r) => r.client_name ?? '—' }, { key: 'invoice_no', label: 'Invoice', render: (r) => r.invoice_no ?? '—' },
        { key: 'amount', label: 'Amount', num: true, render: (r) => peso(r.amount) }, { key: 'applied_amount', label: 'Applied', num: true, render: (r) => peso(r.applied_amount) }, { key: 'unapplied_amount', label: 'Unapplied', num: true, render: (r) => peso(r.unapplied_amount) },
        { key: 'cheque_no', label: 'Cheque', render: chequeCell }, { key: 'receipt_no', label: 'OR', render: (r) => r.receipt_no ?? '—' },
        { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }, { key: 'exclusion_reason', label: 'Tag', wrap: true, render: (r) => r.exclusion_reason ?? '' },
        { key: 'act', label: '', render: (r) => !canEdit ? null : (
          <span className="row">
            {r.status === 'held' && <><button className="btn sm green" disabled={busy} onClick={() => act(`/api/operations/payments/${r.id}/mature`, {}, 'Cheque matured and applied')}>Matured</button><button className="btn sm danger" disabled={busy} onClick={() => { const reason = window.prompt('Bounce reason'); if (reason) act(`/api/operations/payments/${r.id}/bounce`, { reason }, 'Tagged as bounced cheque'); }}>Bounced</button></>}
            {['unapplied', 'zero_pr'].includes(r.status) && Number(r.unapplied_amount) > 0 && <button className="btn sm primary" disabled={busy} onClick={() => { const inv = window.prompt('Apply to invoice id'); if (inv) act(`/api/operations/payments/${r.id}/apply`, { invoiceId: Number(inv) }, 'Unapplied premium applied'); }}>Apply to invoice</button>}
          </span>
        ) },
      ]} />
    </div>
  );
}

function DirectPaymentsTab({ canEdit }: { canEdit: boolean }) {
  const items = useLoad(() => get('/api/operations/direct-payments'), []);
  const { run, busy } = useAction();
  const [policyNo, setPolicyNo] = useState('');
  const next: Record<string, [string, string]> = { identified: ['billed', 'Bill insurer'], billed: ['approved', 'Insurer approved'], rejected: ['billed', 'Re-bill'], approved: ['collected', 'Collect (commission OR)'] };
  return (
    <div className="stack">
      {canEdit && (
        <form className="card row" onSubmit={async (e) => { e.preventDefault(); if (await run(() => post('/api/operations/direct-payments', { policyNo }), 'Direct payment identified; commission receivable booked')) { setPolicyNo(''); items.reload(); } }}>
          <input placeholder="Policy no. paid directly to insurer" value={policyNo} onChange={(e) => setPolicyNo(e.target.value)} required style={{ minWidth: 280 }} />
          <button className="btn primary" disabled={busy}>Identify direct payment</button>
        </form>
      )}
      <DataTable rows={items.data?.items} cols={[
        { key: 'dp_no', label: 'DP' }, { key: 'policy_no', label: 'Policy' }, { key: 'client_name', label: 'Client' }, { key: 'insurer_name', label: 'Insurer' }, { key: 'amount', label: 'Commission', num: true, render: (r) => peso(r.amount) },
        { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }, { key: 'receipt_no', label: 'Comm. OR', render: (r) => r.receipt_no ?? '—' }, { key: 'billed_at', label: 'Billed', render: (r) => fmtDateTime(r.billed_at) },
        { key: 'act', label: '', render: (r) => canEdit && next[r.status] ? <span className="row"><button className="btn sm" disabled={busy} onClick={async () => { if (await run(() => post(`/api/operations/direct-payments/${r.id}/transition`, { to: next[r.status][0] }), 'Updated')) items.reload(); }}>{next[r.status][1]}</button>{r.status === 'billed' && <button className="btn sm danger" disabled={busy} onClick={async () => { if (await run(() => post(`/api/operations/direct-payments/${r.id}/transition`, { to: 'rejected' }), 'Rejected')) items.reload(); }}>Rejected</button>}</span> : null },
      ]} />
    </div>
  );
}

function EndorsementsTab({ canEdit }: { canEdit: boolean }) {
  const list = useLoad(() => get('/api/operations/endorsements'), []);
  const { run, busy } = useAction();
  const [form, setForm] = useState({ policyNo: '', type: 'adjustment', description: '', premiumDelta: '0', refundAmount: '0' });
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await run(() => post('/api/operations/endorsements', { ...form, premiumDelta: Number(form.premiumDelta), refundAmount: Number(form.refundAmount) }), 'Endorsement sent to checker for posting')) { setForm({ ...form, policyNo: '', description: '' }); list.reload(); }
  }
  return (
    <div className="stack">
      {canEdit && (
        <form className="card" onSubmit={submit}>
          <h2>Adjustment / cancellation (checker-poster)</h2>
          <div className="form-grid">
            <Field label="Policy no."><input value={form.policyNo} onChange={(e) => setForm({ ...form, policyNo: e.target.value })} required /></Field>
            <Field label="Type"><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="adjustment">Adjustment</option><option value="cancellation">Cancellation</option></select></Field>
            <Field label="Premium delta (₱)"><input type="number" step="0.01" value={form.premiumDelta} onChange={(e) => setForm({ ...form, premiumDelta: e.target.value })} /></Field>
            <Field label="Refund to client (₱)"><input type="number" min={0} step="0.01" value={form.refundAmount} onChange={(e) => setForm({ ...form, refundAmount: e.target.value })} /></Field>
            <Field label="Description"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} minLength={5} required /></Field>
          </div>
          <div className="row end" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} type="submit">Submit for posting</button></div>
        </form>
      )}
      <DataTable rows={list.data?.endorsements} cols={[{ key: 'endorsement_no', label: 'No.' }, { key: 'policy_no', label: 'Policy' }, { key: 'client_name', label: 'Client' }, { key: 'type', label: 'Type' }, { key: 'description', label: 'Description', wrap: true }, { key: 'premium_delta', label: 'Δ premium', num: true, render: (r) => peso(r.premium_delta) }, { key: 'refund_amount', label: 'Refund', num: true, render: (r) => peso(r.refund_amount) }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }, { key: 'posted_at', label: 'Posted', render: (r) => fmtDateTime(r.posted_at) }]} />
    </div>
  );
}

function ProductionReconTab({ canEdit }: { canEdit: boolean }) {
  const recons = useLoad(() => get('/api/operations/production-recons'), []);
  const insurers = useLoad(() => get('/api/insurers'), []);
  const { run, busy } = useAction();
  const [insurerId, setInsurerId] = useState('');
  const [period, setPeriod] = useState(todayIso().slice(0, 7));
  const [text, setText] = useState('POL-2026-00001, 12500, INS-REF-1\nPOL-1999-00001, 100');
  const [sel, setSel] = useState<any>(null);
  async function upload() {
    const rows = text.split('\n').map((l) => l.split(',').map((s) => s.trim())).filter((p) => p[0]).map(([policyNo, premium, insurerRef]) => ({ policyNo, premium: premium ? Number(premium) : null, insurerRef }));
    const r = await run(() => post('/api/operations/production-recons', { insurerId: Number(insurerId), period, rows }));
    if (r) { run(async () => r, `${r.reconNo}: ${r.matched} matched · ${r.discrepancy} discrepancies · ${r.unbooked} unbooked`); recons.reload(); setSel(await get(`/api/operations/production-recons/${r.id}`)); }
  }
  return (
    <div className="stack">
      {canEdit && (
        <div className="card">
          <h2>Insurer production register feedback (monthly)</h2>
          <div className="form-grid">
            <Field label="Insurer"><select value={insurerId} onChange={(e) => setInsurerId(e.target.value)} required><option value="">Select…</option>{(insurers.data?.insurers ?? []).map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
            <Field label="Booking period (YYYY-MM)"><input value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
          </div>
          <Field label="Rows: policy no, premium, insurer ref"><textarea rows={4} className="mono" value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <div className="row end" style={{ marginTop: 10 }}><button className="btn primary" disabled={busy || !insurerId} onClick={upload}>Match &amp; classify</button></div>
        </div>
      )}
      <DataTable rows={recons.data?.recons} onRow={async (r) => setSel(await get(`/api/operations/production-recons/${r.id}`))} cols={[{ key: 'recon_no', label: 'Recon' }, { key: 'insurer_name', label: 'Insurer' }, { key: 'period', label: 'Period' }, { key: 'total_rows', label: 'Rows', num: true }, { key: 'matched', label: 'Matched', num: true }, { key: 'discrepancy', label: 'Discrepancies', num: true }, { key: 'unbooked', label: 'Unbooked', num: true }, { key: 'created_at', label: 'Run', render: (r) => fmtDateTime(r.created_at) }]} />
      {sel && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}><h2>{sel.recon.recon_no} · {sel.recon.insurer_name}</h2><button className="btn sm" onClick={() => setSel(null)}>Close</button></div>
          <DataTable rows={sel.rows} cols={[{ key: 'policy_no_raw', label: 'Policy (insurer)' }, { key: 'premium_raw', label: 'Premium', num: true, render: (r) => (r.premium_raw === null ? '—' : peso(r.premium_raw)) }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }, { key: 'variance', label: 'Variance', num: true, render: (r) => (r.variance === null ? '—' : peso(r.variance)) }, { key: 'disposition', label: 'Disposition', wrap: true, render: (r) => r.disposition ?? '—' },
            { key: 'act', label: '', render: (r) => canEdit && r.status !== 'matched' ? <button className="btn sm" disabled={busy} onClick={async () => { const d = window.prompt('Disposition'); if (d && (await run(() => post(`/api/operations/production-recons/${sel.recon.id}/rows/${r.id}/disposition`, { disposition: d }), 'Saved'))) setSel(await get(`/api/operations/production-recons/${sel.recon.id}`)); }}>Disposition</button> : null }]} />
        </div>
      )}
    </div>
  );
}

export function OperationsPage() {
  const { has } = useAuth();
  const canEdit = has('OPS');
  const [tab, setTab] = useState('invoices');
  return (
    <>
      <PageHead code="OPS" title="Operations" sub="Cashiering across payment channels with PDC monitoring and unapplied premium, direct-payment commission receivables, adjustment/cancellation endorsements under checker-poster, and monthly production reconciliation with insurers." />
      <Tabs tabs={[{ key: 'invoices', label: 'Invoices & cashiering' }, { key: 'payments', label: 'Payments / PDC / UPP' }, { key: 'direct', label: 'Direct payments' }, { key: 'endorsements', label: 'Adjustments' }, { key: 'recon', label: 'Production recon' }]} active={tab} onChange={setTab} />
      {tab === 'invoices' && <InvoicesTab canEdit={canEdit} />}
      {tab === 'payments' && <PaymentsTab canEdit={canEdit} />}
      {tab === 'direct' && <DirectPaymentsTab canEdit={has('OPS', 'CLXN')} />}
      {tab === 'endorsements' && <EndorsementsTab canEdit={canEdit} />}
      {tab === 'recon' && <ProductionReconTab canEdit={canEdit} />}
    </>
  );
}
