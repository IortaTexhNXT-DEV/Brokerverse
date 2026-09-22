import { Router, query, requireModule, wrap } from '../lib/kit.js';

export const reportsRouter = Router();
reportsRouter.use(requireModule('RPT'));

reportsRouter.get('/dashboard', wrap(async (_req, res) => {
  const [k] = await query<any>(`SELECT
    (SELECT COUNT(*)::int FROM policies WHERE status='in_force') AS policies_in_force,
    (SELECT COALESCE(SUM(premium),0) FROM policies WHERE status IN ('in_force','renewed','expired') AND date_part('year', issued_at) = date_part('year', CURRENT_DATE)) AS premium_ytd,
    (SELECT COALESCE(SUM(commission),0) FROM policies WHERE status IN ('in_force','renewed','expired') AND date_part('year', issued_at) = date_part('year', CURRENT_DATE)) AS commission_ytd,
    (SELECT COALESCE(SUM(amount - paid_amount),0) FROM invoices WHERE status <> 'paid') AS outstanding_premium,
    (SELECT COUNT(*)::int FROM claims WHERE status NOT IN ('closed','declined')) AS open_claims,
    (SELECT COUNT(*)::int FROM approvals WHERE status='pending') AS pending_approvals,
    (SELECT COUNT(*)::int FROM policies WHERE status='in_force' AND expiry_date <= CURRENT_DATE + 60) AS renewals_due,
    (SELECT COUNT(*)::int FROM clients WHERE screening_status IN ('review','hit')) AS screening_hits,
    (SELECT COUNT(*)::int FROM service_requests WHERE status IN ('open','in_progress')) AS open_requests,
    (SELECT COUNT(*)::int FROM service_requests WHERE status IN ('open','in_progress') AND tat_due_at < now()) AS past_tat_requests,
    (SELECT COUNT(*)::int FROM policies WHERE status IN ('placement_requested','returned','placed')) AS in_placement,
    (SELECT COUNT(*)::int FROM payments WHERE status IN ('unapplied','zero_pr') AND unapplied_amount > 0) AS unapplied_payments,
    (SELECT COUNT(*)::int FROM disbursements WHERE status IN ('pending_review','pending_approval','approved')) AS disbursements_in_flight`);
  const byProduct = await query(`SELECT pr.code, pr.name, COUNT(p.id)::int AS policies, COALESCE(SUM(p.premium),0) AS premium FROM products pr LEFT JOIN policies p ON p.product_id=pr.id AND p.status IN ('in_force','renewed','expired') GROUP BY pr.id ORDER BY premium DESC`);
  const byMonth = await query(`SELECT to_char(date_trunc('month', issued_at), 'YYYY-MM') AS month, COUNT(*)::int AS policies, COALESCE(SUM(premium),0) AS premium FROM policies WHERE issued_at IS NOT NULL GROUP BY 1 ORDER BY 1 DESC LIMIT 12`);
  const claimsByStatus = await query('SELECT status, COUNT(*)::int AS count, COALESCE(SUM(reserve_amount),0) AS reserve FROM claims GROUP BY status ORDER BY status');
  res.json({ kpis: k, byProduct, byMonth: byMonth.reverse(), claimsByStatus });
}));

/** Production register (issued policies) with CSV export. */
reportsRouter.get('/production', wrap(async (req, res) => {
  const rows = await query<any>(`SELECT p.policy_no, p.issued_at::date AS issued, cl.name AS client, pr.code AS product, i.name AS insurer, p.sum_insured, p.premium, p.vat, p.dst, p.lgt, p.fst, p.total_amount, p.commission, p.status
    FROM policies p JOIN clients cl ON cl.id=p.client_id JOIN products pr ON pr.id=p.product_id JOIN insurers i ON i.id=p.insurer_id WHERE p.issued_at IS NOT NULL ORDER BY p.issued_at DESC`);
  if (req.query.format === 'csv') {
    const cols = Object.keys(rows[0] ?? { policy_no: '' });
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="production.csv"');
    return res.send(csv);
  }
  res.json({ rows });
}));
