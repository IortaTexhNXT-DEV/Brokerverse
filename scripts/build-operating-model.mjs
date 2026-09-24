#!/usr/bin/env node
/**
 * Builds docs/bdoi-operating-model/index.html: the sixteen BDOI process flows integrated into one
 * end-to-end picture (swimlanes, money flow, policy timeline), stage cards with the BrokerVerse screen
 * for each stage, hand-offs between processes, controls and turnaround times, and a glossary.
 */
import { mkdirSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'docs/bdoi-operating-model');
mkdirSync(resolve(out, 'img'), { recursive: true });
const shots = resolve(root, 'docs/process-walkthrough/shots');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ───────────────────────── Swimlane diagram: the whole chain on one picture */
const LANES = [['Client'], ['Marketing &', 'New Business'], ['TSU &', 'Reinsurance'], ['Insurers &', 'Reinsurers'], ['Operations', 'Processing & Cashiering'], ['Collections'], ['Finance', 'FRBS & Disbursement'], ['Claims &', 'Customer Servicing']];
const COLS = ['Onboard', 'Quote', 'Place', 'Book', 'Pay', 'Collect', 'Remit', 'Ledger', 'Claim', 'Renew'];
const LW = 172, CW = 140, LH = 84, NW = 118, NH = 54, TOP = 34, LEFT = LW + 10;
const W = LEFT + COLS.length * CW + 10, H = TOP + LANES.length * LH + 10;
const cx = (c) => LEFT + c * CW + CW / 2, cy = (l) => TOP + l * LH + LH / 2;
const N = {
  client: { l: 0, c: 0, t: ['Prospect or', 'bank-referred client'] },
  onboard: { l: 1, c: 0, t: ['Create client,', 'sanctions & PEP screen'] },
  quote: { l: 1, c: 1, t: ['Quotation &', 'proposal (IDF)'] },
  tsu: { l: 2, c: 1, t: ['TSU quotation slip', '→ insurers → proposal'] },
  ri: { l: 2, c: 2, t: ['Facultative RI', 'slip & debit note'] },
  accept: { l: 0, c: 1, t: ['Accepts proposal', '(or declines)'] },
  place: { l: 1, c: 2, t: ['Placement slip', 'SFTP or email'] },
  insurerPlace: { l: 3, c: 2, t: ['Insurer places risk,', 'issues e-policy'] },
  book: { l: 4, c: 3, t: ['Booking & invoice', 'maker → checker'] },
  epolicy: { l: 0, c: 3, t: ['Receives e-policy', 'COG / contact centre'] },
  pay: { l: 0, c: 4, t: ['Pays premium: bills,', 'OTC, autopay, direct'] },
  cashier: { l: 4, c: 4, t: ['Cashiering: apply,', 'PDC hold, UPP'] },
  collect: { l: 5, c: 5, t: ['PR list, diary,', 'SOA, CTE'] },
  remit: { l: 4, c: 6, t: ['Weekly remittance', 'extract'] },
  disburse: { l: 6, c: 6, t: ['Disbursement', 'DPO→DTL→DSH→DUH'] },
  insurerPaid: { l: 3, c: 6, t: ['Insurer receives', 'net premium'] },
  gl: { l: 6, c: 7, t: ['FRBS ledger: journals,', 'ACSL, EOM/EOY close'] },
  adjust: { l: 4, c: 7, t: ['Endorsements, recon,', 'refund (RRF)'] },
  claim: { l: 7, c: 8, t: ['Claims: PLA → docs →', 'FLA → offer → settle'] },
  insurerClaim: { l: 3, c: 9, t: ['Insurer evaluates,', 'offers, pays (LOA)'] },
  contact: { l: 0, c: 8, t: ['Reports a loss', 'or a concern'] },
  service: { l: 7, c: 9, t: ['Contact centre cases', 'PID, TAT, referral'] },
  renew: { l: 1, c: 9, t: ['Renewal: RMEL −140d,', 'RA −70 / −45d, NRNS'] },
  renewOk: { l: 0, c: 9, t: ['Accepts renewal', 'terms'] },
};
const E = [
  ['client', 'onboard', 'KYC details'], ['onboard', 'quote', 'screened'], ['quote', 'tsu', 'non-packaged', 'dash'], ['tsu', 'quote', 'approved proposal', 'dash'], ['tsu', 'ri', 'large risk', 'dash'],
  ['quote', 'accept', 'proposal'], ['accept', 'place', 'accepted'], ['place', 'insurerPlace', 'placement slip'], ['insurerPlace', 'book', 'placed / e-policy'],
  ['book', 'epolicy', 'e-policy'], ['book', 'cashier', 'invoice'], ['pay', 'cashier', 'payment'], ['cashier', 'collect', 'unpaid balance'], ['collect', 'pay', 'SOA, follow-up'],
  ['cashier', 'remit', 'applied payments'], ['remit', 'disburse', 'schedule'], ['disburse', 'insurerPaid', 'net premium'], ['disburse', 'gl', 'payment journal'],
  ['adjust', 'disburse', 'refund voucher'], ['gl', 'adjust', 'SOA variance', 'dash'], ['contact', 'claim', 'notice of loss'], ['claim', 'insurerClaim', 'FLA ⇄ offer, payment', '', 'both'],
  ['cashier', 'claim', 'CAC: premium paid?', 'dash'], ['contact', 'service', 'concern'], ['book', 'renew', 'expiring policies', '', 'top'], ['renew', 'renewOk', 'RA letters'], ['renewOk', 'place', 'renewal placement'],
];
function edgePath(a, b) {
  const A = N[a], B = N[b]; const ax = cx(A.c), ay = cy(A.l), bx = cx(B.c), by = cy(B.l);
  let x1 = ax, y1 = ay, x2 = bx, y2 = by;
  if (A.l === B.l) { x1 = ax + (bx > ax ? NW / 2 : -NW / 2); x2 = bx + (bx > ax ? -NW / 2 : NW / 2); return { x1, y1, x2, y2, mx: (x1 + x2) / 2, my: ay - NH / 2 - 9 }; }
  else if (A.c === B.c) { y1 = ay + (by > ay ? NH / 2 : -NH / 2); y2 = by + (by > ay ? -NH / 2 : NH / 2); }
  else { x1 = ax + (bx > ax ? NW / 2 : -NW / 2); y2 = by + (by > ay ? -NH / 2 : NH / 2); if (Math.abs(bx - ax) < CW * 1.2) { x1 = ax; y1 = ay + (by > ay ? NH / 2 : -NH / 2); x2 = bx; } }
  return { x1, y1, x2, y2, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
}
const swimlane = () => {
  let s = `<svg class="diagram" viewBox="0 0 ${W} ${H}" role="img" aria-label="Swimlane picture of the BDOI end-to-end chain: client onboarding and quotation, placement with the insurer, booking and e-policy, cashiering, collections, weekly remittance and disbursement, the FRBS ledger, adjustments and refunds, claims and servicing, and renewal looping back to placement.">
<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--deep)"/></marker></defs>
<rect x="0" y="0" width="${W}" height="${H}" fill="var(--card)"/>`;
  LANES.forEach((name, i) => {
    s += `<rect x="0" y="${TOP + i * LH}" width="${W}" height="${LH}" fill="${i % 2 ? 'var(--lane)' : 'var(--card)'}"/><line x1="0" y1="${TOP + i * LH}" x2="${W}" y2="${TOP + i * LH}" stroke="var(--line)" stroke-width="1"/>`;
    const parts = name;
    s += `<text x="12" y="${cy(i) - (parts[1] ? 4 : -4)}" font-size="12" font-weight="700" fill="var(--navy)">${esc(parts[0])}</text>`;
    if (parts[1]) s += `<text x="12" y="${cy(i) + 12}" font-size="10.5" font-weight="${parts[0].endsWith('&') ? 700 : 400}" fill="${parts[0].endsWith('&') ? 'var(--navy)' : 'var(--ink2)'}">${esc(parts[1])}</text>`;
  });
  s += `<line x1="${LEFT - 6}" y1="0" x2="${LEFT - 6}" y2="${H}" stroke="var(--line)"/>`;
  COLS.forEach((c, i) => { s += `<text x="${cx(i)}" y="22" font-size="11" font-weight="700" text-anchor="middle" fill="var(--ink2)" letter-spacing="1">${esc(c.toUpperCase())}</text>`; });
  for (const [a, b, label, dash, mode] of E) {
    let p = edgePath(a, b);
    if (mode === 'top') {
      const A = N[a], B = N[b]; const vx = cx(A.c) + NW / 2 + 8, yt = TOP + 8;
      s += `<polyline points="${cx(A.c) + NW / 2},${cy(A.l)} ${vx},${cy(A.l)} ${vx},${yt} ${cx(B.c)},${yt} ${cx(B.c)},${cy(B.l) - NH / 2}" fill="none" stroke="var(--deep)" stroke-width="1.6" marker-end="url(#ah)"/>`;
      p = { mx: (vx + cx(B.c)) / 2, my: yt };
    } else {
      s += `<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" stroke="var(--deep)" stroke-width="1.6" ${dash ? 'stroke-dasharray="5 4"' : ''} marker-end="url(#ah)" ${mode === 'both' ? 'marker-start="url(#ah)"' : ''}/>`;
    }
    const w = label.length * 5.6 + 8;
    s += `<rect x="${p.mx - w / 2}" y="${p.my - 8}" width="${w}" height="15" rx="3" fill="var(--card)" stroke="var(--line)"/><text x="${p.mx}" y="${p.my + 3.5}" font-size="9.5" text-anchor="middle" fill="var(--ink)">${esc(label)}</text>`;
  }
  for (const [k, n] of Object.entries(N)) {
    const x = cx(n.c) - NW / 2, y = cy(n.l) - NH / 2; const key = ['client', 'accept', 'pay', 'epolicy', 'renewOk', 'contact'].includes(k);
    s += `<rect x="${x}" y="${y}" width="${NW}" height="${NH}" rx="7" fill="${key ? 'var(--gold-soft)' : 'var(--node)'}" stroke="${key ? 'var(--gold)' : 'var(--navy)'}" stroke-width="1.4"/>`;
    n.t.forEach((line, i) => { s += `<text x="${x + NW / 2}" y="${y + 23 + i * 14}" font-size="10.5" text-anchor="middle" fill="var(--ink)" font-weight="${i === 0 ? 600 : 400}">${esc(line)}</text>`; });
  }
  return s + '</svg>';
};

/* ───────────────────────── Money flow */
const money = () => {
  const W2 = 1100, H2 = 480;
  const box = (x, y, w, h, title, sub, accent) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${accent ? 'var(--gold-soft)' : 'var(--node)'}" stroke="${accent ? 'var(--gold)' : 'var(--navy)'}" stroke-width="1.5"/><text x="${x + w / 2}" y="${y + 24}" text-anchor="middle" font-size="13" font-weight="700" fill="var(--ink)">${esc(title)}</text>${sub.map((t, i) => `<text x="${x + w / 2}" y="${y + 44 + i * 15}" text-anchor="middle" font-size="10.5" fill="var(--ink2)">${esc(t)}</text>`).join('')}`;
  const lbl = (x, y, label) => { const w = label.length * 5.8 + 10; return `<rect x="${x - w / 2}" y="${y - 9}" width="${w}" height="17" rx="3" fill="var(--card)" stroke="var(--line)"/><text x="${x}" y="${y + 4}" font-size="10.5" text-anchor="middle" fill="var(--ink)">${esc(label)}</text>`; };
  const line = (pts, dash) => `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="var(--deep)" stroke-width="1.8" ${dash ? 'stroke-dasharray="6 4"' : ''} marker-end="url(#ah2)"/>`;
  return `<svg class="diagram" viewBox="0 0 ${W2} ${H2}" role="img" aria-label="Money flow: the client pays gross premium to BDOI, BDOI retains commission and remits net premium to the insurer weekly, refunds go back to the client through disbursement, direct payments to the insurer create a commission receivable BDOI bills, claims are paid by the insurer to the assured or repair shop, and BDOI as cedant remits reinsurance premium and receives reinsurance commission.">
<defs><marker id="ah2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--deep)"/></marker></defs>
<rect x="0" y="0" width="${W2}" height="${H2}" fill="var(--card)"/>
${box(30, 160, 200, 110, 'Client / assured', ['bills payment, OTC cash or cheque,', 'CLPC / PMS / trade files, autopay,', 'or direct to the insurer'], true)}
${box(400, 60, 300, 170, 'BDOI (broker)', ['Premium receivable (invoice) → applied', 'Post-dated cheques held 4 days', 'Zero-PR / excess → unapplied premium (GL 2400)', 'Commission income retained', 'Commission receivable (GL 1250) on direct pay', 'Weekly remittance → disbursement chain'])}
${box(860, 60, 210, 110, 'Insurer', ['receives net premium', 'pays claims'])}
${box(860, 210, 210, 100, 'Reinsurer / RI broker', ['facultative & treaty'])}
${box(400, 330, 300, 90, 'Suppliers, employees, cash advances', ['paid through the same', 'disbursement chain'])}
${line([[230, 190], [400, 130]])}${lbl(315, 150, 'gross premium (OR issued)')}
${line([[700, 90], [860, 90]])}${lbl(780, 78, 'net premium, weekly remittance')}
${line([[860, 140], [700, 140]], true)}${lbl(780, 152, 'commission billed & collected')}
${line([[130, 160], [130, 24], [965, 24], [965, 60]], true)}${lbl(548, 24, 'direct payment to the insurer (no premium through BDOI)')}
${line([[400, 200], [230, 235]])}${lbl(312, 232, 'refund via RRF → disbursement')}
${line([[1070, 130], [1085, 130], [1085, 450], [130, 450], [130, 270]], true)}${lbl(600, 450, 'claim paid by the insurer: LOA to casa / dealer, or cheque to the assured')}
${line([[550, 230], [550, 330]])}${lbl(550, 280, 'disbursement vouchers')}
${line([[700, 205], [860, 240]])}${lbl(780, 208, 'RI premium (BDOI as cedant)')}
${line([[860, 285], [700, 225]])}${lbl(790, 272, 'RI commission')}
</svg>`;
};

/* ───────────────────────── Policy timeline */
const timeline = () => {
  const W3 = 1200, H3 = 270, x0 = 110, x1 = 1110, y = 135;
  const marks = [
    [0, 'Quote → accept', 'proposal sent, client accepts'], [0.11, 'Placement', 'slip to insurer; RI: 24 h ack, 3-day slip'], [0.22, 'Booked', 'checker approves; invoice + e-policy'],
    [0.33, 'Collect', '10–15 days after booking'], [0.44, 'Credit term ends', '60 days; CTE needs approval'], [0.56, 'In force', 'claims accepted once premium paid'],
    [0.68, 'RMEL', '140 days before expiry'], [0.8, 'Initial RA', '−70 days'], [0.9, 'Final RA', '−45 days'], [1, 'Expiry', 'renewal placed or NRNS'],
  ];
  let s = `<svg class="diagram" viewBox="0 0 ${W3} ${H3}" role="img" aria-label="Timeline of one policy from quotation and placement through booking, collection within the 60-day credit term, the in-force period, the renewal master expiry list 140 days before expiry, renewal advices at 70 and 45 days, and expiry.">
<rect x="0" y="0" width="${W3}" height="${H3}" fill="var(--card)"/>
<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="var(--navy)" stroke-width="3"/>
<rect x="${x0 + (x1 - x0) * 0.22}" y="${y - 7}" width="${(x1 - x0) * 0.78}" height="14" rx="7" fill="var(--gold-soft)" stroke="var(--gold)"/>
<text x="${x0 + (x1 - x0) * 0.61}" y="${y - 16}" text-anchor="middle" font-size="9.5" fill="var(--ink2)">policy in force · weekly remittance of applied premium · endorsements and refunds under checker-poster</text>`;
  marks.forEach(([f, t, d], i) => {
    const x = x0 + (x1 - x0) * f; const up = i % 2 === 0; const ty = up ? y - 58 : y + 66;
    s += `<circle cx="${x}" cy="${y}" r="6" fill="var(--card)" stroke="var(--navy)" stroke-width="2.5"/><line x1="${x}" y1="${up ? y - 8 : y + 8}" x2="${x}" y2="${up ? y - 40 : y + 40}" stroke="var(--line)"/>`;
    s += `<text x="${x}" y="${ty}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--navy)">${esc(t)}</text><text x="${x}" y="${ty + 15}" text-anchor="middle" font-size="10" fill="var(--ink2)">${esc(d)}</text>`;
  });
  return s + '</svg>';
};

/* ───────────────────────── Stages */
const STAGES = [
  { n: 1, id: 'onboard', title: 'Onboarding & screening', units: 'Marketing Account Officer (MAO) · Compliance', trigger: 'A prospect walks in, a BDO branch or loan unit refers a client (CBG home / motor loans, CLPC), or a corporate account is prospected.', does: ['Client created with KYC details and TIN', 'Automatic sanctions and PEP screening; hit → Compliance clears or declines', 'Risk score and tier set the customer due-diligence level'], outputs: 'Client record (CLT-no.), screening result, CDD level', controls: 'No quotation without a screened client; declined clients cannot transact.', tat: 'Immediate', flows: ['NEW BUSINESS', 'BDOIR E2E'], screen: 'Sanction Screening & Risk', anchor: '02-new-business-02', shot: '02-new-business/02.jpg' },
  { n: 2, id: 'quote', title: 'Quotation & proposal', units: 'MAO · Marketing TL · TSU (non-packaged) · Reinsurance', trigger: 'Screened client requests cover, or a renewal/conversion opportunity is opened.', does: ['Packaged product: rating engine prices premium, VAT, DST, LGT, FST and commission from the product table', 'Non-packaged risk: TSU request → completeness and duplicate check → quotation slip → TL approval → RI referral if needed → sent to insurers → responses with evidence → comparative table → proposal slip approved', 'Proposal emailed; client accepts or declines with reason; hold cover can be requested from the insurer'], outputs: 'Quotation (QT-no.), proposal, TSU proposal slip, hold-cover request', controls: 'Non-packaged products cannot be quoted without an approved TSU proposal; acceptance limits and survey threshold checked at quotation.', tat: 'TSU SLA escalation on breach; insurer follow-up until all quotes are in', flows: ['NEW BUSINESS', 'PRODUCT MAINTENANCE TSU', 'RENISURANCE'], screen: 'New Business › Quotations & proposals · Product Maintenance › TSU requests', anchor: '02-new-business-03', shot: '02-new-business/03.jpg' },
  { n: 3, id: 'place', title: 'Placement with the insurer', units: 'Processing Team / Officer (PT/PO) · Insurer', trigger: 'Client acceptance recorded.', does: ['Policy shell created in status placement requested', 'Placement slip sent by SFTP when the insurer is enrolled, otherwise by email', 'Insurer returns (reason routed to marketing, resubmitted) or places the risk and issues the policy'], outputs: 'Policy (POL-no.), placement slip, insurer policy reference', controls: 'Channel decided by the insurer record; returns carry a reason and can be resubmitted.', tat: 'Facultative RI: acknowledge within 24 hours, slip within 3 working days', flows: ['NEW BUSINESS', 'RENISURANCE'], screen: 'New Business › Placement · Reinsurance › Facultative placements', anchor: '02-new-business-09', shot: '02-new-business/09.jpg' },
  { n: 4, id: 'book', title: 'Booking, invoicing & e-policy', units: 'PO (maker) · Underwriting Head (checker) · COG-OPRM · Contact centre', trigger: 'Risk placed and e-policy received.', does: ['Book & invoice raises a policy_issue approval; the checker approves', 'On approval: policy in force, invoice (premium receivable) generated, booking journal posted', 'E-policy delivered to the client via COG (SFTP) or PO email; fall-outs go to the contact centre with the exception reason'], outputs: 'Invoice (INV-no.), booking journal, e-policy, exception report', controls: 'Maker-checker with segregation of duties; only in-force, renewed or expired policies can carry claims.', tat: 'Same day once placed', flows: ['NEW BUSINESS', 'BDOIR E2E'], screen: 'Approvals & Audit · New Business › Policies', anchor: '02-new-business-12', shot: '02-new-business/12.jpg' },
  { n: 5, id: 'cashier', title: 'Cashiering & payment application', units: 'Cashiering Team · UPP handler · Marketing (direct payments)', trigger: 'Client pays: bills payment, OTC cash or cheque, CLPC / PMS / trade batch files, direct credit, autopay, or directly to the insurer.', does: ['Payment applied to the invoice; official receipt issued; cash and premium journals posted', 'Post-dated / OTC cheques held 4 days, then matured and applied, or tagged bounced (exclusion list)', 'Zero-PR or excess payments become unapplied premium (GL 2400) until matched', 'Direct payment to insurer: commission receivable (GL 1250) identified → billed → approved → collected with a commission OR'], outputs: 'Official receipt (OR-no.), PDC register, unapplied list, commission billing', controls: 'Cheques cannot mature before the clearing date; unapplied premium never sits against an invoice.', tat: '4-day cheque hold', flows: ['OPERATIONS', 'BDOIR E2E'], screen: 'Operations › Invoices & cashiering · Payments / PDC / UPP · Direct payments', anchor: '03-operations-03', shot: '03-operations/03.jpg' },
  { n: 6, id: 'collect', title: 'Marketing collections', units: 'Collection Handler · MAO · Unit / Finance Head', trigger: 'Invoice unpaid after booking.', does: ['PR list by market segment with ageing and stage: newly booked → within credit term → committed → overdue → escalate', 'Marketing diary records when, where, how and what of every effort; SOA and reminders sent', 'Commitment beyond the 60-day credit term emails the MAO; a credit-term extension (CTE) needs Unit Head approval'], outputs: 'Statement of account, effort diary, CTE request', controls: 'Collect within 10–15 days of booking; CTE extends the due date only after approval.', tat: '60-day credit term', flows: ['MARKETING COLLECTIONS'], screen: 'Collections', anchor: '04-marketing-collections-03', shot: '04-marketing-collections/03.jpg' },
  { n: 7, id: 'remit', title: 'Remittance & disbursement', units: 'Operations (extract) · Disbursement DPO → DTL → DSH → DUH · Insurer', trigger: 'Applied payments accumulate; weekly cycle (Monday to Friday coverage).', does: ['Weekly remittance extract per insurer, sanitised (direct-paid and already-remitted policies excluded, endorsements and knock-offs removed)', 'Submission creates a disbursement voucher; reviewer, section head and unit head sign in sequence', 'Payment posted with cheque or transaction reference; confirmation email to the requestor; GL batch posted', 'The same chain pays refunds, suppliers, reimbursements and cash advances'], outputs: 'Remittance schedule, disbursement voucher, payment journal, confirmation email', controls: 'Requester, reviewer, approver and payer are different people; nothing is paid without the approval chain.', tat: 'Weekly extract; end-of-day processing', flows: ['OPERATIONS', 'DISBURSEMENT'], screen: 'Accounting & Disbursement › Remittances · Disbursements', anchor: '06-disbursement-07', shot: '06-disbursement/07.jpg' },
  { n: 8, id: 'ledger', title: 'FRBS ledger & reconciliation', units: 'FRBS Accounting Assistant · TL · Team Head · Accounting Processor (ACSL)', trigger: 'Every transaction above posts a journal automatically; month and year ends.', does: ['Chart of accounts maintained; system journals for booking, receipts, commissions, remittances and refunds', 'Manual journals drafted, reviewed by the TL and posted by the FRBS approver', 'ACSL: insurer statement of account reconciled with the subsidiary ledger; abnormal balances raise adjustment entries', 'Period close and reopen; fiscal-year close moves nominal balances to retained earnings; trial balance and financial reports'], outputs: 'Journals, trial balance, financial reports, SOA reconciliation runs', controls: 'Double-entry ledger; closed periods reject postings; only the Finance Head reopens a period.', tat: 'Monthly on an agreed date; year-end', flows: ['FRBS - ACCOUNTING', 'ACSL'], screen: 'Accounting & Disbursement › Journals · Trial balance · Periods & year-end · ACSL / SOA recon', anchor: '05-frbs-accounting-02', shot: '08-acsl/02.jpg' },
  { n: 9, id: 'adjust', title: 'Adjustments, cancellations & refunds', units: 'Adjustment Team · Operations checker-poster · MAO · Marketing TL · Unit Head', trigger: 'Client requests a change or cancellation; production register shows a discrepancy; unapplied premium to be returned.', does: ['Endorsement (adjustment or cancellation) validated and posted under checker-poster; premium delta journaled; cancellation sets the policy cancelled', 'Production reconciliation classifies insurer register rows as matched, with discrepancies or unbooked, each dispositioned', 'Refund Request Form raised from the endorsement or UPP → Marketing TL review → Unit Head sign-off → refund disbursement voucher'], outputs: 'Endorsement (END-no.), production recon run, RRF and refund voucher', controls: 'Refunds only originate from endorsements or unapplied premium and are paid only through the disbursement chain.', tat: 'Per disbursement chain', flows: ['OPERATIONS', 'REFUND REQUEST', 'BDOIR E2E'], screen: 'Operations › Adjustments · Production recon · Accounting & Disbursement › Refund requests', anchor: '07-refund-request-03', shot: '07-refund-request/03.jpg' },
  { n: 10, id: 'claim', title: 'Claims', units: 'Claim handler · Insurer / adjuster · Assured · Casa / dealer', trigger: 'Client, account officer or branch sends notice of loss.', does: ['Claims Acceptance Control checks the policy is in force and premium paid; Preliminary Loss Advice sent', 'Document checklist by line (motor; non-motor via Claims Reporting Form); Formal Loss Advice to the insurer once complete; adjuster flagged', 'Insurer evaluates and offers; assured accepts or contests (re-evaluation loop, more documents may be requested)', 'Settlement by Letter of Authority to the preferred casa/dealer or by cash cheque; settlement approved; claim tagged settled and closed, or declined with reason'], outputs: 'PLA, FLA, offer, LOA, settlement', controls: 'FLA blocked until documents complete; settlement is maker-checker; every stage has a declination exit.', tat: 'Age in days tracked per claim', flows: ['CLAIMS PROCESS FLOW'], screen: 'Claims', anchor: '09-claims-03', shot: '09-claims/03.jpg' },
  { n: 11, id: 'service', title: 'Customer servicing & case management', units: 'BDO Contact Centre (CCC) · BDO Insure agent · Fulfilment units', trigger: 'Customer contacts the contact centre by phone, email or digital channel.', does: ['General inquiry handled and closed at point of contact', 'Account-related concern: positive identification (registered TIN or email) then handled at point of contact or referred to the owning unit with a TAT', 'Fulfilment unit resolves and closes; mis-routed cases returned to the CCC with a reason and re-logged', 'Servicing facility: search by invoice, policy or name; view accounts; update contact details'], outputs: 'Case (SR-no.), TAT, contact update', controls: 'Failed PID blocks the case; past-TAT cases are flagged on the dashboard.', tat: 'Per category (hours)', flows: ['CASE MANAGEMENT TO BE', 'CUSTOMER SERVICING FACILITY'], screen: 'Customer Servicing › Cases · Servicing facility', anchor: '10-case-management-04', shot: '10-case-management/04.jpg' },
  { n: 12, id: 'renew', title: 'Renewal (automated RMEL)', units: 'Sanitation Handler · Marketing TL / Team Head · PO · Insurer', trigger: 'Policy enters the 140-day window before expiry.', does: ['Renewal Master Expiry List generated; sanitation dispositions each account: for renewal, remarket, or not for renewal (NRNS letter)', 'Renewal advice letters: initial at −70 days, final at −45 days', 'Client accepts: renewal policy created and enters placement → booking → e-policy like new business', 'Bank-submitted policies feed the sanitation handler 150 days from expiry (conversion opportunity)'], outputs: 'RMEL, RA letters, NRNS letter, renewal policy', controls: 'RA timings and order enforced; conversion proceeds through New Business.', tat: '−140 / −70 / −45 days', flows: ['RENEWAL', 'Submitted Policies'], screen: 'Renewal · Submitted Policies › Expiring (150 days)', anchor: '12-renewal-05', shot: '12-renewal/05.jpg' },
];
const SATELLITES = [
  { title: 'Facultative reinsurance', plug: 'Feeds stage 2–3 for large or special risks referred by TSU: request → acknowledge (24 h) → underwriting information loop → slip with reinsurers, security rating and signed-slip evidence (3 working days) → closing and debit note to the cedant. RI commission is monitored with the Commission Receivable Unit.', flows: ['RENISURANCE'], shot: '13-reinsurance/04.jpg', anchor: '13-reinsurance-04' },
  { title: 'Employee benefits', plug: 'A parallel new-business and renewal track for group schemes: renewal advice → Broker of Record → Terms of Reference with master list and utilisation released to insurers → comparative analysis (premium, benefits, capabilities) → client confirmation and award, with ISACOM approval for a non-accredited provider → handoff to processing and collections (stages 4–6).', flows: ['EMPLOYEE BENEFITS'], shot: '15-employee-benefits/04.jpg', anchor: '15-employee-benefits-04' },
  { title: 'Submitted policies', plug: 'Policies the client bought elsewhere and submitted to the bank for its loan: masterlist validated, matched and consolidated; adequacy reviewed; findings issue an Insurance Adequacy Assessment Form; accounts 150 days from expiry go to the sanitation handler as renewal or conversion opportunities (stage 12).', flows: ['Submitted Policies'], shot: '14-submitted-policies/03.jpg', anchor: '14-submitted-policies-03' },
  { title: 'Product maintenance', plug: 'Keeps stage 2 honest: package creation or change requests are validated, approved under maker-checker and published as a release advisory to Marketing, Operations and TSU; the insurer panel records accreditation (drives ISACOM) and SFTP enrolment (drives the placement channel).', flows: ['PRODUCT MAINTENANCE TSU'], shot: '16-product-maintenance-tsu/08.jpg', anchor: '16-product-maintenance-tsu-08' },
];
const HANDOFFS = [
  ['Onboarding → Quotation', 'Only a screened client can be quoted; the client number carries into every later document.'],
  ['Quotation → TSU → Reinsurance', 'Non-packaged risks leave New Business for a TSU quotation slip; large or special risks are referred to RI before quoting; the approved proposal slip returns to New Business.'],
  ['Placement → Booking → Cashiering', 'Placement creates the policy; the checker’s approval creates the invoice; cashiering works only from invoices.'],
  ['Cashiering → Collections', 'Unpaid invoices become the PR list; applied payments leave it. Beyond-term commitments raise a CTE for the Finance Head.'],
  ['Cashiering → Remittance → Disbursement → Insurer', 'Applied premium is extracted weekly, sanitised and paid to insurers through the four-signature chain; direct-paid policies are excluded.'],
  ['Endorsement → Refund → Disbursement', 'A cancellation or adjustment with a refund raises an RRF; TL review and Unit Head sign-off create the refund voucher.'],
  ['Everything → FRBS ledger', 'Booking, receipts, commissions, remittances, refunds and settlements post journals automatically; manual entries and ACSL adjustments post only after review and approval.'],
  ['Collections → Claims', 'Claims Acceptance Control reads the invoice balance: an unpaid premium blocks registration.'],
  ['Booking → Renewal → Placement', 'In-force policies enter the RMEL 140 days before expiry; an accepted renewal re-enters placement and booking.'],
  ['Submitted policies → Renewal', 'Adequacy-reviewed bank-submitted policies feed the sanitation handler 150 days before expiry.'],
  ['Contact centre → Fulfilment units', 'Account-related cases are routed to the unit that owns the account; returns go back to the CCC for re-logging.'],
  ['Product maintenance → New Business / TSU', 'Release advisories tell Marketing, Operations and TSU what changed in a package and from when.'],
];
const CONTROLS = [
  ['Policy booking', 'PO / MAO', 'Underwriting Head', 'policy_issue'], ['Product change', 'Product admin', 'Underwriting Head', 'product_change'], ['Endorsement', 'Adjustment Team', 'Operations checker-poster', 'endorsement'],
  ['Manual journal / ACSL adjustment', 'FRBS Accounting Assistant', 'FRBS TL then approver', 'journal'], ['Disbursement', 'DPO', 'DTL → DSH → DUH (Finance Head)', 'disbursement'], ['Credit-term extension', 'Collection Handler', 'Unit / Finance Head', 'cte'],
  ['Claim settlement', 'Claim handler', 'Approver', 'claim_settlement'], ['EB award to non-accredited insurer', 'EB Officer', 'ISACOM', 'eb_award'], ['Refund request', 'MAO', 'Marketing TL review, Unit Head sign-off', 'RRF'],
];
const TATS = [['Facultative RI acknowledgement', '24 hours'], ['Facultative RI slip', '3 working days'], ['Cheque clearing hold', '4 days'], ['Collect newly booked', '10–15 days from booking'], ['Credit term', '60 days'], ['Remittance extract', 'Weekly, Monday–Friday coverage'], ['RMEL window', '140 days before expiry'], ['Initial / final renewal advice', '−70 / −45 days'], ['Submitted policies to sanitation', '150 days before expiry'], ['Submitted policy hold cover', '30 days'], ['Contact-centre case TAT', 'Hours per category'], ['Ledger close', 'Monthly on an agreed date; year-end']];
const GLOSSARY = [['MAO / MTL', 'Marketing Account Officer / Team Leader'], ['PT / PO', 'Processing Team / Processing Officer'], ['AT', 'Adjustment Team'], ['TSU', 'Technical Services Unit (non-packaged quotations)'], ['PRF', 'Package Request Form'], ['QS / PS', 'Quotation Slip / Proposal Slip'], ['IDF', 'Insurance Data Form (quotation template)'], ['COG-OPRM', 'e-policy delivery channel via SFTP'], ['CBG / CLPC', 'Consumer Banking Group / consumer loan payment centre'], ['PR', 'Premium receivable'], ['PDC', 'Post-dated cheque'], ['UPP', 'Unapplied premium payment'], ['OR', 'Official receipt'], ['CTE', 'Credit-term extension'], ['SOA', 'Statement of account'], ['DPO / DTL / DSH / DUH', 'Disbursement Processor, Team Leader, Section Head, Unit Head'], ['FRBS', 'Financial Reporting and Bookkeeping Services'], ['ACSL', 'Accounting subsidiary ledger reconciliation with insurer statements'], ['RRF', 'Refund Request Form'], ['PLA / FLA', 'Preliminary / Formal Loss Advice'], ['CRF', 'Claims Reporting Form (non-motor)'], ['LOA', 'Letter of Authority to a casa / dealer for repair'], ['CAC', 'Claims Acceptance Control'], ['PID', 'Positive identification of the caller'], ['CCC / CLS', 'Customer Contact Centre / case logging system'], ['RMEL', 'Renewal Master Expiry List'], ['RA / NRNS', 'Renewal advice / not-for-renewal notice'], ['IAAF', 'Insurance Adequacy Assessment Form'], ['BOR / TOR', 'Broker of Record / Terms of Reference'], ['ISACOM', 'Approval committee for non-accredited providers'], ['GRF', 'Group risk form / placement request'], ['Ebix / QPS / ISYS', 'Legacy systems replaced by BrokerVerse']];

for (const st of [...STAGES, ...SATELLITES]) { const src = resolve(shots, st.shot); if (existsSync(src)) copyFileSync(src, resolve(out, 'img', st.shot.replace('/', '-'))); }
const img = (shot) => `img/${shot.replace('/', '-')}`;
const WALK = 'https://claude.ai/artifact/EFoSW1GzSezVPJ8QhgeKvi';

const stageCard = (s) => `<article class="stage" id="s${s.n}">
  <div class="stage-head"><span class="num">${s.n}</span><div><h3>${esc(s.title)}</h3><p class="units">${esc(s.units)}</p></div></div>
  <div class="stage-body">
    <div class="stage-text">
      <p class="trigger"><b>Starts when</b> ${esc(s.trigger)}</p>
      <ul>${s.does.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
      <dl><dt>Produces</dt><dd>${esc(s.outputs)}</dd><dt>Control</dt><dd class="rule">${esc(s.controls)}</dd><dt>Clock</dt><dd>${esc(s.tat)}</dd><dt>Source flows</dt><dd>${s.flows.map((f) => `<span class="chip">${esc(f)}</span>`).join(' ')}</dd><dt>In BrokerVerse</dt><dd>${esc(s.screen)} · <a href="${WALK}#${s.anchor}" target="_blank" rel="noopener">step-by-step</a></dd></dl>
    </div>
    <figure><a href="${WALK}#${s.anchor}" target="_blank" rel="noopener"><img loading="lazy" src="${img(s.shot)}" alt="BrokerVerse screen for ${esc(s.title)}" width="1440" height="900" /></a><figcaption>${esc(s.screen)}</figcaption></figure>
  </div>
</article>`;

const html = `<title>BDOI Operating Model</title>
<meta name="description" content="How BDO Insurance and Reinsurance Brokers works end to end: the sixteen process flows integrated into one chain, with money flow, policy timeline, hand-offs, controls and the BrokerVerse screens." />
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
:root { --navy: #002B7F; --deep: #0A49B8; --gold: #FFC400; --gold-soft: #FFF3C4; --bg: #F5F7FB; --card: #FFFFFF; --lane: #F2F5FB; --node: #EEF3FC; --ink: #14213D; --ink2: #5B6478; --line: #D9DFEA; --tint: #EEF3FC; --shadow: 0 1px 2px rgba(0,43,127,.08), 0 8px 24px rgba(0,43,127,.06); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark; --bg: #0E1526; --card: #182135; --lane: #1C2740; --node: #22304E; --gold-soft: #3A3218; --ink: #E8EEFB; --ink2: #A6B1C9; --line: #2A3650; --tint: #1E2A45; --navy: #9DB8F5; --deep: #BFD2FF; --shadow: 0 1px 2px rgba(0,0,0,.4); } }
:root[data-theme="dark"] { color-scheme: dark; --bg: #0E1526; --card: #182135; --lane: #1C2740; --node: #22304E; --gold-soft: #3A3218; --ink: #E8EEFB; --ink2: #A6B1C9; --line: #2A3650; --tint: #1E2A45; --navy: #9DB8F5; --deep: #BFD2FF; --shadow: 0 1px 2px rgba(0,0,0,.4); }
* { box-sizing: border-box; } html { scroll-behavior: smooth; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 15px; line-height: 1.5; }
.wrap { max-width: 1240px; margin: 0 auto; padding-block: 32px 64px; padding-inline: 16px; }
h1 { font-family: Georgia, "Times New Roman", serif; font-size: clamp(30px, 4.2vw, 44px); color: var(--navy); margin: 0 0 10px; text-wrap: balance; letter-spacing: -.01em; line-height: 1.12; }
h2 { font-family: Georgia, "Times New Roman", serif; font-size: 27px; color: var(--navy); margin: 0 0 6px; text-wrap: balance; }
h3 { font-size: 18px; margin: 0; font-weight: 600; text-wrap: balance; line-height: 1.3; }
p { margin: 0 0 10px; } .lede { color: var(--ink2); max-width: 74ch; font-size: 16px; }
.eyebrow { text-transform: uppercase; letter-spacing: .08em; font-size: 12px; color: var(--ink2); margin: 0 0 8px; font-weight: 600; }
.hero { padding-bottom: 22px; border-bottom: 3px solid var(--gold); margin-bottom: 30px; display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(260px, 1fr); gap: 28px; align-items: end; }
.hero .facts { display: grid; gap: 8px; font-size: 13.5px; } .hero .facts div { display: grid; grid-template-columns: 120px 1fr; gap: 10px; padding: 6px 0; border-bottom: 1px dashed var(--line); } .hero .facts b { color: var(--navy); }
nav.toc { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 13.5px; margin-bottom: 34px; } nav.toc a { color: var(--deep); text-decoration: none; padding: 4px 10px; border: 1px solid var(--line); border-radius: 999px; background: var(--card); } nav.toc a:hover { border-color: var(--deep); }
section { margin-bottom: 52px; scroll-margin-top: 16px; } .sec-head { margin-bottom: 14px; padding-left: 14px; border-left: 4px solid var(--gold); }
.figure-wrap { overflow-x: auto; background: var(--card); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); padding: 8px; }
.figure-wrap .diagram { display: block; width: 100%; height: auto; min-width: 900px; } .figure-wrap.narrow .diagram { min-width: 760px; }
figure { margin: 0; } figcaption { font-size: 13px; color: var(--ink2); padding: 8px 4px 0; max-width: 90ch; }
.legend { display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 12.5px; color: var(--ink2); padding: 8px 4px 0; } .legend span::before { content: ""; display: inline-block; width: 22px; height: 0; border-top: 2px solid var(--deep); margin-right: 6px; vertical-align: middle; } .legend span.dash::before { border-top-style: dashed; } .legend span.key::before { width: 14px; height: 10px; border: 1px solid var(--gold); background: var(--gold-soft); border-radius: 3px; }
.stages { display: grid; gap: 22px; }
.stage { background: var(--card); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); padding: 20px; scroll-margin-top: 16px; }
.stage-head { display: flex; gap: 14px; align-items: center; margin-bottom: 12px; } .num { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: var(--gold); color: #002B7F; font-weight: 700; font-size: 15px; flex: none; }
.units { color: var(--ink2); font-size: 13px; margin: 2px 0 0; }
.stage-body { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(280px, 1fr); gap: 20px; align-items: start; }
.stage-text ul { margin: 0 0 12px; padding-left: 20px; } .stage-text li { margin: 3px 0; } .trigger { margin-bottom: 8px; }
dl { margin: 0; display: grid; grid-template-columns: 96px 1fr; gap: 6px 12px; font-size: 13.5px; } dt { text-transform: uppercase; letter-spacing: .06em; font-size: 10.5px; font-weight: 700; color: var(--ink2); padding-top: 3px; } dd { margin: 0; } dd.rule { background: var(--tint); border-radius: 6px; padding: 6px 8px; }
.chip { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--tint); color: var(--navy); font-weight: 600; margin: 2px 0; }
.stage figure { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: #fff; } .stage figure img { display: block; width: 100%; height: auto; } .stage figcaption { padding: 6px 10px; border-top: 1px solid var(--line); background: var(--card); }
.sat { display: grid; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 16px; } .sat article { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px; box-shadow: var(--shadow); } .sat article img { display: block; width: 100%; height: auto; border: 1px solid var(--line); border-radius: 6px; margin-top: 10px; } .sat p { font-size: 13.5px; }
table { width: 100%; border-collapse: collapse; font-size: 13.5px; background: var(--card); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; } th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top; } th { background: var(--tint); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink2); } tr:last-child td { border-bottom: 0; } .tbl { overflow-x: auto; }
.handoffs { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; } .handoffs div { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; font-size: 13.5px; } .handoffs b { color: var(--navy); display: block; margin-bottom: 4px; }
.gloss { columns: 3; column-gap: 28px; font-size: 13.5px; } .gloss div { break-inside: avoid; padding: 4px 0; border-bottom: 1px dashed var(--line); } .gloss b { color: var(--navy); }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
a { color: var(--deep); } a:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }
footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--line); font-size: 13px; color: var(--ink2); }
@media (max-width: 860px) { .hero, .stage-body, .two { grid-template-columns: 1fr; } .gloss { columns: 1; } }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
</style>
<div class="wrap">
  <header class="hero">
    <div>
      <p class="eyebrow">BDO Insurance &amp; Reinsurance Brokers · BrokerVerse · delivered by iorta TechNXT</p>
      <h1>How BDOI works, end to end</h1>
      <p class="lede">BDOI stands between BDO’s clients and the insurance market. It onboards and screens the client, quotes and places the risk with an insurer, books the policy and invoices the premium, collects it, keeps its commission and remits the net premium to the insurer, accounts for every peso, services the client, handles claims, and renews the cover before it expires. The sixteen signed-off process flows in HL_Process_Overview are the pieces; this page shows them as one machine.</p>
    </div>
    <div class="facts">
      <div><b>Revenue</b><span>Commission on premium placed; RI commission as cedant</span></div>
      <div><b>Clients</b><span>Bank-referred consumer accounts (CBG home, motor, fire), corporate, branches, retail, group employee benefits</span></div>
      <div><b>Counterparties</b><span>Accredited insurers (SFTP-enrolled or email), reinsurers and RI brokers</span></div>
      <div><b>Units</b><span>Marketing, TSU, Reinsurance, Processing, Cashiering, Collections, Disbursement, FRBS, Claims, Contact Centre, Compliance</span></div>
      <div><b>Controls</b><span>Maker-checker everywhere money or cover changes; segregation of duties; audit trail</span></div>
    </div>
  </header>
  <nav class="toc" aria-label="Sections"><a href="#chain">The whole chain</a><a href="#money">Where the money goes</a><a href="#timeline">Life of a policy</a><a href="#stages">Stage by stage</a><a href="#satellites">Satellite processes</a><a href="#handoffs">Hand-offs</a><a href="#controls">Controls &amp; clocks</a><a href="#glossary">Glossary</a></nav>

  <section id="chain">
    <div class="sec-head"><h2>The whole chain on one picture</h2><p class="lede">Read left to right. Each lane is a unit or counterparty; each column is a stage. Gold boxes are the client’s own steps. Dashed arrows are conditional branches: a non-packaged risk goes to TSU, a large risk to reinsurance, a claim is accepted only when the premium is paid.</p></div>
    <div class="figure-wrap"><figure>${swimlane()}<figcaption>The BDOIR end-to-end flow (connectors A–H in the source diagram) integrated with the New Business, TSU, Reinsurance, Operations, Collections, Disbursement, FRBS, ACSL, Refund, Claims, Case Management and Renewal flows. Renewal loops back into placement, so a policy that is cared for never leaves the chain.</figcaption><div class="legend"><span>hand-off</span><span class="dash">conditional branch</span><span class="key">client’s step</span></div></figure></div>
  </section>

  <section id="money">
    <div class="sec-head"><h2>Where the money goes</h2><p class="lede">A broker touches money four ways: it collects premium on the insurer’s behalf, keeps its commission, remits the rest, and returns what is over-paid. Claims money never passes through BDOI; the insurer pays the assured or the repair shop directly.</p></div>
    <div class="figure-wrap"><figure>${money()}<figcaption>Gross premium arrives through the cashiering channels and is applied to the invoice; the weekly remittance extract pays insurers the net premium through the disbursement chain. When a client pays the insurer directly, BDOI bills the insurer for its commission instead. Refunds go back to the client only through a Refund Request Form and the same disbursement chain. As cedant, BDOI remits reinsurance premium and collects reinsurance commission.</figcaption></figure></div>
  </section>

  <section id="timeline">
    <div class="sec-head"><h2>The life of one policy</h2><p class="lede">The clocks the flows prescribe, laid on one line: how fast a booked premium must be collected, how long cover runs, and when renewal starts.</p></div>
    <div class="figure-wrap"><figure>${timeline()}<figcaption>Collections start 10–15 days after booking and the credit term is 60 days; a commitment beyond it needs a credit-term extension. Claims are accepted only while the policy is in force and the premium is paid. The renewal master expiry list opens 140 days before expiry, with renewal advices at 70 and 45 days; an accepted renewal is placed and booked like new business.</figcaption></figure></div>
  </section>

  <section id="stages">
    <div class="sec-head"><h2>Stage by stage</h2><p class="lede">Twelve stages cover the chain. Each card names the units, what starts the stage, what happens, what it produces, the control that guards it, the clock, the source flows, and the BrokerVerse screen where it runs.</p></div>
    <div class="stages">${STAGES.map(stageCard).join('\n')}</div>
  </section>

  <section id="satellites">
    <div class="sec-head"><h2>Satellite processes and where they plug in</h2><p class="lede">Four flows run beside the main chain and feed it at specific stages.</p></div>
    <div class="sat">${SATELLITES.map((s) => `<article><h3>${esc(s.title)}</h3><p>${esc(s.plug)}</p><p>${s.flows.map((f) => `<span class="chip">${esc(f)}</span>`).join(' ')} · <a href="${WALK}#${s.anchor}" target="_blank" rel="noopener">step-by-step</a></p><a href="${WALK}#${s.anchor}" target="_blank" rel="noopener"><img loading="lazy" src="${img(s.shot)}" alt="BrokerVerse screen for ${esc(s.title)}" width="1440" height="900" /></a></article>`).join('')}</div>
  </section>

  <section id="handoffs">
    <div class="sec-head"><h2>How the processes hand off to each other</h2><p class="lede">The integration points. Each is a document or a state that one process writes and the next one reads.</p></div>
    <div class="handoffs">${HANDOFFS.map(([h, d]) => `<div><b>${esc(h)}</b>${esc(d)}</div>`).join('')}</div>
  </section>

  <section id="controls">
    <div class="sec-head"><h2>Controls and clocks</h2><p class="lede">Who makes and who checks, and the turnaround times the flows commit to.</p></div>
    <div class="two">
      <div class="tbl"><table><thead><tr><th>Decision</th><th>Maker</th><th>Checker / approver</th><th>Approval type</th></tr></thead><tbody>${CONTROLS.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="tbl"><table><thead><tr><th>Clock</th><th>Commitment</th></tr></thead><tbody>${TATS.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    </div>
  </section>

  <section id="glossary">
    <div class="sec-head"><h2>BDOI terms</h2></div>
    <div class="gloss">${GLOSSARY.map(([t, d]) => `<div><b>${esc(t)}</b> · ${esc(d)}</div>`).join('')}</div>
  </section>

  <footer>Sources: the sixteen flows in HL_Process_Overview (each confirmed by its BDOI process owner by email, December 2025 to March 2026) · conformance matrix <span style="font-family: ui-monospace, monospace">docs/process-conformance.md</span> · step-by-step screens at <a href="${WALK}" target="_blank" rel="noopener">the walkthrough</a> · demo at <a href="https://claude.ai/artifact/J5CoEBTpXYt77pVyruPQ5v" target="_blank" rel="noopener">BrokerVerse Demo</a>.</footer>
</div>
`;
writeFileSync(resolve(out, 'index.html'), html);
console.log(`operating model → ${resolve(out, 'index.html')} (${(html.length / 1024).toFixed(0)} KB)`);
