/**
 * Builds docs/process-walkthrough/BrokerVerse-Process-Walkthrough.pptx from manifest.json and the captured screens.
 * Requires pptxgenjs (npm i -g pptxgenjs, or run inside a folder where it is installed). Convert to PDF with LibreOffice:
 *   soffice --headless --convert-to pdf docs/process-walkthrough/BrokerVerse-Process-Walkthrough.pptx
 */
const pptxgen = require('pptxgenjs');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../docs/process-walkthrough');
const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const NAVY = '002B7F', DEEP = '0A49B8', GOLD = 'FFC400', INK = '14213D', INK2 = '5B6478', LINE = 'D9DFEA', LIGHT = 'F5F7FB', WHITE = 'FFFFFF';
const HEAD = 'Cambria', BODY = 'Calibri';
const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5
pres.author = 'iorta TechNXT'; pres.company = 'BDO Insurance and Reinsurance Brokers'; pres.title = 'BrokerVerse Process Walkthrough';
const total = m.processes.reduce((n, p) => n + p.steps.length, 0);
const num = (p) => p.id.slice(0, 2);
const footer = (s, pageNo) => {
  s.addText('BrokerVerse  ·  BDO Insure  ·  delivered by iorta TechNXT', { x: 0.5, y: 7.05, w: 8, h: 0.3, fontFace: BODY, fontSize: 9, color: INK2, isTextBox: true, margin: 0 });
  s.addText(String(pageNo), { x: 12.0, y: 7.05, w: 0.83, h: 0.3, fontFace: BODY, fontSize: 9, color: INK2, align: 'right', isTextBox: true, margin: 0 });
};
const chip = (s, x, y, d, text, opts = {}) => {
  s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: opts.fill ?? GOLD }, line: { color: opts.fill ?? GOLD } });
  s.addText(text, { x, y, w: d, h: d, fontFace: BODY, fontSize: opts.size ?? 12, bold: true, color: opts.color ?? NAVY, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
};
let page = 1;

// 1 · Title
{
  const s = pres.addSlide(); s.background = { color: NAVY };
  s.addShape(pres.ShapeType.roundRect, { x: 0.7, y: 0.6, w: 3.6, h: 0.95, fill: { color: WHITE }, line: { color: WHITE }, rectRadius: 0.12 });
  s.addImage({ path: path.resolve(__dirname, '../web/public/bdo-insure.png'), x: 0.9, y: 0.75, w: 3.2, h: 0.64 });
  s.addText('BrokerVerse', { x: 0.7, y: 2.2, w: 12, h: 0.7, fontFace: BODY, fontSize: 22, color: GOLD, bold: true, isTextBox: true, margin: 0 });
  s.addText('Process Flow to Screen Walkthrough', { x: 0.7, y: 2.85, w: 11.5, h: 1.3, fontFace: HEAD, fontSize: 44, color: WHITE, bold: true, isTextBox: true, margin: 0 });
  s.addText(`Every step of the ${m.processes.length} signed-off BDOI process flows, shown against the BrokerVerse screen that performs it. ${total} screens captured from the running platform with the responsible personas.`, { x: 0.7, y: 4.25, w: 8.6, h: 1.1, fontFace: BODY, fontSize: 16, color: 'CADCFC', isTextBox: true, margin: 0 });
  s.addText(`BDO Insurance & Reinsurance Brokers  ·  captured ${m.generatedAt.slice(0, 10)}`, { x: 0.7, y: 6.15, w: 7, h: 0.4, fontFace: BODY, fontSize: 12, color: 'CADCFC', isTextBox: true, margin: 0 });
  s.addShape(pres.ShapeType.roundRect, { x: 9.9, y: 5.85, w: 2.75, h: 1.0, fill: { color: WHITE }, line: { color: WHITE }, rectRadius: 0.1 });
  s.addText('delivered by', { x: 10.0, y: 5.9, w: 2.5, h: 0.25, fontFace: BODY, fontSize: 9, color: INK2, isTextBox: true, margin: 0 });
  s.addImage({ path: path.resolve(__dirname, '../web/public/iorta-technxt-logo.png'), x: 10.05, y: 6.12, w: 2.2, h: 0.66 });
  s.addNotes('Title slide. The walkthrough maps each BDOI process flow step to the BrokerVerse screen that implements it. Screens are real captures from journeys executed on the running platform.');
  page++;
}
// 2 · About
{
  const s = pres.addSlide(); s.background = { color: WHITE };
  s.addText('About this walkthrough', { x: 0.5, y: 0.45, w: 8, h: 0.8, fontFace: HEAD, fontSize: 36, bold: true, color: NAVY, isTextBox: true, margin: 0 });
  const paras = [
    { text: 'What it shows', options: { bold: true, color: NAVY, breakLine: true } },
    { text: 'One section per process flow in HL_Process_Overview. Each step of the flow sits beside the menu, tab and action in BrokerVerse that performs it.', options: { breakLine: true, paraSpaceAfter: 10 } },
    { text: 'How the screens were made', options: { bold: true, color: NAVY, breakLine: true } },
    { text: 'A browser script ran every process for real on the platform, signing in as the persona the flow prescribes at each step: the NB officer quoting and the Underwriting Head approving, the cashier receiving and the Finance Head releasing the disbursement. Nothing is a mock-up.', options: { breakLine: true, paraSpaceAfter: 10 } },
    { text: 'Controls that surfaced while capturing', options: { bold: true, color: NAVY, breakLine: true } },
    { text: 'A held cheque cannot be matured before its four-day clearing date, and a cancellation endorsement blocks any later claim on that policy. Both are the intended controls.', options: { breakLine: true, paraSpaceAfter: 10 } },
    { text: 'Data', options: { bold: true, color: NAVY, breakLine: true } },
    { text: 'All names and amounts are sample records from the demo seed.', options: {} },
  ];
  s.addText(paras, { x: 0.5, y: 1.5, w: 6.6, h: 5.2, fontFace: BODY, fontSize: 14, color: INK, valign: 'top', isTextBox: true, margin: 0 });
  const tiles = [[String(m.processes.length), 'process flows'], [String(total), 'captured screens'], ['12', 'personas signed in'], ['0', 'capture errors']];
  tiles.forEach(([n, l], i) => {
    const x = 7.7 + (i % 2) * 2.7, y = 1.6 + Math.floor(i / 2) * 2.4;
    s.addShape(pres.ShapeType.roundRect, { x, y, w: 2.45, h: 2.1, fill: { color: LIGHT }, line: { color: LINE }, rectRadius: 0.1 });
    s.addText(n, { x, y: y + 0.3, w: 2.45, h: 1.0, fontFace: HEAD, fontSize: 54, bold: true, color: NAVY, align: 'center', isTextBox: true, margin: 0 });
    s.addText(l, { x, y: y + 1.35, w: 2.45, h: 0.4, fontFace: BODY, fontSize: 13, color: INK2, align: 'center', isTextBox: true, margin: 0 });
  });
  footer(s, page++);
}
// 3 · Contents
{
  const s = pres.addSlide(); s.background = { color: WHITE };
  s.addText('The sixteen process flows', { x: 0.5, y: 0.45, w: 10, h: 0.8, fontFace: HEAD, fontSize: 36, bold: true, color: NAVY, isTextBox: true, margin: 0 });
  m.processes.forEach((p, i) => {
    const col = i < 8 ? 0 : 1, row = i % 8;
    const x = 0.5 + col * 6.3, y = 1.5 + row * 0.66;
    chip(s, x, y + 0.08, 0.42, num(p));
    s.addText(p.title, { x: x + 0.6, y, w: 4.3, h: 0.58, fontFace: BODY, fontSize: 15, bold: true, color: INK, valign: 'middle', isTextBox: true, margin: 0 });
    s.addText(`${p.steps.length} screens`, { x: x + 4.9, y, w: 1.1, h: 0.58, fontFace: BODY, fontSize: 11, color: INK2, align: 'right', valign: 'middle', isTextBox: true, margin: 0 });
  });
  footer(s, page++);
}
// Process sections
for (const p of m.processes) {
  const s = pres.addSlide(); s.background = { color: NAVY };
  chip(s, 0.7, 0.7, 0.9, num(p), { size: 26 });
  s.addText(p.title, { x: 1.85, y: 0.5, w: 4.6, h: 1.3, fontFace: HEAD, fontSize: 30, bold: true, color: WHITE, valign: 'middle', isTextBox: true, margin: 0, fit: 'shrink' });
  s.addText(p.summary, { x: 0.7, y: 2.0, w: 5.6, h: 2.6, fontFace: BODY, fontSize: 15, color: 'CADCFC', valign: 'top', isTextBox: true, margin: 0 });
  s.addText([{ text: 'Source flow  ', options: { bold: true, color: GOLD } }, { text: p.pdf, options: { color: WHITE } }], { x: 0.7, y: 5.2, w: 5.6, h: 0.45, fontFace: BODY, fontSize: 12, isTextBox: true, margin: 0 });
  s.addText([{ text: 'Personas  ', options: { bold: true, color: GOLD } }, { text: p.persona, options: { color: WHITE } }], { x: 0.7, y: 5.65, w: 5.6, h: 0.45, fontFace: BODY, fontSize: 12, isTextBox: true, margin: 0 });
  s.addText([{ text: 'Screens  ', options: { bold: true, color: GOLD } }, { text: `${p.steps.length} steps captured`, options: { color: WHITE } }], { x: 0.7, y: 6.1, w: 5.6, h: 0.45, fontFace: BODY, fontSize: 12, isTextBox: true, margin: 0 });
  const stepSize = p.steps.length > 12 ? 10.5 : 12;
  const lines = p.steps.map((st, i) => ({ text: `${num(p)}.${st.n}   ${st.step}`, options: { breakLine: i < p.steps.length - 1, paraSpaceAfter: 3 } }));
  s.addShape(pres.ShapeType.roundRect, { x: 6.7, y: 0.7, w: 6.1, h: 6.1, fill: { color: '0A3A9E' }, line: { color: '0A3A9E' }, rectRadius: 0.12 });
  s.addText('Steps in this flow', { x: 6.95, y: 0.85, w: 5.6, h: 0.35, fontFace: BODY, fontSize: 11, bold: true, color: GOLD, charSpacing: 2, isTextBox: true, margin: 0 });
  s.addText(lines, { x: 6.95, y: 1.25, w: 5.6, h: 5.4, fontFace: BODY, fontSize: stepSize, color: WHITE, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
  s.addNotes(`${p.title}. Source: ${p.pdf}. ${p.summary}`);
  page++;
  p.steps.forEach((st, i) => {
    const t = pres.addSlide(); t.background = { color: WHITE };
    t.addText(`${p.title}  ·  step ${Number(st.n)} of ${p.steps.length}`, { x: 0.5, y: 0.4, w: 8, h: 0.35, fontFace: BODY, fontSize: 11, bold: true, color: DEEP, charSpacing: 1, isTextBox: true, margin: 0 });
    chip(t, 0.5, 0.95, 0.5, num(p) + '.' + st.n, { size: 10 });
    t.addText(st.step, { x: 0.5, y: 1.6, w: 4.1, h: 2.6, fontFace: HEAD, fontSize: 20, bold: true, color: INK, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
    const screenParts = st.screen.split(' › ');
    t.addText('Screen', { x: 0.5, y: 4.4, w: 4.1, h: 0.3, fontFace: BODY, fontSize: 10, bold: true, color: INK2, charSpacing: 2, isTextBox: true, margin: 0 });
    t.addText(screenParts.map((part, k) => ({ text: part, options: { bold: k === 0, color: k === 0 ? NAVY : INK, breakLine: k < screenParts.length - 1 } })), { x: 0.5, y: 4.7, w: 4.1, h: 1.4, fontFace: BODY, fontSize: 13, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
    if (st.note) t.addText(st.note, { x: 0.5, y: 6.1, w: 4.1, h: 0.8, fontFace: BODY, fontSize: 11, italic: true, color: INK2, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
    t.addShape(pres.ShapeType.rect, { x: 4.9, y: 0.95, w: 8.0, h: 5.0, fill: { color: WHITE }, line: { color: LINE, width: 0.75 }, shadow: { type: 'outer', blur: 6, offset: 2, angle: 90, color: '002B7F', opacity: 0.12 } });
    t.addImage({ path: path.join(ROOT, st.file), x: 4.9, y: 0.95, w: 8.0, h: 5.0 });
    t.addText(`Menu path: ${st.screen}`, { x: 4.9, y: 6.05, w: 8.0, h: 0.35, fontFace: BODY, fontSize: 10, color: INK2, isTextBox: true, margin: 0, fit: 'shrink' });
    t.addNotes(`${p.title} step ${Number(st.n)}: ${st.step}. Screen: ${st.screen}.${st.note ? ' ' + st.note : ''}`);
    footer(t, page++);
  });
}
// Closing
{
  const s = pres.addSlide(); s.background = { color: NAVY };
  s.addText('Where to open BrokerVerse', { x: 0.7, y: 0.7, w: 11, h: 0.9, fontFace: HEAD, fontSize: 36, bold: true, color: WHITE, isTextBox: true, margin: 0 });
  const rows = [
    ['Demo with sample data', 'https://claude.ai/artifact/J5CoEBTpXYt77pVyruPQ5v', 'Sign in as admin / Admin@123, or any persona with Broker@123. Actions are simulated.'],
    ['Illustrated walkthrough', 'https://claude.ai/artifact/EFoSW1GzSezVPJ8QhgeKvi', 'The same screens as this deck, with full-size captures.'],
    ['Full platform on your machine', 'npm install  ·  npm run setup  ·  npm run dev', 'Then browse to http://localhost:5173. Docker: docker compose up --build serves http://localhost:8080.'],
    ['Regenerate the screens', 'npm run walkthrough', 'Re-runs every process in a browser against a running local stack and rebuilds the page.'],
  ];
  rows.forEach(([h, v, d], i) => {
    const y = 1.9 + i * 1.2;
    chip(s, 0.7, y + 0.05, 0.45, String(i + 1), { size: 14 });
    s.addText(h, { x: 1.4, y, w: 4.2, h: 0.5, fontFace: BODY, fontSize: 16, bold: true, color: GOLD, valign: 'middle', isTextBox: true, margin: 0 });
    s.addText(v, { x: 5.7, y, w: 7.0, h: 0.5, fontFace: 'Courier New', fontSize: 12, color: WHITE, valign: 'middle', isTextBox: true, margin: 0, fit: 'shrink' });
    s.addText(d, { x: 1.4, y: y + 0.5, w: 11.3, h: 0.5, fontFace: BODY, fontSize: 12, color: 'CADCFC', valign: 'top', isTextBox: true, margin: 0 });
  });
  s.addShape(pres.ShapeType.roundRect, { x: 9.9, y: 6.4, w: 2.75, h: 0.85, fill: { color: WHITE }, line: { color: WHITE }, rectRadius: 0.1 });
  s.addImage({ path: path.resolve(__dirname, '../web/public/iorta-technxt-logo.png'), x: 10.05, y: 6.5, w: 2.2, h: 0.66 });
  s.addNotes('Where to open the application and how to regenerate the walkthrough.');
}
pres.writeFile({ fileName: path.join(ROOT, 'BrokerVerse-Process-Walkthrough.pptx') }).then((f) => console.log('wrote', f, 'slides', page));
