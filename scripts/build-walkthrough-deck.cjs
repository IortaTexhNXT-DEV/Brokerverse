/**
 * Builds docs/process-walkthrough/BrokerVerse-Process-Walkthrough.pptx from manifest.json and the captured screens.
 * Two slides per step: the full screen with the acted-on area outlined (who / do / control), then the close-up
 * with what was entered and what the system answered.
 * Requires pptxgenjs (npm i -g pptxgenjs, or run inside a folder where it is installed). Convert to PDF with LibreOffice:
 *   soffice --headless --convert-to pdf docs/process-walkthrough/BrokerVerse-Process-Walkthrough.pptx
 */
const pptxgen = require('pptxgenjs');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../docs/process-walkthrough');
const IORTA = path.resolve(__dirname, '../web/public/iorta-technxt-logo.png');
const BDO = path.resolve(__dirname, '../web/public/bdo-insure.png');
const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const NAVY = '002B7F', DEEP = '0A49B8', GOLD = 'FFC400', INK = '14213D', INK2 = '5B6478', LINE = 'D9DFEA', LIGHT = 'F5F7FB', TINT = 'EEF3FC', WHITE = 'FFFFFF', PANEL = '0A3A9E';
const HEAD = 'Cambria', BODY = 'Calibri';
const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5
pres.author = 'iorta TechNXT'; pres.company = 'BDO Insurance and Reinsurance Brokers'; pres.title = 'BrokerVerse Process Walkthrough';
const total = m.processes.reduce((n, p) => n + p.steps.length, 0);
const num = (p) => p.id.slice(0, 2);
const initials = (name) => name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
let page = 1;

const footer = (s) => {
  s.addText('BrokerVerse  ·  BDO Insure  ·  delivered by iorta TechNXT', { x: 0.5, y: 7.05, w: 8, h: 0.3, fontFace: BODY, fontSize: 9, color: INK2, isTextBox: true, margin: 0 });
  s.addText(String(page), { x: 12.0, y: 7.05, w: 0.83, h: 0.3, fontFace: BODY, fontSize: 9, color: INK2, align: 'right', isTextBox: true, margin: 0 });
};
const chip = (s, x, y, d, text, opts = {}) => {
  s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: opts.fill ?? GOLD }, line: { color: opts.fill ?? GOLD } });
  s.addText(text, { x, y, w: d, h: d, fontFace: BODY, fontSize: opts.size ?? 12, bold: true, color: opts.color ?? NAVY, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
};
const label = (s, x, y, w, text, color = INK2) => s.addText(text, { x, y, w, h: 0.24, fontFace: BODY, fontSize: 9.5, bold: true, color, charSpacing: 2, isTextBox: true, margin: 0 });
const persona = (s, x, y, w, st) => {
  if (!st.persona) return;
  chip(s, x, y, 0.42, initials(st.persona.name), { fill: NAVY, color: WHITE, size: 10 });
  s.addText([{ text: st.persona.name, options: { bold: true, color: INK, breakLine: true } }, { text: st.persona.role, options: { color: INK2 } }], { x: x + 0.52, y: y - 0.04, w: w - 0.52, h: 0.5, fontFace: BODY, fontSize: 10.5, valign: 'middle', isTextBox: true, margin: 0, fit: 'shrink' });
};

// 1 · Title
{
  const s = pres.addSlide(); s.background = { color: NAVY };
  s.addShape(pres.ShapeType.roundRect, { x: 0.7, y: 0.6, w: 3.6, h: 0.95, fill: { color: WHITE }, line: { color: WHITE }, rectRadius: 0.12 });
  s.addImage({ path: BDO, x: 0.9, y: 0.75, w: 3.2, h: 0.64 });
  s.addText('BrokerVerse', { x: 0.7, y: 2.2, w: 12, h: 0.7, fontFace: BODY, fontSize: 22, color: GOLD, bold: true, isTextBox: true, margin: 0 });
  s.addText('Process Flow to Screen Walkthrough', { x: 0.7, y: 2.85, w: 11.5, h: 1.3, fontFace: HEAD, fontSize: 44, color: WHITE, bold: true, isTextBox: true, margin: 0 });
  s.addText(`Every step of the ${m.processes.length} signed-off BDOI process flows, step by step against the BrokerVerse screen that performs it: who acts, what they click, what they enter, what the system answers and which control applies. ${total} steps, ${total * 2} captured images from the running platform.`, { x: 0.7, y: 4.25, w: 8.8, h: 1.3, fontFace: BODY, fontSize: 15, color: 'CADCFC', isTextBox: true, margin: 0 });
  s.addText(`BDO Insurance & Reinsurance Brokers  ·  captured ${m.generatedAt.slice(0, 10)}`, { x: 0.7, y: 6.15, w: 7, h: 0.4, fontFace: BODY, fontSize: 12, color: 'CADCFC', isTextBox: true, margin: 0 });
  s.addShape(pres.ShapeType.roundRect, { x: 9.9, y: 5.85, w: 2.75, h: 1.0, fill: { color: WHITE }, line: { color: WHITE }, rectRadius: 0.1 });
  s.addText('delivered by', { x: 10.0, y: 5.9, w: 2.5, h: 0.25, fontFace: BODY, fontSize: 9, color: INK2, isTextBox: true, margin: 0 });
  s.addImage({ path: IORTA, x: 10.05, y: 6.12, w: 2.2, h: 0.66 });
  s.addNotes('Title slide. The walkthrough maps each BDOI process flow step to the BrokerVerse screen that implements it, with the persona, the action, the inputs, the system response and the control at each step.');
  page++;
}
// 2 · How to read
{
  const s = pres.addSlide(); s.background = { color: WHITE };
  s.addText('How to read this walkthrough', { x: 0.5, y: 0.45, w: 10, h: 0.8, fontFace: HEAD, fontSize: 36, bold: true, color: NAVY, isTextBox: true, margin: 0 });
  const items = [
    ['Who', 'The persona signed in for the step, as the flow prescribes: makers, checkers and approvers are different people.'],
    ['Screen', 'The menu › tab › action in BrokerVerse where the step happens.'],
    ['Do', 'What the persona does on that screen.'],
    ['Enter', 'The values keyed in or chosen, exactly as captured.'],
    ['Result', 'What the system answers, and the toast it showed at that moment.'],
    ['Control', 'The business rule or check enforced at the step.'],
  ];
  items.forEach(([h, d], i) => {
    const x = 0.5 + (i % 2) * 6.3, y = 1.6 + Math.floor(i / 2) * 1.35;
    s.addShape(pres.ShapeType.roundRect, { x, y, w: 5.95, h: 1.15, fill: { color: LIGHT }, line: { color: LINE }, rectRadius: 0.1 });
    s.addText(h, { x: x + 0.25, y: y + 0.12, w: 5.5, h: 0.35, fontFace: BODY, fontSize: 15, bold: true, color: NAVY, isTextBox: true, margin: 0 });
    s.addText(d, { x: x + 0.25, y: y + 0.48, w: 5.5, h: 0.6, fontFace: BODY, fontSize: 12.5, color: INK, valign: 'top', isTextBox: true, margin: 0 });
  });
  s.addShape(pres.ShapeType.roundRect, { x: 0.5, y: 5.75, w: 12.25, h: 1.05, fill: { color: WHITE }, line: { color: GOLD, width: 2 }, rectRadius: 0.1 });
  s.addText([{ text: 'Gold outline. ', options: { bold: true, color: NAVY } }, { text: 'On every full screen the area the persona acted on is outlined in gold; the next slide repeats it as a close-up. A browser script executed each journey for real on the platform, so every screen is a genuine capture. Names and amounts are sample records.', options: { color: INK } }], { x: 0.75, y: 5.85, w: 11.8, h: 0.85, fontFace: BODY, fontSize: 12.5, valign: 'middle', isTextBox: true, margin: 0 });
  footer(s); page++;
}
// 3 · Contents
{
  const s = pres.addSlide(); s.background = { color: WHITE };
  s.addText('The sixteen process flows', { x: 0.5, y: 0.45, w: 10, h: 0.8, fontFace: HEAD, fontSize: 36, bold: true, color: NAVY, isTextBox: true, margin: 0 });
  m.processes.forEach((p, i) => {
    const col = i < 8 ? 0 : 1, r = i % 8;
    const x = 0.5 + col * 6.3, y = 1.5 + r * 0.66;
    chip(s, x, y + 0.08, 0.42, num(p));
    s.addText(p.title, { x: x + 0.6, y, w: 4.3, h: 0.58, fontFace: BODY, fontSize: 15, bold: true, color: INK, valign: 'middle', isTextBox: true, margin: 0 });
    s.addText(`${p.steps.length} steps`, { x: x + 4.9, y, w: 1.1, h: 0.58, fontFace: BODY, fontSize: 11, color: INK2, align: 'right', valign: 'middle', isTextBox: true, margin: 0 });
  });
  footer(s); page++;
}

const overviewSlide = (p, st) => {
  const t = pres.addSlide(); t.background = { color: WHITE };
  t.addText(`${p.title}  ·  step ${Number(st.n)} of ${p.steps.length}`, { x: 0.5, y: 0.4, w: 8, h: 0.3, fontFace: BODY, fontSize: 11, bold: true, color: DEEP, charSpacing: 1, isTextBox: true, margin: 0 });
  chip(t, 0.5, 0.85, 0.5, num(p) + '.' + st.n, { size: 10 });
  persona(t, 1.15, 0.89, 3.55, st);
  t.addText(st.step, { x: 0.5, y: 1.5, w: 4.2, h: 1.35, fontFace: HEAD, fontSize: 17, bold: true, color: INK, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
  label(t, 0.5, 2.95, 4.2, 'SCREEN');
  const parts = st.screen.split(' › ');
  t.addText(parts.map((part, k) => ({ text: part, options: { bold: k === 0, color: k === 0 ? NAVY : INK, breakLine: k < parts.length - 1 } })), { x: 0.5, y: 3.2, w: 4.2, h: 0.85, fontFace: BODY, fontSize: 11.5, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
  label(t, 0.5, 4.1, 4.2, 'DO');
  t.addText(st.action || '—', { x: 0.5, y: 4.35, w: 4.2, h: 1.1, fontFace: BODY, fontSize: 11.5, color: INK, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
  if (st.rule) {
    t.addShape(pres.ShapeType.roundRect, { x: 0.5, y: 5.5, w: 4.2, h: 1.4, fill: { color: TINT }, line: { color: TINT }, rectRadius: 0.08 });
    label(t, 0.65, 5.58, 3.9, 'CONTROL', NAVY);
    t.addText(st.rule, { x: 0.65, y: 5.82, w: 3.9, h: 1.0, fontFace: BODY, fontSize: 11, color: INK, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
  }
  t.addShape(pres.ShapeType.rect, { x: 4.95, y: 0.85, w: 7.9, h: 4.94, fill: { color: WHITE }, line: { color: LINE, width: 0.75 }, shadow: { type: 'outer', blur: 6, offset: 2, angle: 90, color: '002B7F', opacity: 0.12 } });
  t.addImage({ path: path.join(ROOT, st.file), x: 4.95, y: 0.85, w: 7.9, h: 4.94 });
  t.addShape(pres.ShapeType.roundRect, { x: 4.95, y: 5.95, w: 7.9, h: 0.95, fill: { color: NAVY }, line: { color: NAVY }, rectRadius: 0.08 });
  t.addText([{ text: 'RESULT  ', options: { bold: true, color: GOLD, fontSize: 9.5, charSpacing: 2 } }, { text: st.result || '—', options: { color: WHITE } }], { x: 5.15, y: 6.0, w: 7.5, h: 0.85, fontFace: BODY, fontSize: 11, valign: 'middle', isTextBox: true, margin: 0, fit: 'shrink' });
  t.addNotes(`${p.title} step ${Number(st.n)}: ${st.step}. Who: ${st.persona ? st.persona.name + ', ' + st.persona.role : 'n/a'}. Screen: ${st.screen}. Do: ${st.action}. Result: ${st.result}. Control: ${st.rule}`);
  footer(t); page++;
};

const closeupSlide = (p, st) => {
  const t = pres.addSlide(); t.background = { color: WHITE };
  t.addText(`${p.title}  ·  step ${Number(st.n)} of ${p.steps.length}  ·  close-up`, { x: 0.5, y: 0.4, w: 8, h: 0.3, fontFace: BODY, fontSize: 11, bold: true, color: DEEP, charSpacing: 1, isTextBox: true, margin: 0 });
  chip(t, 0.5, 0.85, 0.5, num(p) + '.' + st.n, { size: 10 });
  persona(t, 1.15, 0.89, 3.55, st);
  t.addText(st.step, { x: 0.5, y: 1.5, w: 4.2, h: 0.95, fontFace: HEAD, fontSize: 14, bold: true, color: INK, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
  let y = 2.55;
  if (st.inputs && st.inputs.length) {
    label(t, 0.5, y, 4.2, 'ENTER'); y += 0.25;
    const h = Math.min(1.9, 0.3 + st.inputs.length * 0.3);
    t.addText(st.inputs.map((i, k) => ({ text: i, options: { bullet: true, breakLine: k < st.inputs.length - 1, paraSpaceAfter: 2 } })), { x: 0.5, y, w: 4.2, h, fontFace: BODY, fontSize: 11, color: INK, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
    y += h + 0.1;
  } else {
    label(t, 0.5, y, 4.2, 'DO'); y += 0.25;
    t.addText(st.action || '—', { x: 0.5, y, w: 4.2, h: 1.0, fontFace: BODY, fontSize: 11, color: INK, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
    y += 1.1;
  }
  if (st.toasts && st.toasts.length) {
    label(t, 0.5, y, 4.2, 'SYSTEM SAID'); y += 0.27;
    for (const tx of st.toasts.slice(-3)) {
      t.addShape(pres.ShapeType.roundRect, { x: 0.5, y, w: 4.2, h: 0.42, fill: { color: NAVY }, line: { color: NAVY }, rectRadius: 0.06 });
      t.addText(tx, { x: 0.62, y, w: 4.0, h: 0.42, fontFace: BODY, fontSize: 10, color: WHITE, valign: 'middle', isTextBox: true, margin: 0, fit: 'shrink' });
      y += 0.5;
    }
    y += 0.05;
  }
  const remaining = 6.9 - y;
  if (remaining > 0.6) {
    label(t, 0.5, y, 4.2, 'RESULT'); y += 0.25;
    t.addText(st.result || '—', { x: 0.5, y, w: 4.2, h: Math.min(remaining - 0.25, 1.6), fontFace: BODY, fontSize: 11, color: INK, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
  }
  // Close-up image (or the full screen when no focus box was captured), fitted into 7.9 x 5.0
  const file = st.zoom ?? st.file;
  const iw = st.zoom ? st.box.w : 1440, ih = st.zoom ? st.box.h : 900;
  const BW = 7.9, BH = 5.0, aspect = iw / ih;
  let w = BW, h = BW / aspect; if (h > BH) { h = BH; w = BH * aspect; }
  const x = 4.95 + (BW - w) / 2, yy = 0.85 + (BH - h) / 2;
  t.addShape(pres.ShapeType.rect, { x: 4.95, y: 0.85, w: BW, h: BH, fill: { color: LIGHT }, line: { color: LINE, width: 0.75 } });
  t.addImage({ path: path.join(ROOT, file), x, y: yy, w, h });
  t.addShape(pres.ShapeType.rect, { x, y: yy, w, h, fill: { type: 'none' }, line: { color: GOLD, width: 2.25 } });
  t.addText(`${st.zoom ? 'Close-up of the highlighted area' : 'Full screen'}  ·  ${st.screen}`, { x: 4.95, y: 5.95, w: 7.9, h: 0.35, fontFace: BODY, fontSize: 10, color: INK2, isTextBox: true, margin: 0, fit: 'shrink' });
  t.addNotes(`${p.title} step ${Number(st.n)} close-up. Enter: ${(st.inputs || []).join('; ') || 'n/a'}. System said: ${(st.toasts || []).join(' · ') || 'n/a'}. Result: ${st.result}`);
  footer(t); page++;
};

for (const p of m.processes) {
  const s = pres.addSlide(); s.background = { color: NAVY };
  chip(s, 0.7, 0.7, 0.9, num(p), { size: 26 });
  s.addText(p.title, { x: 1.85, y: 0.5, w: 4.6, h: 1.3, fontFace: HEAD, fontSize: 30, bold: true, color: WHITE, valign: 'middle', isTextBox: true, margin: 0, fit: 'shrink' });
  s.addText(p.summary, { x: 0.7, y: 2.0, w: 5.6, h: 2.6, fontFace: BODY, fontSize: 15, color: 'CADCFC', valign: 'top', isTextBox: true, margin: 0 });
  s.addText([{ text: 'Source flow  ', options: { bold: true, color: GOLD } }, { text: p.pdf, options: { color: WHITE } }], { x: 0.7, y: 5.2, w: 5.6, h: 0.45, fontFace: BODY, fontSize: 12, isTextBox: true, margin: 0 });
  s.addText([{ text: 'Personas  ', options: { bold: true, color: GOLD } }, { text: p.persona, options: { color: WHITE } }], { x: 0.7, y: 5.65, w: 5.6, h: 0.45, fontFace: BODY, fontSize: 12, isTextBox: true, margin: 0 });
  s.addText([{ text: 'Steps  ', options: { bold: true, color: GOLD } }, { text: `${p.steps.length} steps, ${p.steps.length * 2} slides`, options: { color: WHITE } }], { x: 0.7, y: 6.1, w: 5.6, h: 0.45, fontFace: BODY, fontSize: 12, isTextBox: true, margin: 0 });
  const stepSize = p.steps.length > 12 ? 10.5 : 12;
  const lines = p.steps.map((st, i) => ({ text: `${num(p)}.${st.n}   ${st.step}`, options: { breakLine: i < p.steps.length - 1, paraSpaceAfter: 3 } }));
  s.addShape(pres.ShapeType.roundRect, { x: 6.7, y: 0.7, w: 6.1, h: 6.1, fill: { color: PANEL }, line: { color: PANEL }, rectRadius: 0.12 });
  s.addText('Steps in this flow', { x: 6.95, y: 0.85, w: 5.6, h: 0.35, fontFace: BODY, fontSize: 11, bold: true, color: GOLD, charSpacing: 2, isTextBox: true, margin: 0 });
  s.addText(lines, { x: 6.95, y: 1.25, w: 5.6, h: 5.4, fontFace: BODY, fontSize: stepSize, color: WHITE, valign: 'top', isTextBox: true, margin: 0, fit: 'shrink' });
  s.addNotes(`${p.title}. Source: ${p.pdf}. ${p.summary}`);
  page++;
  for (const st of p.steps) { overviewSlide(p, st); closeupSlide(p, st); }
}
// Closing
{
  const s = pres.addSlide(); s.background = { color: NAVY };
  s.addText('Where to open BrokerVerse', { x: 0.7, y: 0.7, w: 11, h: 0.9, fontFace: HEAD, fontSize: 36, bold: true, color: WHITE, isTextBox: true, margin: 0 });
  const rows = [
    ['Demo with sample data', 'https://claude.ai/artifact/J5CoEBTpXYt77pVyruPQ5v', 'Sign in as admin / Admin@123, or any persona with Broker@123. Actions are simulated.'],
    ['Illustrated walkthrough', 'https://claude.ai/artifact/EFoSW1GzSezVPJ8QhgeKvi', 'The same steps as this deck, with full-size captures and close-ups.'],
    ['Full platform on your machine', 'npm install  ·  npm run setup  ·  npm run dev', 'Then browse to http://localhost:5173. Docker: docker compose up --build serves http://localhost:8080.'],
    ['Regenerate the screens', 'npm run walkthrough', 'Re-runs every process in a browser against a running local stack and rebuilds the page and this deck.'],
  ];
  rows.forEach(([h, v, d], i) => {
    const y = 1.9 + i * 1.2;
    chip(s, 0.7, y + 0.05, 0.45, String(i + 1), { size: 14 });
    s.addText(h, { x: 1.4, y, w: 4.2, h: 0.5, fontFace: BODY, fontSize: 16, bold: true, color: GOLD, valign: 'middle', isTextBox: true, margin: 0 });
    s.addText(v, { x: 5.7, y, w: 7.0, h: 0.5, fontFace: 'Courier New', fontSize: 12, color: WHITE, valign: 'middle', isTextBox: true, margin: 0, fit: 'shrink' });
    s.addText(d, { x: 1.4, y: y + 0.5, w: 11.3, h: 0.5, fontFace: BODY, fontSize: 12, color: 'CADCFC', valign: 'top', isTextBox: true, margin: 0 });
  });
  s.addShape(pres.ShapeType.roundRect, { x: 9.9, y: 6.4, w: 2.75, h: 0.85, fill: { color: WHITE }, line: { color: WHITE }, rectRadius: 0.1 });
  s.addImage({ path: IORTA, x: 10.05, y: 6.5, w: 2.2, h: 0.66 });
  s.addNotes('Where to open the application and how to regenerate the walkthrough.');
}
pres.writeFile({ fileName: path.join(ROOT, 'BrokerVerse-Process-Walkthrough.pptx') }).then((f) => console.log('wrote', f, 'slides', page));
