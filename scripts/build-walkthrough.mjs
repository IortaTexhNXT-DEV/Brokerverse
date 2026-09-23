#!/usr/bin/env node
/**
 * Builds docs/process-walkthrough/index.html and README.md from manifest.json
 * (produced by the Playwright capture in e2e/walkthrough.mjs): one section per BDOI
 * process flow; for each step, who acts, what they do, what they enter, what the system
 * answers and which control applies, beside the full screen (acted-on area highlighted)
 * and a close-up of that area.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'docs/process-walkthrough');
const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const total = manifest.processes.reduce((n, p) => n + p.steps.length, 0);
const shotSrc = (file) => (process.env.WALKTHROUGH_ASSET_PREFIX ?? '') + file;
const no = (p) => p.id.slice(0, 2);

const toc = manifest.processes.map((p) => `<li><a href="#${p.id}"><span class="num">${no(p)}</span> ${esc(p.title)} <span class="cnt">${p.steps.length} steps</span></a></li>`).join('\n');

const stepHtml = (p, s) => {
  const who = s.persona ? `<span class="who"><span class="avatar">${esc(s.persona.name.split(' ').map((w) => w[0]).join('').slice(0, 2))}</span><span><b>${esc(s.persona.name)}</b><br />${esc(s.persona.role)}</span></span>` : '';
  const inputs = s.inputs?.length ? `<dt>Enter</dt><dd><ul>${s.inputs.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></dd>` : '';
  const toasts = s.toasts?.length ? `<dt>System said</dt><dd class="toasts">${s.toasts.map((t) => `<span class="toast">${esc(t)}</span>`).join('')}</dd>` : '';
  const zoom = s.zoom ? `<figure class="zoom"><a href="${shotSrc(s.zoom)}" target="_blank" rel="noopener"><img loading="lazy" src="${shotSrc(s.zoom)}" alt="Close-up: ${esc(s.screen)}" width="${s.box?.w ?? 560}" height="${s.box?.h ?? 220}" /></a><figcaption>Close-up of the highlighted area</figcaption></figure>` : '';
  return `    <li class="step" id="${p.id}-${s.n}">
      <div class="step-text">
        <div class="step-top"><span class="step-no">${no(p)}.${s.n}</span>${who}</div>
        <h3>${esc(s.step)}</h3>
        <dl>
          <dt>Screen</dt><dd class="screen">${esc(s.screen)}</dd>
          ${s.action ? `<dt>Do</dt><dd>${esc(s.action)}</dd>` : ''}
          ${inputs}
          ${s.result ? `<dt>Result</dt><dd>${esc(s.result)}</dd>` : ''}
          ${toasts}
          ${s.rule ? `<dt>Control</dt><dd class="rule">${esc(s.rule)}</dd>` : ''}
        </dl>
      </div>
      <div class="step-media">
        <figure><a href="${shotSrc(s.file)}" target="_blank" rel="noopener"><img loading="lazy" src="${shotSrc(s.file)}" alt="${esc(s.screen)}" width="1440" height="900" /></a><figcaption>Full screen, acted-on area outlined in gold</figcaption></figure>
        ${zoom}
      </div>
    </li>`;
};

const sections = manifest.processes.map((p) => `
<section id="${p.id}" class="process">
  <header class="process-head">
    <p class="eyebrow">Process flow ${no(p)} · <span class="mono">${esc(p.pdf)}</span></p>
    <h2>${esc(p.title)}</h2>
    <p class="lede">${esc(p.summary)}</p>
    <p class="meta">Personas in this walkthrough: <b>${esc(p.persona)}</b> · ${p.steps.length} steps</p>
    <ol class="steplist">${p.steps.map((s) => `<li><a href="#${p.id}-${s.n}">${esc(s.step)}</a></li>`).join('')}</ol>
  </header>
  <ol class="steps">
${p.steps.map((s) => stepHtml(p, s)).join('\n')}
  </ol>
</section>`).join('\n');

const html = `<title>BrokerVerse Process Walkthrough</title>
<meta name="description" content="Each BDOI process flow step shown against the BrokerVerse screen that implements it, with who acts, what they enter and what the system answers." />
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
:root { --navy: #002B7F; --deep: #0A49B8; --gold: #FFC400; --bg: #F5F7FB; --card: #FFFFFF; --ink: #14213D; --ink2: #5B6478; --line: #D9DFEA; --tint: #EEF3FC; --shadow: 0 1px 2px rgba(0,43,127,.08), 0 8px 24px rgba(0,43,127,.06); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0E1526; --card: #182135; --ink: #E8EEFB; --ink2: #A6B1C9; --line: #2A3650; --tint: #1E2A45; --navy: #9DB8F5; --deep: #BFD2FF; --shadow: 0 1px 2px rgba(0,0,0,.4); } }
:root[data-theme="dark"] { --bg: #0E1526; --card: #182135; --ink: #E8EEFB; --ink2: #A6B1C9; --line: #2A3650; --tint: #1E2A45; --navy: #9DB8F5; --deep: #BFD2FF; --shadow: 0 1px 2px rgba(0,0,0,.4); }
* { box-sizing: border-box; } html { scroll-behavior: smooth; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 15px; line-height: 1.5; }
.wrap { max-width: 1240px; margin: 0 auto; padding-block: 32px 64px; padding-inline: 16px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
h1 { font-family: Georgia, "Times New Roman", serif; font-size: clamp(28px, 4vw, 40px); color: var(--navy); margin: 0 0 8px; text-wrap: balance; letter-spacing: -.01em; }
h2 { font-family: Georgia, "Times New Roman", serif; font-size: 26px; color: var(--navy); margin: 0 0 8px; text-wrap: balance; }
h3 { font-size: 17px; margin: 8px 0 10px; font-weight: 600; text-wrap: balance; line-height: 1.35; }
.eyebrow { text-transform: uppercase; letter-spacing: .08em; font-size: 12px; color: var(--ink2); margin: 0 0 6px; font-weight: 600; }
.lede { color: var(--ink2); max-width: 70ch; margin: 0 0 6px; } .meta { font-size: 13px; color: var(--ink2); margin: 0 0 10px; }
.hero { display: grid; gap: 8px; padding-bottom: 20px; border-bottom: 3px solid var(--gold); margin-bottom: 24px; }
.hero .stats { display: flex; flex-wrap: wrap; gap: 10px 24px; font-size: 13px; color: var(--ink2); font-variant-numeric: tabular-nums; }
.hero .stats b { color: var(--ink); }
.legend { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 14px 18px; margin-bottom: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px 20px; font-size: 13.5px; box-shadow: var(--shadow); }
.legend b { color: var(--navy); }
.toc { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px 20px; margin-bottom: 36px; box-shadow: var(--shadow); }
.toc h2 { font-size: 15px; font-family: Inter, sans-serif; text-transform: uppercase; letter-spacing: .06em; color: var(--ink2); margin: 0 0 10px; }
.toc ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 4px 20px; }
.toc a { display: flex; gap: 10px; align-items: baseline; color: var(--ink); text-decoration: none; padding: 5px 0; border-bottom: 1px dashed var(--line); }
.toc a:hover { color: var(--deep); } .toc .num { font-family: ui-monospace, monospace; color: var(--deep); font-weight: 600; min-width: 2ch; }
.toc .cnt { margin-left: auto; color: var(--ink2); font-size: 12px; white-space: nowrap; }
.process { margin-bottom: 64px; scroll-margin-top: 16px; } .process-head { margin-bottom: 18px; padding-left: 14px; border-left: 4px solid var(--gold); }
.steplist { margin: 8px 0 0; padding-left: 22px; font-size: 13.5px; color: var(--ink2); columns: 2; column-gap: 28px; } .steplist li { break-inside: avoid; padding: 2px 0; } .steplist a { color: inherit; text-decoration: none; } .steplist a:hover { color: var(--deep); }
.steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 24px; }
.step { display: grid; grid-template-columns: minmax(280px, 36%) 1fr; gap: 22px; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 20px; box-shadow: var(--shadow); align-items: start; scroll-margin-top: 16px; }
.step-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.step-no { display: inline-block; font-family: ui-monospace, monospace; font-size: 12px; font-weight: 600; color: var(--navy); background: color-mix(in srgb, var(--gold) 28%, transparent); padding: 2px 8px; border-radius: 999px; }
.who { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ink2); line-height: 1.25; } .who b { color: var(--ink); }
.avatar { display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--navy); color: #fff; font-weight: 600; font-size: 12px; }
dl { margin: 0; display: grid; grid-template-columns: 72px 1fr; gap: 6px 12px; font-size: 13.5px; }
dt { text-transform: uppercase; letter-spacing: .06em; font-size: 10.5px; font-weight: 700; color: var(--ink2); padding-top: 3px; }
dd { margin: 0; } dd ul { margin: 0; padding-left: 18px; } dd li { margin: 1px 0; }
dd.screen { font-weight: 600; color: var(--navy); } dd.rule { background: var(--tint); border-radius: 6px; padding: 6px 8px; }
dd.toasts { display: flex; flex-direction: column; gap: 4px; } .toast { display: inline-block; background: var(--navy); color: #fff; border-radius: 6px; padding: 3px 8px; font-size: 12.5px; }
.step-media { display: grid; gap: 12px; }
figure { margin: 0; overflow: hidden; border-radius: 8px; border: 1px solid var(--line); background: #fff; }
figure img { display: block; width: 100%; height: auto; max-width: 100%; }
figcaption { font-size: 12px; color: var(--ink2); padding: 6px 10px; border-top: 1px solid var(--line); background: var(--card); }
figure.zoom { border-color: var(--gold); }
footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--line); font-size: 13px; color: var(--ink2); }
a:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }
@media (max-width: 820px) { .step { grid-template-columns: 1fr; } .steplist { columns: 1; } }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
</style>
<div class="wrap">
  <header class="hero">
    <p class="eyebrow">BrokerVerse · BDO Insurance &amp; Reinsurance Brokers · delivered by iorta TechNXT</p>
    <h1>Process flow to screen walkthrough</h1>
    <p class="lede">Every step of the sixteen signed-off BDOI process flows, shown step by step against the BrokerVerse screen that performs it: who acts, what they click, what they enter, what the system answers and which control applies. Screens were captured from the running platform while the real journeys executed with the responsible persona.</p>
    <div class="stats"><span><b>${manifest.processes.length}</b> process flows</span><span><b>${total}</b> steps</span><span><b>${total * 2}</b> captured images</span><span>captured <b>${esc(manifest.generatedAt.slice(0, 10))}</b></span><span>demo data · all names are sample records</span></div>
  </header>
  <div class="legend">
    <div><b>Screen</b> the menu › tab › action in BrokerVerse</div>
    <div><b>Do</b> what the persona does on that screen</div>
    <div><b>Enter</b> the values keyed in or chosen</div>
    <div><b>Result</b> what the system answers, and the toast it showed</div>
    <div><b>Control</b> the business rule or check enforced at that step</div>
    <div><b>Gold outline</b> the acted-on area, repeated as a close-up</div>
  </div>
  <nav class="toc" aria-label="Process flows"><h2>Process flows</h2><ol>
${toc}
  </ol></nav>
${sections}
  <footer>Source flows: <span class="mono">docs/process-flows/*.pdf</span> · conformance matrix: <span class="mono">docs/process-conformance.md</span> · regenerate with <span class="mono">npm run walkthrough</span>.</footer>
</div>
`;
writeFileSync(resolve(dir, 'index.html'), html);

const md = [`# Process flow → screen walkthrough`, '', `Each step of the sixteen BDOI process flows against the BrokerVerse screen that performs it, with who acts, what they do, what they enter, what the system answers and which control applies. ${total} steps captured from the running platform on ${manifest.generatedAt.slice(0, 10)}. Open \`index.html\` for the illustrated version; regenerate with \`npm run walkthrough\`.`, ''];
for (const p of manifest.processes) {
  md.push(`## ${no(p)}. ${p.title}`, '', `Source: \`${p.pdf}\` · personas: ${p.persona}`, '', p.summary, '');
  for (const s of p.steps) {
    md.push(`### ${no(p)}.${s.n} ${s.step}`, '');
    if (s.persona) md.push(`- **Who:** ${s.persona.name}, ${s.persona.role}`);
    md.push(`- **Screen:** ${s.screen}`);
    if (s.action) md.push(`- **Do:** ${s.action}`);
    if (s.inputs?.length) md.push(`- **Enter:** ${s.inputs.join('; ')}`);
    if (s.result) md.push(`- **Result:** ${s.result}`);
    if (s.toasts?.length) md.push(`- **System said:** ${s.toasts.join(' · ')}`);
    if (s.rule) md.push(`- **Control:** ${s.rule}`);
    md.push(`- **Capture:** [${s.file.split('/').pop()}](${s.file})${s.zoom ? ` · [close-up](${s.zoom})` : ''}`, '');
  }
}
writeFileSync(resolve(dir, 'README.md'), md.join('\n'));
console.log(`walkthrough: ${manifest.processes.length} processes, ${total} steps → docs/process-walkthrough/index.html`);
