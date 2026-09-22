import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, Link, Outlet, useOutletContext } from 'react-router-dom';
import { get, post, peso, fmtDate, fmtDateTime, todayIso } from '../api';
import { useAuth } from '../auth';
import { ClientSelect, DataTable, Drawer, Field, PageHead, Pill, Tabs, useAction, useLoad } from '../components/ui';

const PLACEMENT_STAGES = ['placement_requested', 'returned', 'placed'];

function RatingPreview({ rating }: { rating: any }) {
  if (!rating) return null;
  if (rating.error) return <div className="alert error" style={{ marginTop: 12 }}>{rating.error}</div>;
  return (
    <div className="alert info" style={{ marginTop: 12 }} data-testid="rating">
      Premium <b>{peso(rating.premium)}</b> · VAT {peso(rating.vat)} · DST {peso(rating.dst)} · LGT {peso(rating.lgt)}{Number(rating.fst) > 0 && <> · FST {peso(rating.fst)}</>} · <b>Total {peso(rating.total)}</b> · Commission {peso(rating.commission)}
      {rating.surveyRequired && <> · <span className="pill warn">survey required</span></>}{rating.packaged === false && <> · <span className="pill warn">non-packaged: TSU proposal required</span></>}
    </div>
  );
}

function QuotationForm({ onCreated }: { onCreated: () => void }) {
  const clients = useLoad(() => get('/api/clients'), []);
  const products = useLoad(() => get('/api/products'), []);
  const insurers = useLoad(() => get('/api/insurers'), []);
  const tsu = useLoad(() => get('/api/tsu'), []);
  const { run, busy } = useAction();
  const [form, setForm] = useState({ clientId: '' as number | '', productId: '', insurerId: '', sumInsured: '', inceptionDate: todayIso(), tsuRequestId: '', holdCoverDays: '' });
  const [rating, setRating] = useState<any>(null);
  useEffect(() => {
    if (!form.productId || !form.sumInsured || Number(form.sumInsured) <= 0) { setRating(null); return; }
    const t = setTimeout(() => post(`/api/products/${form.productId}/rate`, { sumInsured: Number(form.sumInsured) }).then(setRating).catch((e) => setRating({ error: e.message })), 250);
    return () => clearTimeout(t);
  }, [form.productId, form.sumInsured]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = { clientId: Number(form.clientId), productId: Number(form.productId), insurerId: Number(form.insurerId), sumInsured: Number(form.sumInsured), inceptionDate: form.inceptionDate, tsuRequestId: form.tsuRequestId ? Number(form.tsuRequestId) : undefined, holdCoverDays: form.holdCoverDays ? Number(form.holdCoverDays) : undefined };
    if (await run(() => post('/api/new-business/quotations', body), 'Quotation created')) { setForm((f) => ({ ...f, sumInsured: '' })); setRating(null); onCreated(); }
  }
  const approvedTsu = (tsu.data?.requests ?? []).filter((t: any) => t.status === 'proposal_approved' && t.client_id === form.clientId);
  return (
    <form className="card" onSubmit={submit}>
      <h2>New quotation</h2>
      <div className="form-grid">
        <Field label="Client"><ClientSelect value={form.clientId} onChange={(v) => setForm({ ...form, clientId: v })} clients={clients.data?.clients} /></Field>
        <Field label="Product"><select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} required><option value="">Select…</option>{(products.data?.products ?? []).filter((p: any) => p.status === 'active').map((p: any) => <option key={p.id} value={p.id}>{p.code} · {p.name}{p.packaged ? '' : ' (non-packaged)'}</option>)}</select></Field>
        <Field label="Insurer"><select value={form.insurerId} onChange={(e) => setForm({ ...form, insurerId: e.target.value })} required><option value="">Select…</option>{(insurers.data?.insurers ?? []).map((i: any) => <option key={i.id} value={i.id}>{i.name} ({i.security_rating}{i.sftp_enrolled ? ', SFTP' : ''})</option>)}</select></Field>
        <Field label="Sum insured (₱)"><input type="number" min={1} step="0.01" value={form.sumInsured} onChange={(e) => setForm({ ...form, sumInsured: e.target.value })} required /></Field>
        <Field label="Inception date"><input type="date" value={form.inceptionDate} onChange={(e) => setForm({ ...form, inceptionDate: e.target.value })} required /></Field>
        <Field label="TSU proposal (non-packaged)"><select value={form.tsuRequestId} onChange={(e) => setForm({ ...form, tsuRequestId: e.target.value })}><option value="">None</option>{approvedTsu.map((t: any) => <option key={t.id} value={t.id}>{t.request_no} · {t.selected_insurer_name}</option>)}</select></Field>
        <Field label="Hold cover (days)" hint="Requests hold cover from the insurer"><input type="number" min={0} max={60} value={form.holdCoverDays} onChange={(e) => setForm({ ...form, holdCoverDays: e.target.value })} /></Field>
      </div>
      <RatingPreview rating={rating} />
      <div className="row end" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} type="submit">Create quotation</button></div>
    </form>
  );
}

function QuotationActions({ q, onDone }: { q: any; onDone: (policyId?: number) => void }) {
  const { run, busy } = useAction();
  const act = async (path: string, body: unknown, msg: string) => { const r = await run(() => post(path, body), msg); if (r) onDone(r.policyId); };
  if (q.status === 'quoted') return <button className="btn sm" disabled={busy} onClick={() => act(`/api/new-business/quotations/${q.id}/send-proposal`, {}, 'Proposal emailed to client')}>Send proposal</button>;
  if (q.status === 'proposal_sent') return (
    <span className="row">
      <button className="btn sm green" disabled={busy} onClick={() => act(`/api/new-business/quotations/${q.id}/decision`, { decision: 'accepted' }, 'Client acceptance recorded')}>Client accepted</button>
      <button className="btn sm danger" disabled={busy} onClick={() => { const reason = window.prompt('Decline reason'); if (reason) act(`/api/new-business/quotations/${q.id}/decision`, { decision: 'declined', reason }, 'Declined'); }}>Declined</button>
    </span>
  );
  if (q.status === 'accepted') return <button className="btn sm primary" disabled={busy} onClick={() => act(`/api/new-business/quotations/${q.id}/request-placement`, {}, 'Placement slip sent to insurer')}>Request placement</button>;
  return null;
}

export function NewBusinessPage() {
  const { has } = useAuth();
  const [tab, setTab] = useState('quotations');
  const [q, setQ] = useState('');
  const quotes = useLoad(() => get('/api/new-business/quotations'), [tab]);
  const policies = useLoad(() => get(`/api/new-business/policies?q=${encodeURIComponent(q)}`), [tab, q]);
  const nav = useNavigate();
  const onQuoteDone = (policyId?: number) => { quotes.reload(); if (policyId) nav(`/new-business/policies/${policyId}`); };
  return (
    <>
      <PageHead code="NB" title="New Business" sub="Quotation → proposal → client acceptance → placement slip to insurer → e-policy received → booking/invoicing under maker-checker." />
      <Tabs tabs={[{ key: 'quotations', label: 'Quotations & proposals' }, { key: 'placement', label: 'Placement' }, { key: 'policies', label: 'Policies' }]} active={tab} onChange={setTab} />
      {tab === 'quotations' && (
        <div className="stack">
          {has('NB') && <QuotationForm onCreated={quotes.reload} />}
          <DataTable rows={quotes.data?.quotations} cols={[
            { key: 'quote_no', label: 'Quote' }, { key: 'client_name', label: 'Client' }, { key: 'product_code', label: 'Product' }, { key: 'insurer_name', label: 'Insurer' },
            { key: 'sum_insured', label: 'Sum insured', num: true, render: (r) => peso(r.sum_insured) }, { key: 'total_amount', label: 'Total', num: true, render: (r) => peso(r.total_amount) },
            { key: 'hold_cover_until', label: 'Hold cover', render: (r) => fmtDate(r.hold_cover_until) }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> },
            { key: 'act', label: '', render: (r) => (has('NB') ? <QuotationActions q={r} onDone={onQuoteDone} /> : null) },
          ]} />
        </div>
      )}
      {tab === 'placement' && <PlacementBoard rows={(policies.data?.policies ?? []).filter((p: any) => PLACEMENT_STAGES.includes(p.status) || p.status === 'pending_approval')} onChange={policies.reload} />}
      {tab === 'policies' && (
        <div className="stack">
          <div className="search"><input placeholder="Search policy no. or client…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <DataTable rows={policies.data?.policies} onRow={(r) => nav(`/new-business/policies/${r.id}`)} cols={[
            { key: 'policy_no', label: 'Policy' }, { key: 'client_name', label: 'Client' }, { key: 'product_code', label: 'Product' }, { key: 'insurer_name', label: 'Insurer' },
            { key: 'inception_date', label: 'Period', render: (r) => `${fmtDate(r.inception_date)} – ${fmtDate(r.expiry_date)}` },
            { key: 'total_amount', label: 'Total', num: true, render: (r) => peso(r.total_amount) }, { key: 'epolicy_channel', label: 'e-Policy', render: (r) => r.epolicy_channel ? <Pill value={r.epolicy_channel} /> : '—' }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> },
          ]} />
        </div>
      )}
      <Outlet context={{ reloadList: () => { quotes.reload(); policies.reload(); } }} />
    </>
  );
}

function PlacementBoard({ rows, onChange }: { rows: any[]; onChange: () => void }) {
  const { has } = useAuth();
  const { run, busy } = useAction();
  const respond = async (id: number, outcome: 'placed' | 'returned') => {
    const body = outcome === 'placed' ? { outcome, insurerPolicyRef: window.prompt("Insurer's policy reference") ?? undefined } : { outcome, reason: window.prompt('Return reason from insurer') ?? '' };
    if (outcome === 'returned' && !body.reason) return;
    if (await run(() => post(`/api/new-business/policies/${id}/placement-response`, body), outcome === 'placed' ? 'E-policy received' : 'Placement returned')) onChange();
  };
  return (
    <DataTable rows={rows} empty="Nothing in placement." cols={[
      { key: 'policy_no', label: 'Policy' }, { key: 'client_name', label: 'Client' }, { key: 'insurer_name', label: 'Insurer', render: (r) => `${r.insurer_name}${r.sftp_enrolled ? ' (SFTP)' : ''}` },
      { key: 'placement_requested_at', label: 'Slip sent', render: (r) => fmtDateTime(r.placement_requested_at) }, { key: 'return_reason', label: 'Return reason', wrap: true, render: (r) => r.return_reason ?? '—' },
      { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> },
      { key: 'act', label: '', render: (r) => !has('NB') ? null : (
        <span className="row">
          {r.status === 'placement_requested' && <><button className="btn sm green" disabled={busy} onClick={() => respond(r.id, 'placed')}>Placed / e-policy received</button><button className="btn sm" disabled={busy} onClick={() => respond(r.id, 'returned')}>Returned</button></>}
          {r.status === 'returned' && <button className="btn sm" disabled={busy} onClick={async () => { if (await run(() => post(`/api/new-business/policies/${r.id}/resubmit-placement`), 'Placement re-submitted')) onChange(); }}>Re-submit placement</button>}
          {r.status === 'placed' && <button className="btn sm primary" disabled={busy} onClick={async () => { if (await run(() => post(`/api/new-business/policies/${r.id}/book`, {}), 'Booking sent for checker approval')) onChange(); }}>Book &amp; invoice</button>}
          {r.status === 'pending_approval' && <span className="small muted">awaiting checker</span>}
        </span>
      ) },
    ]} />
  );
}

const H3 = { margin: '18px 0 8px', fontSize: 14 } as const;

function EPolicyCell({ p }: { p: any }) {
  if (!p.epolicy_channel) return <>—</>;
  return <><Pill value={p.epolicy_channel} /> {fmtDateTime(p.epolicy_sent_at)}{p.epolicy_exception && <div className="small muted">{p.epolicy_exception}</div>}</>;
}

function PolicyButtons({ p, cancellable, onDone }: { p: any; cancellable: boolean; onDone: () => void }) {
  const { run, busy } = useAction();
  return (
    <div className="row end" style={{ marginTop: 16 }}>
      {p.status === 'in_force' && <button className="btn sm" disabled={busy} onClick={async () => { if (await run(() => post(`/api/new-business/policies/${p.id}/epolicy-exception`), 'Forwarded to contact centre')) onDone(); }}>e-Policy fallout → contact centre</button>}
      {cancellable && <button className="btn danger sm" disabled={busy} onClick={async () => { const reason = window.prompt('Cancellation reason'); if (reason && (await run(() => post(`/api/new-business/policies/${p.id}/cancel`, { reason }), 'Policy cancelled'))) onDone(); }}>Cancel</button>}
    </div>
  );
}

export function PolicyDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { has } = useAuth();
  const { data, reload } = useLoad(() => get(`/api/new-business/policies/${id}`), [id]);
  const outlet = useOutletContext<{ reloadList?: () => void } | undefined>();
  if (!data) return <p className="muted">Loading…</p>;
  const p = data.policy;
  const refresh = () => { reload(); outlet?.reloadList?.(); };
  const cancellable = ['placement_requested', 'returned', 'placed', 'pending_approval'].includes(p.status);
  return (
    <Drawer title={`Policy ${p.policy_no}`} onClose={() => nav('/new-business')}>
      <div className="row" style={{ marginBottom: 12 }}><Pill value={p.status} />{p.status === 'pending_approval' && <span className="small muted">Awaiting checker approval in Approvals &amp; Audit.</span>}</div>
      <dl className="dl">
        <dt>Client</dt><dd>{p.client_name} <span className="muted">({p.client_no})</span></dd>
        <dt>Product</dt><dd>{p.product_name}</dd>
        <dt>Insurer</dt><dd>{p.insurer_name}{p.insurer_policy_ref && <span className="muted"> · ref {p.insurer_policy_ref}</span>}</dd>
        <dt>Period</dt><dd>{fmtDate(p.inception_date)} – {fmtDate(p.expiry_date)}</dd>
        <dt>Sum insured</dt><dd>{peso(p.sum_insured)}</dd>
        <dt>Premium</dt><dd>{peso(p.premium)}</dd>
        <dt>Taxes</dt><dd>VAT {peso(p.vat)} · DST {peso(p.dst)} · LGT {peso(p.lgt)} · FST {peso(p.fst)}</dd>
        <dt>Total</dt><dd><b>{peso(p.total_amount)}</b></dd>
        <dt>Commission</dt><dd>{peso(p.commission)}</dd>
        <dt>Placement</dt><dd>{fmtDateTime(p.placement_requested_at)}{p.placed_at && <> → placed {fmtDateTime(p.placed_at)}</>}</dd>
        <dt>Booked</dt><dd>{fmtDateTime(p.booked_at)}</dd>
        <dt>e-Policy</dt><dd><EPolicyCell p={p} /></dd>
      </dl>
      <h3 style={H3}>Invoices</h3>
      <DataTable rows={data.invoices} empty="No invoice until the policy is booked." cols={[{ key: 'invoice_no', label: 'Invoice' }, { key: 'amount', label: 'Amount', num: true, render: (r) => peso(r.amount) }, { key: 'paid_amount', label: 'Paid', num: true, render: (r) => peso(r.paid_amount) }, { key: 'due_date', label: 'Due', render: (r) => fmtDate(r.due_date) }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }]} />
      <h3 style={H3}>Claims</h3>
      <DataTable rows={data.claims} empty="No claims." cols={[{ key: 'claim_no', label: 'Claim', render: (r) => <Link to={`/claims/${r.id}`}>{r.claim_no}</Link> }, { key: 'loss_date', label: 'Loss date', render: (r) => fmtDate(r.loss_date) }, { key: 'estimated_amount', label: 'Estimate', num: true, render: (r) => peso(r.estimated_amount) }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }]} />
      {data.endorsements.length > 0 && <><h3 style={H3}>Endorsements</h3><DataTable rows={data.endorsements} cols={[{ key: 'endorsement_no', label: 'No.' }, { key: 'type', label: 'Type' }, { key: 'premium_delta', label: 'Δ premium', num: true, render: (r) => peso(r.premium_delta) }, { key: 'refund_amount', label: 'Refund', num: true, render: (r) => peso(r.refund_amount) }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }]} /></>}
      {data.cessions.length > 0 && <><h3 style={H3}>Reinsurance cessions</h3><DataTable rows={data.cessions} cols={[{ key: 'treaty_code', label: 'Treaty' }, { key: 'ceded_sum_insured', label: 'Ceded SI', num: true, render: (r) => peso(r.ceded_sum_insured) }, { key: 'ceded_premium', label: 'Ceded premium', num: true, render: (r) => peso(r.ceded_premium) }]} /></>}
      {data.journals.length > 0 && <p className="small muted" style={{ marginTop: 14 }}>Ledger: {data.journals.map((j: any) => j.jv_no).join(', ')}</p>}
      {has('NB') && <PolicyButtons p={p} cancellable={cancellable} onDone={refresh} />}
    </Drawer>
  );
}
