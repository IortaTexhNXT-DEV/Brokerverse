import { useState, type FormEvent } from 'react';
import { get, post, peso, fmtDate, fmtDateTime, todayIso } from '../api';
import { useAuth } from '../auth';
import { DataTable, Field, Kpi, PageHead, Pill, useAction, useLoad } from '../components/ui';

function EffortForm({ invoice, onDone }: { invoice: any; onDone: () => void }) {
  const { run, busy } = useAction();
  const [form, setForm] = useState({ mode: 'call', category: 'for_followup', commitmentDate: todayIso(), paymentArrangement: '', contactPerson: '', contactDetails: '', remarks: '' });
  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = await run(() => post('/api/collections/efforts', { invoiceId: invoice.id, ...form, commitmentDate: form.category === 'committed' ? form.commitmentDate : undefined }));
    if (r) { run(async () => r, r.beyondCreditTerm ? 'Effort logged · commitment is beyond the credit term, marketing AO informed' : 'Effort logged'); onDone(); }
  }
  return (
    <form className="card" onSubmit={submit}>
      <h2>Marketing diary · {invoice.invoice_no} · {invoice.client_name}</h2>
      <div className="form-grid">
        <Field label="Mode"><select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>{['call', 'email', 'visit', 'sms', 'messaging'].map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Category"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{['for_followup', 'committed', 'disputed', 'paid', 'for_cte', 'uncontactable'].map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}</select></Field>
        {form.category === 'committed' && <Field label="Commitment date"><input type="date" value={form.commitmentDate} onChange={(e) => setForm({ ...form, commitmentDate: e.target.value })} /></Field>}
        <Field label="Payment arrangement"><input value={form.paymentArrangement} onChange={(e) => setForm({ ...form, paymentArrangement: e.target.value })} placeholder="Deposit / bills payment / direct" /></Field>
        <Field label="Contact person"><input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></Field>
        <Field label="Contact details"><input value={form.contactDetails} onChange={(e) => setForm({ ...form, contactDetails: e.target.value })} /></Field>
        <Field label="Remarks"><input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></Field>
      </div>
      <div className="row end" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} type="submit">Log effort</button></div>
    </form>
  );
}

function lastEffortOf(r: any): string {
  if (!r.last_category) return '—';
  const when = r.commitment_date ? ` · ${fmtDate(r.commitment_date)}` : '';
  return `${String(r.last_category).replace('_', ' ')}${when}`;
}

function RowActions({ r, canEdit, onSoa, onDiary, onEffort, onDone }: { r: any; canEdit: boolean; onSoa: () => void; onDiary: () => void; onEffort: () => void; onDone: () => void }) {
  const { run, busy } = useAction();
  const requestCte = async () => {
    const days = window.prompt('Extension days'); const reason = days ? window.prompt('Reason') : null;
    if (days && reason && (await run(() => post('/api/collections/cte', { invoiceId: r.id, requestedDays: Number(days), reason }), 'CTE requested; awaiting unit head approval'))) onDone();
  };
  return (
    <span className="row">
      <button className="btn sm" onClick={onSoa}>SOA</button>
      <button className="btn sm" onClick={onDiary}>Diary</button>
      {canEdit && <><button className="btn sm primary" onClick={onEffort}>Log effort</button><button className="btn sm" disabled={busy} onClick={async () => { if (await run(() => post(`/api/collections/reminders/${r.id}`), 'Reminder emailed')) onDone(); }}>Remind</button><button className="btn sm" disabled={busy} onClick={requestCte}>CTE</button></>}
    </span>
  );
}

function AgeingKpis({ total, b }: { total: number; b: Record<string, number> }) {
  return (
    <div className="grid cols-4" style={{ marginBottom: 16 }}>
      <Kpi n={peso(total)} label="Total outstanding" tone="warn" />
      <Kpi n={peso(b.current)} label="Not yet due" tone="green" />
      <Kpi n={peso((b['0-30'] ?? 0) + (b['31-60'] ?? 0))} label="1–60 days overdue" />
      <Kpi n={peso((b['61-90'] ?? 0) + (b['91-180'] ?? 0) + (b['180+'] ?? 0))} label="Over 60 days overdue" tone="navy" />
    </div>
  );
}

function DiaryCard({ efforts, onClose }: { efforts: any; onClose: () => void }) {
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}><h2>Diary · {efforts.inv.invoice_no}</h2><button className="btn sm" onClick={onClose}>Close</button></div>
      <DataTable rows={efforts.list} empty="No efforts logged." cols={[{ key: 'effort_at', label: 'When', render: (r) => fmtDateTime(r.effort_at) }, { key: 'mode', label: 'Mode' }, { key: 'category', label: 'Category', render: (r) => <Pill value={r.category} /> }, { key: 'commitment_date', label: 'Commitment', render: (r) => fmtDate(r.commitment_date) }, { key: 'payment_arrangement', label: 'Arrangement' }, { key: 'contact_person', label: 'Contact' }, { key: 'remarks', label: 'Remarks', wrap: true }, { key: 'by_name', label: 'By' }]} />
    </div>
  );
}

function SoaCard({ soa, onClose }: { soa: any; onClose: () => void }) {
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}><h2>Statement of account · {soa.client.name}</h2><button className="btn sm" onClick={onClose}>Close</button></div>
      <p className="muted small">Balance due: <b>{peso(soa.balance)}</b></p>
      <DataTable rows={soa.invoices} cols={[{ key: 'invoice_no', label: 'Invoice' }, { key: 'policy_no', label: 'Policy' }, { key: 'amount', label: 'Billed', num: true, render: (r) => peso(r.amount) }, { key: 'paid_amount', label: 'Paid', num: true, render: (r) => peso(r.paid_amount) }, { key: 'balance', label: 'Balance', num: true, render: (r) => peso(r.balance) }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }]} />
      <h3 style={{ margin: '14px 0 8px', fontSize: 14 }}>Receipts</h3>
      <DataTable rows={soa.receipts} empty="No receipts." cols={[{ key: 'receipt_no', label: 'OR' }, { key: 'invoice_no', label: 'Invoice' }, { key: 'amount', label: 'Amount', num: true, render: (r) => peso(r.amount) }, { key: 'method', label: 'Method' }, { key: 'received_at', label: 'Received', render: (r) => fmtDate(r.received_at) }]} />
    </div>
  );
}

const STAGE_TONE: Record<string, string> = { newly_booked: 'navy', within_credit_term: 'ok', committed: 'warn', overdue: 'bad', escalate: 'bad' };

export function CollectionsPage() {
  const { has } = useAuth();
  const [q, setQ] = useState('');
  const { data, reload } = useLoad(() => get(`/api/collections/outstanding?q=${encodeURIComponent(q)}`), [q]);
  const cte = useLoad(() => get('/api/collections/cte'), []);
  const [soa, setSoa] = useState<any>(null);
  const [effortFor, setEffortFor] = useState<any>(null);
  const [efforts, setEfforts] = useState<any>(null);
  const openEfforts = async (inv: any) => setEfforts({ inv, list: (await get(`/api/collections/efforts/${inv.id}`)).efforts });
  return (
    <>
      <PageHead code="CLXN" title="Collections" sub="PR list by ageing and collection stage (newly booked: collect within 15 days; commitment within 60 days), marketing diary of efforts, credit-term extensions with approval, statements and reminders." />
      {data && <AgeingKpis total={data.total} b={data.buckets} />}
      <div className="stack">
        <div className="search"><input placeholder="Search client or policy…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {effortFor && has('CLXN') && <EffortForm invoice={effortFor} onDone={() => { setEffortFor(null); reload(); }} />}
        <DataTable rows={data?.invoices} empty="No outstanding premium. 🎉" cols={[
          { key: 'invoice_no', label: 'Invoice' }, { key: 'policy_no', label: 'Policy' }, { key: 'client_name', label: 'Client' }, { key: 'due_date', label: 'Due', render: (r) => fmtDate(r.due_date) },
          { key: 'bucket', label: 'Ageing', render: (r) => <Pill value={r.bucket} /> }, { key: 'stage', label: 'Stage', render: (r) => <span className={`pill ${STAGE_TONE[r.stage] ?? ''}`}>{String(r.stage).replaceAll('_', ' ')}</span> },
          { key: 'last_category', label: 'Last effort', render: lastEffortOf },
          { key: 'balance', label: 'Balance', num: true, render: (r) => <b>{peso(r.balance)}</b> },
          { key: 'act', label: '', render: (r) => <RowActions r={r} canEdit={has('CLXN')} onSoa={async () => setSoa(await get(`/api/collections/statement/${r.client_id}`))} onDiary={() => openEfforts(r)} onEffort={() => setEffortFor(r)} onDone={() => { reload(); cte.reload(); }} /> },
        ]} />
        {efforts && <DiaryCard efforts={efforts} onClose={() => setEfforts(null)} />}
        <div className="card">
          <h2>Credit-term extensions</h2>
          <DataTable rows={cte.data?.extensions} empty="No CTE requests." cols={[{ key: 'invoice_no', label: 'Invoice' }, { key: 'client_name', label: 'Client' }, { key: 'requested_days', label: 'Days', num: true }, { key: 'reason', label: 'Reason', wrap: true }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }, { key: 'new_due_date', label: 'New due', render: (r) => fmtDate(r.new_due_date) }]} />
        </div>
        {soa && <SoaCard soa={soa} onClose={() => setSoa(null)} />}
      </div>
    </>
  );
}
