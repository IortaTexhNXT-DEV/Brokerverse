import { useState, type FormEvent } from 'react';
import { get, post, peso, fmtDate, fmtDateTime, todayIso } from '../api';
import { useAuth } from '../auth';
import { DataTable, Field, Kpi, PageHead, Pill, Tabs, useAction, useLoad } from '../components/ui';

export function OperationsPage() {
  const { has } = useAuth();
  const [tab, setTab] = useState('cashiering');
  const [q, setQ] = useState('');
  const invoices = useLoad(() => get(`/api/operations/invoices?q=${encodeURIComponent(q)}`), [q, tab]);
  const receipts = useLoad(() => get('/api/operations/receipts'), [tab]);
  const { run, busy } = useAction();
  const [sel, setSel] = useState<any>(null);
  const [form, setForm] = useState({ amount: '', method: 'cash', reference: '', receivedAt: todayIso() });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = await run(() => post('/api/operations/receipts', { invoiceId: sel.id, amount: Number(form.amount), method: form.method, reference: form.reference || undefined, receivedAt: form.receivedAt }));
    if (r) { run(async () => r, `Official receipt ${r.receiptNo} issued · ${r.jvNo} posted`); setSel(null); setForm({ ...form, amount: '', reference: '' }); invoices.reload(); receipts.reload(); }
  }

  return (
    <>
      <PageHead code="OPS" title="Operations – Cashiering" sub="Receive premium against invoices and issue official receipts. Each receipt posts Dr Cash / Cr Premium Receivable." />
      <Tabs tabs={[{ key: 'cashiering', label: 'Invoices' }, { key: 'receipts', label: 'Receipts' }]} active={tab} onChange={setTab} />
      {tab === 'cashiering' && (
        <div className="stack">
          <div className="search"><input placeholder="Search invoice, policy or client…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {sel && has('OPS') && (
            <form className="card" onSubmit={submit}>
              <h2>Receipt for {sel.invoice_no} · {sel.client_name} · balance {peso(sel.balance)}</h2>
              <div className="form-grid">
                <Field label="Amount (₱)"><input type="number" min={0.01} step="0.01" max={sel.balance} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></Field>
                <Field label="Method"><select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="transfer">Bank transfer</option><option value="card">Card</option></select></Field>
                <Field label="Reference"><input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Cheque / transfer ref" /></Field>
                <Field label="Received on"><input type="date" value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} /></Field>
              </div>
              <div className="row end" style={{ marginTop: 12 }}><button type="button" className="btn" onClick={() => setSel(null)}>Cancel</button><button className="btn sm" type="button" onClick={() => setForm({ ...form, amount: String(sel.balance) })}>Full balance</button><button className="btn primary" disabled={busy} type="submit">Issue receipt</button></div>
            </form>
          )}
          <DataTable rows={invoices.data?.invoices} cols={[
            { key: 'invoice_no', label: 'Invoice' }, { key: 'policy_no', label: 'Policy' }, { key: 'client_name', label: 'Client' }, { key: 'due_date', label: 'Due', render: (r) => fmtDate(r.due_date) },
            { key: 'amount', label: 'Amount', num: true, render: (r) => peso(r.amount) }, { key: 'paid_amount', label: 'Paid', num: true, render: (r) => peso(r.paid_amount) }, { key: 'balance', label: 'Balance', num: true, render: (r) => <b>{peso(r.balance)}</b> },
            { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> },
            { key: 'act', label: '', render: (r) => r.status !== 'paid' && has('OPS') ? <button className="btn sm primary" onClick={() => { setSel(r); setForm({ ...form, amount: String(r.balance) }); }}>Receive</button> : null },
          ]} />
        </div>
      )}
      {tab === 'receipts' && (
        <DataTable rows={receipts.data?.receipts} cols={[
          { key: 'receipt_no', label: 'OR no.' }, { key: 'invoice_no', label: 'Invoice' }, { key: 'client_name', label: 'Client' }, { key: 'amount', label: 'Amount', num: true, render: (r) => peso(r.amount) },
          { key: 'method', label: 'Method' }, { key: 'reference', label: 'Reference' }, { key: 'received_at', label: 'Received', render: (r) => fmtDate(r.received_at) }, { key: 'received_by_name', label: 'Cashier' }, { key: 'created_at', label: 'Posted', render: (r) => fmtDateTime(r.created_at) },
        ]} />
      )}
    </>
  );
}

export function CollectionsPage() {
  const { has } = useAuth();
  const [q, setQ] = useState('');
  const { data, reload } = useLoad(() => get(`/api/collections/outstanding?q=${encodeURIComponent(q)}`), [q]);
  const [soa, setSoa] = useState<any>(null);
  const { run, busy } = useAction();
  const b = data?.buckets ?? {};
  return (
    <>
      <PageHead code="CLXN" title="Collections" sub="Premium receivable outstanding, aged from invoice due date, with reminders and statements of account." />
      {data && (
        <div className="grid cols-4" style={{ marginBottom: 16 }}>
          <Kpi n={peso(data.total)} label="Total outstanding" tone="warn" />
          <Kpi n={peso(b.current)} label="Not yet due" tone="green" />
          <Kpi n={peso((b['0-30'] ?? 0) + (b['31-60'] ?? 0))} label="1–60 days overdue" />
          <Kpi n={peso((b['61-90'] ?? 0) + (b['91-180'] ?? 0) + (b['180+'] ?? 0))} label="Over 60 days overdue" tone="navy" />
        </div>
      )}
      <div className="search" style={{ marginBottom: 12 }}><input placeholder="Search client or policy…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <DataTable rows={data?.invoices} empty="No outstanding premium. 🎉" cols={[
        { key: 'invoice_no', label: 'Invoice' }, { key: 'policy_no', label: 'Policy' }, { key: 'client_name', label: 'Client' }, { key: 'due_date', label: 'Due', render: (r) => fmtDate(r.due_date) },
        { key: 'bucket', label: 'Ageing', render: (r) => <Pill value={r.bucket} /> }, { key: 'balance', label: 'Balance', num: true, render: (r) => <b>{peso(r.balance)}</b> },
        { key: 'act', label: '', render: (r) => <span className="row">
          <button className="btn sm" onClick={async () => setSoa(await get(`/api/collections/statement/${r.client_id}`))}>Statement</button>
          {has('CLXN') && <button className="btn sm" disabled={busy} onClick={async () => { if (await run(() => post(`/api/collections/reminders/${r.id}`), 'Reminder emailed')) reload(); }}>Remind</button>}
        </span> },
      ]} />
      {soa && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}><h2>Statement of account · {soa.client.name}</h2><button className="btn sm" onClick={() => setSoa(null)}>Close</button></div>
          <p className="muted small">Balance due: <b>{peso(soa.balance)}</b></p>
          <DataTable rows={soa.invoices} cols={[{ key: 'invoice_no', label: 'Invoice' }, { key: 'policy_no', label: 'Policy' }, { key: 'amount', label: 'Billed', num: true, render: (r) => peso(r.amount) }, { key: 'paid_amount', label: 'Paid', num: true, render: (r) => peso(r.paid_amount) }, { key: 'balance', label: 'Balance', num: true, render: (r) => peso(r.balance) }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }]} />
          <h3 style={{ margin: '14px 0 8px', fontSize: 14 }}>Receipts</h3>
          <DataTable rows={soa.receipts} empty="No receipts." cols={[{ key: 'receipt_no', label: 'OR' }, { key: 'invoice_no', label: 'Invoice' }, { key: 'amount', label: 'Amount', num: true, render: (r) => peso(r.amount) }, { key: 'method', label: 'Method' }, { key: 'received_at', label: 'Received', render: (r) => fmtDate(r.received_at) }]} />
        </div>
      )}
    </>
  );
}
