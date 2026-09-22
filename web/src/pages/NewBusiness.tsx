import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, Link, Outlet } from 'react-router-dom';
import { get, post, peso, fmtDate, fmtDateTime, todayIso } from '../api';
import { useAuth } from '../auth';
import { ClientSelect, DataTable, Drawer, Field, PageHead, Pill, Tabs, useAction, useLoad } from '../components/ui';

export function NewBusinessPage() {
  const { has } = useAuth();
  const [tab, setTab] = useState('quotations');
  const [q, setQ] = useState('');
  const quotes = useLoad(() => get('/api/new-business/quotations'), [tab]);
  const policies = useLoad(() => get(`/api/new-business/policies?q=${encodeURIComponent(q)}`), [tab, q]);
  const clients = useLoad(() => get('/api/clients'), []);
  const products = useLoad(() => get('/api/products'), []);
  const insurers = useLoad(() => get('/api/insurers'), []);
  const { run, busy } = useAction();
  const nav = useNavigate();

  const [form, setForm] = useState({ clientId: '' as number | '', productId: '', insurerId: '', sumInsured: '', inceptionDate: todayIso() });
  const [rating, setRating] = useState<any>(null);

  useEffect(() => {
    if (!form.productId || !form.sumInsured || Number(form.sumInsured) <= 0) { setRating(null); return; }
    const t = setTimeout(() => post(`/api/products/${form.productId}/rate`, { sumInsured: Number(form.sumInsured) }).then(setRating).catch((e) => setRating({ error: e.message })), 250);
    return () => clearTimeout(t);
  }, [form.productId, form.sumInsured]);

  async function submitQuote(e: FormEvent) {
    e.preventDefault();
    const r = await run(() => post('/api/new-business/quotations', { clientId: Number(form.clientId), productId: Number(form.productId), insurerId: Number(form.insurerId), sumInsured: Number(form.sumInsured), inceptionDate: form.inceptionDate }), 'Quotation created');
    if (r) { setForm((f) => ({ ...f, sumInsured: '' })); setRating(null); quotes.reload(); }
  }

  async function bind(id: number) {
    const r = await run(() => post(`/api/new-business/quotations/${id}/issue`, {}), 'Policy bound – sent for checker approval');
    if (r) { quotes.reload(); nav(`/new-business/policies/${r.policyId}`); }
  }

  return (
    <>
      <PageHead code="NB" title="New Business" sub="Quote, bind and issue. Issuance is maker-checker: the Underwriting Head approves before a policy goes in force and the invoice is raised." />
      <Tabs tabs={[{ key: 'quotations', label: 'Quotations' }, { key: 'policies', label: 'Policies' }]} active={tab} onChange={setTab} />
      {tab === 'quotations' && (
        <div className="stack">
          {has('NB') && (
            <form className="card" onSubmit={submitQuote}>
              <h2>New quotation</h2>
              <div className="form-grid">
                <Field label="Client"><ClientSelect value={form.clientId} onChange={(v) => setForm({ ...form, clientId: v })} clients={clients.data?.clients} /></Field>
                <Field label="Product"><select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} required><option value="">Select…</option>{(products.data?.products ?? []).filter((p: any) => p.status === 'active').map((p: any) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></Field>
                <Field label="Insurer"><select value={form.insurerId} onChange={(e) => setForm({ ...form, insurerId: e.target.value })} required><option value="">Select…</option>{(insurers.data?.insurers ?? []).map((i: any) => <option key={i.id} value={i.id}>{i.name} ({i.security_rating})</option>)}</select></Field>
                <Field label="Sum insured (₱)"><input type="number" min={1} step="0.01" value={form.sumInsured} onChange={(e) => setForm({ ...form, sumInsured: e.target.value })} required /></Field>
                <Field label="Inception date"><input type="date" value={form.inceptionDate} onChange={(e) => setForm({ ...form, inceptionDate: e.target.value })} required /></Field>
              </div>
              {rating && !rating.error && (
                <div className="alert info" style={{ marginTop: 12 }} data-testid="rating">
                  Premium <b>{peso(rating.premium)}</b> · VAT {peso(rating.vat)} · DST {peso(rating.dst)} · LGT {peso(rating.lgt)}{Number(rating.fst) > 0 && <> · FST {peso(rating.fst)}</>} · <b>Total {peso(rating.total)}</b> · Commission {peso(rating.commission)}{rating.surveyRequired && <> · <span className="pill warn">survey required</span></>}
                </div>
              )}
              {rating?.error && <div className="alert error" style={{ marginTop: 12 }}>{rating.error}</div>}
              <div className="row end" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} type="submit">Create quotation</button></div>
            </form>
          )}
          <DataTable rows={quotes.data?.quotations} cols={[
            { key: 'quote_no', label: 'Quote' }, { key: 'client_name', label: 'Client' }, { key: 'product_code', label: 'Product' }, { key: 'insurer_name', label: 'Insurer' },
            { key: 'sum_insured', label: 'Sum insured', num: true, render: (r) => peso(r.sum_insured) }, { key: 'premium', label: 'Premium', num: true, render: (r) => peso(r.premium) },
            { key: 'total_amount', label: 'Total', num: true, render: (r) => peso(r.total_amount) }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> },
            { key: 'act', label: '', render: (r) => r.status === 'quoted' && has('NB') ? <button className="btn sm primary" disabled={busy} onClick={() => bind(r.id)}>Bind &amp; issue</button> : null },
          ]} />
        </div>
      )}
      {tab === 'policies' && (
        <div className="stack">
          <div className="search"><input placeholder="Search policy no. or client…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <DataTable rows={policies.data?.policies} onRow={(r) => nav(`/new-business/policies/${r.id}`)} cols={[
            { key: 'policy_no', label: 'Policy' }, { key: 'client_name', label: 'Client' }, { key: 'product_code', label: 'Product' }, { key: 'insurer_name', label: 'Insurer' },
            { key: 'inception_date', label: 'Period', render: (r) => `${fmtDate(r.inception_date)} – ${fmtDate(r.expiry_date)}` },
            { key: 'total_amount', label: 'Total', num: true, render: (r) => peso(r.total_amount) }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> },
          ]} />
        </div>
      )}
      <Outlet />
    </>
  );
}

export function PolicyDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { has } = useAuth();
  const { data, reload } = useLoad(() => get(`/api/new-business/policies/${id}`), [id]);
  const { run, busy } = useAction();
  if (!data) return <p className="muted">Loading…</p>;
  const p = data.policy;
  return (
    <Drawer title={`Policy ${p.policy_no}`} onClose={() => nav('/new-business')}>
      <div className="row" style={{ marginBottom: 12 }}><Pill value={p.status} />{p.status === 'pending_approval' && <span className="small muted">Awaiting checker approval in Approvals &amp; Audit.</span>}</div>
      <dl className="dl">
        <dt>Client</dt><dd>{p.client_name} <span className="muted">({p.client_no})</span></dd>
        <dt>Product</dt><dd>{p.product_name}</dd>
        <dt>Insurer</dt><dd>{p.insurer_name}</dd>
        <dt>Period</dt><dd>{fmtDate(p.inception_date)} – {fmtDate(p.expiry_date)}</dd>
        <dt>Sum insured</dt><dd>{peso(p.sum_insured)}</dd>
        <dt>Premium</dt><dd>{peso(p.premium)}</dd>
        <dt>Taxes</dt><dd>VAT {peso(p.vat)} · DST {peso(p.dst)} · LGT {peso(p.lgt)} · FST {peso(p.fst)}</dd>
        <dt>Total</dt><dd><b>{peso(p.total_amount)}</b></dd>
        <dt>Commission</dt><dd>{peso(p.commission)}</dd>
        <dt>Issued</dt><dd>{fmtDateTime(p.issued_at)}</dd>
      </dl>
      <h3 style={{ margin: '18px 0 8px', fontSize: 14 }}>Invoices</h3>
      <DataTable rows={data.invoices} empty="No invoice until the policy is approved." cols={[{ key: 'invoice_no', label: 'Invoice' }, { key: 'amount', label: 'Amount', num: true, render: (r) => peso(r.amount) }, { key: 'paid_amount', label: 'Paid', num: true, render: (r) => peso(r.paid_amount) }, { key: 'due_date', label: 'Due', render: (r) => fmtDate(r.due_date) }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }]} />
      <h3 style={{ margin: '18px 0 8px', fontSize: 14 }}>Claims</h3>
      <DataTable rows={data.claims} empty="No claims." cols={[{ key: 'claim_no', label: 'Claim', render: (r) => <Link to={`/claims/${r.id}`}>{r.claim_no}</Link> }, { key: 'loss_date', label: 'Loss date', render: (r) => fmtDate(r.loss_date) }, { key: 'estimated_amount', label: 'Estimate', num: true, render: (r) => peso(r.estimated_amount) }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }]} />
      {data.cessions.length > 0 && <><h3 style={{ margin: '18px 0 8px', fontSize: 14 }}>Reinsurance cessions</h3><DataTable rows={data.cessions} cols={[{ key: 'treaty_code', label: 'Treaty' }, { key: 'ceded_sum_insured', label: 'Ceded SI', num: true, render: (r) => peso(r.ceded_sum_insured) }, { key: 'ceded_premium', label: 'Ceded premium', num: true, render: (r) => peso(r.ceded_premium) }]} /></>}
      {data.journals.length > 0 && <p className="small muted" style={{ marginTop: 14 }}>Ledger: {data.journals.map((j: any) => j.jv_no).join(', ')}</p>}
      {has('NB') && ['in_force', 'pending_approval'].includes(p.status) && (
        <div className="row end" style={{ marginTop: 16 }}>
          <button className="btn danger sm" disabled={busy} onClick={async () => { const reason = window.prompt('Cancellation reason'); if (reason && (await run(() => post(`/api/new-business/policies/${p.id}/cancel`, { reason }), 'Policy cancelled'))) reload(); }}>Cancel policy</button>
        </div>
      )}
    </Drawer>
  );
}
