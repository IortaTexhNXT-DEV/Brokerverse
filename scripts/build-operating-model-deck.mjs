/**
 * Builds docs/bdoi-operating-model/BDOI-Operating-Model.pptx: the sixteen BDOI process flows as one
 * end-to-end picture. The swimlane, money-flow and timeline diagrams are rendered from the page
 * (docs/bdoi-operating-model/index.html) with Chromium and embedded as pictures; stage chevrons, cards and
 * tables are native PowerPoint shapes. Convert to PDF with LibreOffice if needed.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { STAGES, SATELLITES, HANDOFFS, CONTROLS, TATS, GLOSSARY } from './operating-model-data.mjs';

const require = createRequire(import.meta.url);
const pptxgen = require('pptxgenjs');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'docs/bdoi-operating-model');
const IORTA = resolve(root, 'web/public/iorta-technxt-logo.png');
const BDO = resolve(root, 'web/public/bdo-insure.png');

// 1 · Render the three diagrams from the page as high-resolution pictures.
const exe = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
await page.goto('file://' + resolve(dir, 'index.html'));
await page.waitForTimeout(600);
const DIAGRAMS = { chain: '#chain svg', money: '#money svg', timeline: '#timeline svg' };
const size = {};
for (const [k, sel] of Object.entries(DIAGRAMS)) {
  const el = page.locator(sel); const box = await el.boundingBox(); size[k] = box.width / box.height;
  await el.screenshot({ path: resolve(dir, 'img', `diagram-${k}.png`), type: 'png' });
}
await browser.close();

// 2 · Deck
const NAVY = '002B7F', DEEP = '0A49B8', GOLD = 'FFC400', INK = '14213D', INK2 = '5B6478', LINE = 'D9DFEA', LIGHT = 'F5F7FB', TINT = 'EEF3FC', WHITE = 'FFFFFF', PANEL = '0A3A9E';
const HEAD = 'Cambria', BODY = 'Calibri';
const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.author = 'iorta TechNXT'; pres.company = 'BDO Insurance and Reinsurance Brokers'; pres.title = 'BDOI Operating Model';
let pageNo = 1;
const footer = (s) => {
  s.addText('BDOI operating model  ·  BrokerVerse  ·  delivered by iorta TechNXT', { x: 0.5, y: 7.05, w: 8, h: 0.3, fontFace: BODY, fontSize: 9, color: INK2, isTextBox: true, margin: 0 });
  s.addText(String(pageNo), { x: 12.0, y: 7.05, w: 0.83, h: 0.3, fontFace: BODY, fontSize: 9, color: INK2, align: 'right', isTextBox: true, margin: 0 });
};
const title = (s, text, sub) => {
  s.addText(text, { x: 0.5, y: 0.4, w: 12.3, h: 0.7, fontFace: HEAD, fontSize: 30, bold: true, color: NAVY, isTextBox: true, margin: 0 });
  if (sub) s.addText(sub, { x: 0.5, y: 1.1, w: 12.3, h: 0.5, fontFace: BODY, fontSize: 13, color: INK2, isTextBox: true, margin: 0, fit: 'shrink' });
};
const chip = (s, x, y, d, text, opts = {}) => {
  s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: opts.fill ?? GOLD }, line: { color: opts.fill ?? GOLD } });
  s.addText(text, { x, y, w: d, h: d, fontFace: BODY, fontSize: opts.size ?? 12, bold: true, color: opts.color ?? NAVY, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
};
const picture = (s, key, y, maxH, caption) => {
  const aspect = size[key]; let w = 12.3, h = w / aspect; if (h > maxH) { h = maxH; w = h * aspect; }
  const x = 0.5 + (12.3 - w) / 2;
  s.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: WHITE }, line: { color: LINE, width: 0.75 }, shadow: { type: 'outer', blur: 6, offset: 2, angle: 90, color: '002B7F', opacity: 0.12 } });
  s.addImage({ path: resolve(dir, 'img', `diagram-${key}.png`), x, y, w, h });
  if (caption) s.addText(caption, { x: 0.5, y: y + h + 0.1, w: 12.3, h: 7.0 - (y + h + 0.1), fontFace: BODY, fontSize: 11, color: INK2, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
};

// Title
{
  const s = pres.addSlide(); s.background = { color: NAVY };
  s.addShape(pres.ShapeType.roundRect, { x: 0.7, y: 0.6, w: 3.6, h: 0.95, fill: { color: WHITE }, line: { color: WHITE }, rectRadius: 0.12 });
  s.addImage({ path: BDO, x: 0.9, y: 0.75, w: 3.2, h: 0.64 });
  s.addText('BDO Insurance & Reinsurance Brokers', { x: 0.7, y: 2.2, w: 12, h: 0.6, fontFace: BODY, fontSize: 20, color: GOLD, bold: true, isTextBox: true, margin: 0 });
  s.addText('How BDOI works, end to end', { x: 0.7, y: 2.8, w: 11.5, h: 1.2, fontFace: HEAD, fontSize: 44, color: WHITE, bold: true, isTextBox: true, margin: 0 });
  s.addText('The sixteen signed-off process flows in HL_Process_Overview integrated into one operating model: the whole chain on one picture, where the money goes, the life of one policy, twelve stages with their BrokerVerse screens, the satellite processes, hand-offs, controls and clocks.', { x: 0.7, y: 4.1, w: 9.2, h: 1.5, fontFace: BODY, fontSize: 15, color: 'CADCFC', isTextBox: true, margin: 0 });
  s.addShape(pres.ShapeType.roundRect, { x: 9.9, y: 5.85, w: 2.75, h: 1.0, fill: { color: WHITE }, line: { color: WHITE }, rectRadius: 0.1 });
  s.addText('delivered by', { x: 10.0, y: 5.9, w: 2.5, h: 0.25, fontFace: BODY, fontSize: 9, color: INK2, isTextBox: true, margin: 0 });
  s.addImage({ path: IORTA, x: 10.05, y: 6.12, w: 2.2, h: 0.66 });
  s.addNotes('BDOI stands between BDO clients and the insurance market: it onboards and screens the client, quotes and places the risk, books and invoices, collects, retains commission and remits net premium, accounts for every peso, services the client, handles claims and renews the cover.');
  pageNo++;
}
// What BDOI does + chevrons
{
  const s = pres.addSlide(); s.background = { color: WHITE };
  title(s, 'What BDOI does', 'A broker between BDO’s clients and the insurance market. Revenue is commission on premium placed, plus reinsurance commission as cedant.');
  const facts = [['Clients', 'Bank-referred consumer accounts (CBG home, motor, fire), corporate, branches, retail, group employee benefits'], ['Counterparties', 'Accredited insurers (SFTP-enrolled or email), reinsurers and RI brokers'], ['Units', 'Marketing, TSU, Reinsurance, Processing, Cashiering, Collections, Disbursement, FRBS, Claims, Contact Centre, Compliance'], ['Controls', 'Maker-checker wherever money or cover changes; segregation of duties; audit trail on every decision']];
  facts.forEach(([h, d], i) => {
    const x = 0.5 + (i % 2) * 6.3, y = 1.75 + Math.floor(i / 2) * 1.2;
    s.addShape(pres.ShapeType.roundRect, { x, y, w: 5.95, h: 1.0, fill: { color: LIGHT }, line: { color: LINE }, rectRadius: 0.1 });
    s.addText(h, { x: x + 0.22, y: y + 0.1, w: 5.5, h: 0.3, fontFace: BODY, fontSize: 13, bold: true, color: NAVY, isTextBox: true, margin: 0 });
    s.addText(d, { x: x + 0.22, y: y + 0.4, w: 5.5, h: 0.55, fontFace: BODY, fontSize: 11.5, color: INK, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
  });
  s.addText('THE CHAIN', { x: 0.5, y: 4.3, w: 4, h: 0.3, fontFace: BODY, fontSize: 10, bold: true, color: INK2, charSpacing: 2, isTextBox: true, margin: 0 });
  const steps = ['Onboard', 'Quote', 'Place', 'Book', 'Pay', 'Collect', 'Remit', 'Ledger', 'Adjust', 'Claim', 'Service', 'Renew'];
  // a preset chevron's notch is half its height deep, so each one overlaps the previous point by that much
  const ch = 0.75, notch = ch / 2, cw = (12.3 - notch) / steps.length;
  steps.forEach((t, i) => {
    const x = 0.5 + i * cw;
    s.addShape(pres.ShapeType.chevron, { x, y: 4.7, w: cw + notch, h: ch, fill: { color: i % 2 ? DEEP : NAVY }, line: { color: WHITE, width: 1 } });
  });
  steps.forEach((t, i) => {
    const x = 0.5 + i * cw;
    s.addText(t, { x: x + notch + 0.04, y: 4.7, w: cw - notch, h: ch, fontFace: BODY, fontSize: 10, bold: true, color: WHITE, align: 'center', valign: 'middle', isTextBox: true, margin: 0, wrap: false });
  });
  s.addShape(pres.ShapeType.roundRect, { x: 0.5, y: 5.75, w: 12.3, h: 1.05, fill: { color: WHITE }, line: { color: GOLD, width: 2 }, rectRadius: 0.1 });
  s.addText([{ text: 'One loop. ', options: { bold: true, color: NAVY } }, { text: 'Renewal opens 140 days before expiry and an accepted renewal re-enters placement, so a policy that is cared for never leaves the chain. Claims and servicing run beside it while the policy is in force; the ledger records every step.', options: { color: INK } }], { x: 0.75, y: 5.85, w: 11.8, h: 0.85, fontFace: BODY, fontSize: 12.5, valign: 'middle', isTextBox: true, margin: 0 });
  footer(s); pageNo++;
}
// Diagram slides
const DIAGRAM_SLIDES = [
  ['chain', 'The whole chain on one picture', 'Read left to right: each lane is a unit or counterparty, each column a stage. Gold boxes are the client’s own steps; dashed arrows are conditional branches (non-packaged risk to TSU, large risk to reinsurance, claim accepted only when premium is paid). The BDOIR end-to-end flow integrated with the New Business, TSU, Reinsurance, Operations, Collections, Disbursement, FRBS, ACSL, Refund, Claims, Case Management and Renewal flows.'],
  ['money', 'Where the money goes', 'Gross premium arrives through the cashiering channels and is applied to the invoice; the weekly remittance extract pays insurers the net premium through the disbursement chain. When a client pays the insurer directly, BDOI bills the insurer for its commission. Refunds go back only through a Refund Request Form and the disbursement chain. Claims money never passes through BDOI. As cedant, BDOI remits reinsurance premium and collects reinsurance commission.'],
  ['timeline', 'The life of one policy', 'Collections start 10–15 days after booking and the credit term is 60 days; a commitment beyond it needs a credit-term extension. Claims are accepted only while the policy is in force and the premium is paid. The renewal master expiry list opens 140 days before expiry, with renewal advices at 70 and 45 days; an accepted renewal is placed and booked like new business.'],
];
for (const [key, t, cap] of DIAGRAM_SLIDES) {
  const s = pres.addSlide(); s.background = { color: WHITE };
  title(s, t);
  picture(s, key, 1.2, key === 'timeline' ? 2.4 : 4.7, cap);
  s.addNotes(cap);
  footer(s); pageNo++;
}
// Stage overview grid
{
  const s = pres.addSlide(); s.background = { color: WHITE };
  title(s, 'Twelve stages', 'Each stage has its units, a trigger, activities, outputs, a control, a clock and a BrokerVerse screen. The following slides take them one by one.');
  STAGES.forEach((st, i) => {
    const col = i % 4, row = Math.floor(i / 4); const x = 0.5 + col * 3.1, y = 1.75 + row * 1.7;
    s.addShape(pres.ShapeType.roundRect, { x, y, w: 2.95, h: 1.55, fill: { color: LIGHT }, line: { color: LINE }, rectRadius: 0.1 });
    chip(s, x + 0.15, y + 0.15, 0.42, String(st.n), { size: 11 });
    s.addText(st.title, { x: x + 0.68, y: y + 0.1, w: 2.2, h: 0.55, fontFace: BODY, fontSize: 12.5, bold: true, color: INK, valign: 'middle', isTextBox: true, margin: 0, fit: 'shrink' });
    s.addText(st.units, { x: x + 0.15, y: y + 0.72, w: 2.7, h: 0.75, fontFace: BODY, fontSize: 9.5, color: INK2, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
  });
  footer(s); pageNo++;
}
// One slide per stage
for (const st of STAGES) {
  const s = pres.addSlide(); s.background = { color: WHITE };
  s.addText(`STAGE ${st.n} OF ${STAGES.length}`, { x: 0.5, y: 0.35, w: 6, h: 0.3, fontFace: BODY, fontSize: 10, bold: true, color: DEEP, charSpacing: 2, isTextBox: true, margin: 0 });
  chip(s, 0.5, 0.7, 0.55, String(st.n), { size: 14 });
  s.addText(st.title, { x: 1.2, y: 0.62, w: 7.2, h: 0.7, fontFace: HEAD, fontSize: 26, bold: true, color: NAVY, valign: 'middle', isTextBox: true, margin: 0, fit: 'shrink' });
  s.addText(st.units, { x: 1.2, y: 1.3, w: 7.2, h: 0.35, fontFace: BODY, fontSize: 11, color: INK2, isTextBox: true, margin: 0, fit: 'shrink' });
  // left column
  s.addText([{ text: 'STARTS WHEN  ', options: { bold: true, color: INK2, fontSize: 9, charSpacing: 2 } }, { text: st.trigger, options: { color: INK } }], { x: 0.5, y: 1.8, w: 6.4, h: 0.7, fontFace: BODY, fontSize: 11, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
  s.addText(st.does.map((d, i) => ({ text: d, options: { bullet: true, breakLine: i < st.does.length - 1, paraSpaceAfter: 3 } })), { x: 0.5, y: 2.55, w: 6.4, h: 2.3, fontFace: BODY, fontSize: 11, color: INK, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
  const rows = [['PRODUCES', st.outputs], ['CONTROL', st.controls], ['CLOCK', st.tat], ['FLOWS', st.flows.join(' · ')], ['SCREEN', st.screen]];
  let y = 4.95;
  for (const [k, v] of rows) {
    const h = k === 'CONTROL' ? 0.55 : 0.36;
    s.addText(k, { x: 0.5, y, w: 1.05, h, fontFace: BODY, fontSize: 8.5, bold: true, color: k === 'CONTROL' ? NAVY : INK2, charSpacing: 2, valign: 'top', isTextBox: true, margin: 0 });
    if (k === 'CONTROL') s.addShape(pres.ShapeType.roundRect, { x: 1.55, y: y - 0.04, w: 5.35, h, fill: { color: TINT }, line: { color: TINT }, rectRadius: 0.06 });
    s.addText(v, { x: 1.65, y, w: 5.2, h, fontFace: BODY, fontSize: 10, color: INK, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
    y += h + 0.05;
  }
  // right: screen
  const shot = resolve(dir, 'img', st.shot.replace('/', '-'));
  s.addShape(pres.ShapeType.rect, { x: 7.2, y: 1.8, w: 5.6, h: 3.5, fill: { color: WHITE }, line: { color: LINE, width: 0.75 }, shadow: { type: 'outer', blur: 6, offset: 2, angle: 90, color: '002B7F', opacity: 0.12 } });
  if (existsSync(shot)) s.addImage({ path: shot, x: 7.2, y: 1.8, w: 5.6, h: 3.5 });
  s.addText(`In BrokerVerse: ${st.screen}`, { x: 7.2, y: 5.38, w: 5.6, h: 0.45, fontFace: BODY, fontSize: 10, color: INK2, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
  // mini chain position
  const steps = ['Onboard', 'Quote', 'Place', 'Book', 'Pay', 'Collect', 'Remit', 'Ledger', 'Adjust', 'Claim', 'Service', 'Renew'];
  const ch = 0.36, notch = ch / 2, cw = (5.6 - notch) / steps.length;
  steps.forEach((t, i) => {
    const on = i === st.n - 1; const x = 7.2 + i * cw;
    s.addShape(pres.ShapeType.chevron, { x, y: 6.05, w: cw + notch, h: ch, fill: { color: on ? GOLD : TINT }, line: { color: WHITE, width: 0.75 } });
  });
  steps.forEach((t, i) => {
    const on = i === st.n - 1; const x = 7.2 + i * cw;
    s.addText(t, { x: x + notch + 0.01, y: 6.05, w: cw - notch, h: ch, fontFace: BODY, fontSize: 5.5, bold: on, color: on ? NAVY : INK2, align: 'center', valign: 'middle', isTextBox: true, margin: 0, wrap: false });
  });
  s.addNotes(`${st.title}. Units: ${st.units}. Starts when ${st.trigger} ${st.does.join(' ')} Produces: ${st.outputs}. Control: ${st.controls}. Clock: ${st.tat}. Screen: ${st.screen}.`);
  footer(s); pageNo++;
}
// Satellites
{
  const s = pres.addSlide(); s.background = { color: WHITE };
  title(s, 'Satellite processes and where they plug in', 'Four flows run beside the main chain and feed it at specific stages.');
  SATELLITES.forEach((sat, i) => {
    const x = 0.5 + (i % 2) * 6.3, y = 1.75 + Math.floor(i / 2) * 2.6;
    s.addShape(pres.ShapeType.roundRect, { x, y, w: 5.95, h: 2.4, fill: { color: LIGHT }, line: { color: LINE }, rectRadius: 0.1 });
    s.addText(sat.title, { x: x + 0.2, y: y + 0.12, w: 3.5, h: 0.35, fontFace: BODY, fontSize: 13.5, bold: true, color: NAVY, isTextBox: true, margin: 0 });
    s.addText(sat.plug, { x: x + 0.2, y: y + 0.5, w: 3.5, h: 1.8, fontFace: BODY, fontSize: 9.5, color: INK, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
    const shot = resolve(dir, 'img', sat.shot.replace('/', '-'));
    if (existsSync(shot)) s.addImage({ path: shot, x: x + 3.85, y: y + 0.2, w: 1.95, h: 1.22 });
    s.addText(sat.flows.join(' · '), { x: x + 3.85, y: y + 1.5, w: 1.95, h: 0.8, fontFace: BODY, fontSize: 8.5, color: INK2, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
  });
  footer(s); pageNo++;
}
// Hand-offs (two slides of six)
for (let part = 0; part < 2; part++) {
  const s = pres.addSlide(); s.background = { color: WHITE };
  title(s, `Process hand-offs${part ? ' (continued)' : ''}`, 'Each hand-off is a document or a state that one process writes and the next one reads.');
  HANDOFFS.slice(part * 6, part * 6 + 6).forEach(([h, d], i) => {
    const x = 0.5 + (i % 2) * 6.3, y = 1.75 + Math.floor(i / 2) * 1.7;
    s.addShape(pres.ShapeType.roundRect, { x, y, w: 5.95, h: 1.5, fill: { color: LIGHT }, line: { color: LINE }, rectRadius: 0.1 });
    s.addShape(pres.ShapeType.rightArrow, { x: x + 0.2, y: y + 0.2, w: 0.45, h: 0.3, fill: { color: GOLD }, line: { color: GOLD } });
    s.addText(h, { x: x + 0.8, y: y + 0.1, w: 5.0, h: 0.5, fontFace: BODY, fontSize: 12.5, bold: true, color: NAVY, valign: 'middle', isTextBox: true, margin: 0, fit: 'shrink' });
    s.addText(d, { x: x + 0.2, y: y + 0.65, w: 5.6, h: 0.8, fontFace: BODY, fontSize: 10.5, color: INK, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
  });
  footer(s); pageNo++;
}
// Controls table
{
  const s = pres.addSlide(); s.background = { color: WHITE };
  title(s, 'Controls: who makes, who checks', 'Every decision that changes cover or money is maker-checker with segregation of duties.');
  const head = ['Decision', 'Maker', 'Checker / approver', 'Approval type'].map((t) => ({ text: t, options: { bold: true, color: INK2, fill: { color: TINT }, fontSize: 10 } }));
  const rows = CONTROLS.map((r) => r.map((c) => ({ text: c, options: { fontSize: 10.5, color: INK } })));
  s.addTable([head, ...rows], { x: 0.5, y: 1.75, w: 12.3, colW: [3.2, 2.7, 3.9, 2.5], fontFace: BODY, border: { type: 'solid', pt: 0.5, color: LINE }, rowH: 0.42, valign: 'middle' });
  footer(s); pageNo++;
}
// Clocks table
{
  const s = pres.addSlide(); s.background = { color: WHITE };
  title(s, 'Clocks: the turnaround times the flows commit to');
  const head = ['Clock', 'Commitment'].map((t) => ({ text: t, options: { bold: true, color: INK2, fill: { color: TINT }, fontSize: 10 } }));
  const rows = TATS.map((r) => r.map((c) => ({ text: c, options: { fontSize: 11, color: INK } })));
  s.addTable([head, ...rows], { x: 0.5, y: 1.3, w: 12.3, colW: [6.0, 6.3], fontFace: BODY, border: { type: 'solid', pt: 0.5, color: LINE }, rowH: 0.4, valign: 'middle' });
  footer(s); pageNo++;
}
// Glossary (two slides)
for (let part = 0; part < 2; part++) {
  const s = pres.addSlide(); s.background = { color: WHITE };
  title(s, `BDOI terms${part ? ' (continued)' : ''}`);
  const items = GLOSSARY.slice(part * 16, part * 16 + 16);
  items.forEach(([t, d], i) => {
    const col = i % 2, row = Math.floor(i / 2); const x = 0.5 + col * 6.3, y = 1.3 + row * 0.66;
    s.addText([{ text: t, options: { bold: true, color: NAVY, breakLine: true } }, { text: d, options: { color: INK2 } }], { x, y, w: 5.95, h: 0.6, fontFace: BODY, fontSize: 11, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
  });
  footer(s); pageNo++;
}
// Closing
{
  const s = pres.addSlide(); s.background = { color: NAVY };
  s.addText('Sources and where to go next', { x: 0.7, y: 0.7, w: 11, h: 0.9, fontFace: HEAD, fontSize: 34, bold: true, color: WHITE, isTextBox: true, margin: 0 });
  const rows = [
    ['Source flows', 'HL_Process_Overview: sixteen flows, each confirmed by its BDOI process owner by email (Dec 2025 – Mar 2026)'],
    ['Operating model page', 'https://claude.ai/artifact/S1b3QzXUxZdtW4TM8xYyL5'],
    ['Step-by-step screens', 'https://claude.ai/artifact/EFoSW1GzSezVPJ8QhgeKvi (111 steps, two images each)'],
    ['Demo application', 'https://claude.ai/artifact/J5CoEBTpXYt77pVyruPQ5v (admin / Admin@123 or any persona with Broker@123)'],
    ['Regenerate this deck', 'node scripts/build-operating-model.mjs && node scripts/build-operating-model-deck.mjs'],
  ];
  rows.forEach(([h, v], i) => {
    const y = 1.9 + i * 0.95;
    chip(s, 0.7, y + 0.05, 0.45, String(i + 1), { size: 14 });
    s.addText(h, { x: 1.4, y, w: 3.6, h: 0.55, fontFace: BODY, fontSize: 15, bold: true, color: GOLD, valign: 'middle', isTextBox: true, margin: 0 });
    s.addText(v, { x: 5.1, y, w: 7.6, h: 0.55, fontFace: BODY, fontSize: 12, color: WHITE, valign: 'middle', isTextBox: true, margin: 0, fit: 'shrink' });
  });
  s.addShape(pres.ShapeType.roundRect, { x: 9.9, y: 6.4, w: 2.75, h: 0.85, fill: { color: WHITE }, line: { color: WHITE }, rectRadius: 0.1 });
  s.addImage({ path: IORTA, x: 10.05, y: 6.5, w: 2.2, h: 0.66 });
}
const outFile = resolve(dir, 'BDOI-Operating-Model.pptx');
await pres.writeFile({ fileName: outFile });
console.log('wrote', outFile, 'slides', pageNo);
