import { Router, z, one, query, tx, requireModule, wrap, audit, idParam, parse, conflict, notFound, forbidden, createApproval } from '../lib/kit.js';
import { createDisbursement, payDisbursement } from '../domain/disbursements.js';

export const disbursementsRouter = Router();
disbursementsRouter.use(requireModule('ADA'));

disbursementsRouter.get('/', wrap(async (req, res) => {
  const status = String(req.query.status ?? '');
  res.json({ disbursements: await query(`SELECT d.*, rq.full_name AS requested_by_name, rv.full_name AS reviewed_by_name, ap.full_name AS approved_by_name FROM disbursements d
    LEFT JOIN users rq ON rq.id=d.requested_by LEFT JOIN users rv ON rv.id=d.reviewed_by LEFT JOIN users ap ON ap.id=d.approved_by WHERE ($1 = '' OR d.status=$1) ORDER BY d.id DESC LIMIT 300`, [status]) });
}));

/** Other disbursement functions: supplier payments, reimbursements, cash advances (payee maintained on the request). */
disbursementsRouter.post('/', wrap(async (req, res) => {
  const b = parse(z.object({ type: z.enum(['supplier', 'reimbursement', 'cash_advance', 'other']), payeeName: z.string().min(2), amount: z.number().positive(), mode: z.enum(['cheque', 'credit_to_account', 'online_banking', 'managers_cheque']), bankDetails: z.string().optional() }), req.body);
  const out = await tx((c) => createDisbursement(c, req.user!, b));
  res.status(201).json(out);
}));

/** Reviewer (a second person in Disbursement) checks the request; then it goes to the Finance Head for final approval. */
disbursementsRouter.post('/:id/review', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const { ok, note } = parse(z.object({ ok: z.boolean(), note: z.string().optional() }), req.body);
  const out = await tx(async (c) => {
    const d = await one<any>('SELECT * FROM disbursements WHERE id=$1 FOR UPDATE', [id], c);
    if (!d) throw notFound('Disbursement not found');
    if (d.status !== 'pending_review') throw conflict(`Disbursement is ${d.status}`);
    if (d.requested_by === req.user!.id) throw forbidden('Segregation of duties: the requester cannot review their own disbursement');
    if (!ok) {
      await query("UPDATE disbursements SET status='rejected', reviewed_by=$2 WHERE id=$1", [id, req.user!.id], c);
      await audit(c, req.user, { action: 'disbursement.review.reject', entity: 'disbursement', entityId: id, after: { note } });
      return { status: 'rejected' };
    }
    await query("UPDATE disbursements SET status='pending_approval', reviewed_by=$2 WHERE id=$1", [id, req.user!.id], c);
    const approvalId = await createApproval(c, req.user!, { requestType: 'disbursement', entity: 'disbursement', entityId: id, summary: `Disburse PHP ${Number(d.amount).toFixed(2)} to ${d.payee_name} (${d.type}, ${d.voucher_no})`, note });
    await audit(c, req.user, { action: 'disbursement.review', entity: 'disbursement', entityId: id, after: { approvalId } });
    return { status: 'pending_approval', approvalId };
  });
  res.json(out);
}));

disbursementsRouter.post('/:id/pay', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const { reference } = parse(z.object({ reference: z.string().min(1) }), req.body);
  res.json(await tx((c) => payDisbursement(c, id, reference, req.user!)));
}));
