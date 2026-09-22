import { Router, z, one, query, tx, requireModule, requireApprover, wrap, audit, nextNumber, idParam, parse, conflict, notFound, forbidden, GL, postJournal, today } from '../lib/kit.js';
import { createDisbursement } from '../domain/disbursements.js';

export const refundsRouter = Router();
refundsRouter.use(requireModule('NB', 'CLXN', 'CSF', 'ADA', 'OPS'));

const select = `SELECT r.*, cl.name AS client_name, i.invoice_no, rq.full_name AS requested_by_name, rv.full_name AS reviewed_by_name, ap.full_name AS approved_by_name, d.voucher_no, d.status AS disbursement_status
  FROM refund_requests r JOIN clients cl ON cl.id=r.client_id LEFT JOIN invoices i ON i.id=r.invoice_id LEFT JOIN users rq ON rq.id=r.requested_by LEFT JOIN users rv ON rv.id=r.reviewed_by LEFT JOIN users ap ON ap.id=r.approved_by LEFT JOIN disbursements d ON d.id=r.disbursement_id`;

refundsRouter.get('/', wrap(async (_req, res) => { res.json({ refunds: await query(`${select} ORDER BY r.id DESC LIMIT 300`) }); }));

/** Refund Request Form: client, bank/cheque details, amount and reason. Overpayments come from unapplied premium. */
refundsRouter.post('/', wrap(async (req, res) => {
  const b = parse(z.object({ clientId: z.number().int().positive(), invoiceId: z.number().int().positive().optional(), paymentId: z.number().int().positive().optional(), amount: z.number().positive(), reason: z.string().min(5), paymentMode: z.enum(['credit_to_account', 'cheque', 'managers_cheque']), bankAccount: z.string().optional() }), req.body);
  if (b.paymentMode === 'credit_to_account' && !b.bankAccount) throw conflict("Client's confirmed BDO account number is required for credit to account");
  const out = await tx(async (c) => {
    const client = await one<any>('SELECT * FROM clients WHERE id=$1', [b.clientId], c);
    if (!client) throw notFound('Client not found');
    let sourceType: string | null = null; let sourceId: number | null = null;
    if (b.paymentId) {
      const pm = await one<any>('SELECT * FROM payments WHERE id=$1 AND client_id=$2 FOR UPDATE', [b.paymentId, b.clientId], c);
      if (!pm || pm.unapplied_amount < b.amount) throw conflict('Refund exceeds the unapplied balance of the payment');
      await postJournal(c, { entryDate: today(), description: `Refund payable from UPP ${pm.payment_no}`, sourceType: 'refund', sourceId: pm.id, postedBy: req.user!.id, lines: [{ accountCode: GL.UNAPPLIED_PREMIUM, debit: b.amount }, { accountCode: GL.REFUNDS_PAYABLE, credit: b.amount }] });
      await query('UPDATE payments SET unapplied_amount=unapplied_amount-$2 WHERE id=$1', [pm.id, b.amount], c);
      sourceType = 'payment'; sourceId = pm.id;
    }
    const rrfNo = await nextNumber(c, 'RRF', 'RRF');
    const r = await one<{ id: number }>('INSERT INTO refund_requests(rrf_no, client_id, invoice_id, source_type, source_id, amount, reason, payment_mode, bank_account, requested_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
      [rrfNo, b.clientId, b.invoiceId ?? null, sourceType, sourceId, b.amount, b.reason, b.paymentMode, b.bankAccount ?? null, req.user!.id], c);
    await audit(c, req.user, { action: 'refund.request', entity: 'refund_request', entityId: r!.id, after: { rrfNo, ...b } });
    return { id: r!.id, rrfNo };
  });
  res.status(201).json(out);
}));

/** Team-leader review: a second person signs off the RRF before the unit head approves it. */
refundsRouter.post('/:id/review', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const { ok, note } = parse(z.object({ ok: z.boolean(), note: z.string().optional() }), req.body);
  await tx(async (c) => {
    const r = await one<any>('SELECT * FROM refund_requests WHERE id=$1 FOR UPDATE', [id], c);
    if (!r) throw notFound('Refund request not found');
    if (r.status !== 'submitted') throw conflict(`Request is ${r.status}`);
    if (r.requested_by === req.user!.id) throw forbidden('Segregation of duties: the requester cannot review their own RRF');
    await query('UPDATE refund_requests SET status=$2, reviewed_by=$3 WHERE id=$1', [id, ok ? 'reviewed' : 'rejected', req.user!.id], c);
    await audit(c, req.user, { action: ok ? 'refund.review' : 'refund.review.reject', entity: 'refund_request', entityId: id, after: { note } });
  });
  res.json({ ok: true });
}));

/** Unit-head approval: the RRF is handed to Disbursement as a refund disbursement request. */
refundsRouter.post('/:id/approve', requireApprover, wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const out = await tx(async (c) => {
    const r = await one<any>('SELECT r.*, cl.name AS client_name FROM refund_requests r JOIN clients cl ON cl.id=r.client_id WHERE r.id=$1 FOR UPDATE OF r', [id], c);
    if (!r) throw notFound('Refund request not found');
    if (r.status !== 'reviewed') throw conflict('The RRF must be reviewed by a team leader before approval');
    if (r.requested_by === req.user!.id || r.reviewed_by === req.user!.id) throw forbidden('Segregation of duties: approver must differ from requester and reviewer');
    const d = await createDisbursement(c, req.user!, { type: 'refund', payeeName: r.client_name, clientId: r.client_id, amount: r.amount, mode: r.payment_mode, bankDetails: r.bank_account ?? undefined, sourceType: 'refund_request', sourceId: id });
    await query("UPDATE refund_requests SET status='approved', approved_by=$2, disbursement_id=$3 WHERE id=$1", [id, req.user!.id, d.id], c);
    await audit(c, req.user, { action: 'refund.approve', entity: 'refund_request', entityId: id, after: { disbursementId: d.id } });
    return { disbursementId: d.id, voucherNo: d.voucherNo };
  });
  res.status(201).json(out);
}));
