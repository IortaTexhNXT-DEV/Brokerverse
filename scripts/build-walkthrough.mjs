#!/usr/bin/env node
/**
 * Builds docs/process-walkthrough/index.html and README.md from manifest.json
 * (produced by the Playwright capture in e2e/walkthrough.mjs): one section per BDOI
 * process flow, each step against the screen that implements it.
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

const toc = manifest.processes.map((p) => `<li><a href="#${p.id}"><span class="num">${p.id.slice(0, 2)}</span> ${esc(p.title)} <span class="cnt">${p.steps.length} screens</span></a></li>`).join('\n');
const sections = manifest.processes.map((p) => `
<section id="${p.id}" class="process">
  <header class="process-head">
    <p class="eyebrow">Process flow ${p.id.slice(0, 2)} · <span class="mono">${esc(p.pdf)}</span></p>
    <h2>${esc(p.title)}</h2>
    <p class="lede">${esc(p.summary)}</p>
    <p class="meta">Personas in this walkthrough: <b>${esc(p.persona)}</b></p>
  </header>
  <ol class="steps">
${p.steps.map((s) => `    <li class="step">
      <div class="step-text">
        <span class="step-no">${p.id.slice(0, 2)}.${s.n}</span>
        <h3>${esc(s.step)}</h3>
        <p class="screen">Screen: <b>${esc(s.screen)}</b></p>${s.note ? `\n        <p class="note">${esc(s.note)}</p>` : ''}
      </div>
      <figure><a href="${shotSrc(s.file)}" target="_blank" rel="noopener"><img loading="lazy" src="${shotSrc(s.file)}" alt="${esc(s.screen)}" width="1440" height="900" /></a></figure>
    </li>`).join('\n')}
  </ol>
</section>`).join('\n');

const html = `<title>BrokerVerse Process Walkthrough</title>
<meta name="description" content="Each BDOI process flow step shown against the BrokerVerse screen that implements it." />
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
:root { --navy: #002B7F; --deep: #0A49B8; --gold: #FFC400; --bg: #F5F7FB; --card: #FFFFFF; --ink: #14213D; --ink2: #5B6478; --line: #D9DFEA; --shadow: 0 1px 2px rgba(0,43,127,.08), 0 8px 24px rgba(0,43,127,.06); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0E1526; --card: #182135; --ink: #E8EEFB; --ink2: #A6B1C9; --line: #2A3650; --navy: #9DB8F5; --deep: #BFD2FF; --shadow: 0 1px 2px rgba(0,0,0,.4); } }
:root[data-theme="dark"] { --bg: #0E1526; --card: #182135; --ink: #E8EEFB; --ink2: #A6B1C9; --line: #2A3650; --navy: #9DB8F5; --deep: #BFD2FF; --shadow: 0 1px 2px rgba(0,0,0,.4); }
* { box-sizing: border-box; } html { scroll-behavior: smooth; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 15px; line-height: 1.5; }
.wrap { max-width: 1180px; margin: 0 auto; padding-block: 32px 64px; padding-inline: 16px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
h1 { font-family: Georgia, "Times New Roman", serif; font-size: clamp(28px, 4vw, 40px); color: var(--navy); margin: 0 0 8px; text-wrap: balance; letter-spacing: -.01em; }
h2 { font-family: Georgia, "Times New Roman", serif; font-size: 26px; color: var(--navy); margin: 0 0 8px; text-wrap: balance; }
h3 { font-size: 16px; margin: 4px 0 6px; font-weight: 600; text-wrap: balance; }
.eyebrow { text-transform: uppercase; letter-spacing: .08em; font-size: 12px; color: var(--ink2); margin: 0 0 6px; font-weight: 600; }
.lede { color: var(--ink2); max-width: 70ch; margin: 0 0 6px; } .meta { font-size: 13px; color: var(--ink2); margin: 0; }
.hero { display: grid; gap: 8px; padding-bottom: 20px; border-bottom: 3px solid var(--gold); margin-bottom: 24px; }
.hero .stats { display: flex; flex-wrap: wrap; gap: 10px 24px; font-size: 13px; color: var(--ink2); font-variant-numeric: tabular-nums; }
.hero .stats b { color: var(--ink); }
.toc { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px 20px; margin-bottom: 36px; box-shadow: var(--shadow); }
.toc h2 { font-size: 15px; font-family: Inter, sans-serif; text-transform: uppercase; letter-spacing: .06em; color: var(--ink2); margin: 0 0 10px; }
.toc ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 4px 20px; }
.toc a { display: flex; gap: 10px; align-items: baseline; color: var(--ink); text-decoration: none; padding: 5px 0; border-bottom: 1px dashed var(--line); }
.toc a:hover { color: var(--deep); } .toc .num { font-family: ui-monospace, monospace; color: var(--deep); font-weight: 600; min-width: 2ch; }
.toc .cnt { margin-left: auto; color: var(--ink2); font-size: 12px; white-space: nowrap; }
.process { margin-bottom: 56px; scroll-margin-top: 16px; } .process-head { margin-bottom: 18px; padding-left: 14px; border-left: 4px solid var(--gold); }
.steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 22px; }
.step { display: grid; grid-template-columns: minmax(240px, 34%) 1fr; gap: 20px; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 18px; box-shadow: var(--shadow); align-items: start; }
.step-no { display: inline-block; font-family: ui-monospace, monospace; font-size: 12px; font-weight: 600; color: var(--navy); background: color-mix(in srgb, var(--gold) 28%, transparent); padding: 2px 8px; border-radius: 999px; }
.screen { margin: 0; font-size: 13.5px; color: var(--ink2); } .screen b { color: var(--ink); font-weight: 600; } .note { margin: 6px 0 0; font-size: 13px; color: var(--ink2); }
figure { margin: 0; overflow: hidden; border-radius: 8px; border: 1px solid var(--line); background: #fff; }
figure img { display: block; width: 100%; height: auto; max-width: 100%; }
footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--line); font-size: 13px; color: var(--ink2); }
a:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }
@media (max-width: 760px) { .step { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
</style>
<div class="wrap">
  <header class="hero">
    <p class="eyebrow">BrokerVerse · BDO Insurance &amp; Reinsurance Brokers · delivered by iorta TechNXT</p>
    <h1>Process flow to screen walkthrough</h1>
    <p class="lede">Every step of the sixteen signed-off BDOI process flows, shown against the BrokerVerse screen that performs it. Screens were captured from the running platform while the real journeys executed with the responsible persona: makers, checkers and approvers as the flows prescribe.</p>
    <div class="stats"><span><b>${manifest.processes.length}</b> process flows</span><span><b>${total}</b> captured screens</span><span>captured <b>${esc(manifest.generatedAt.slice(0, 10))}</b></span><span>demo data · all names are sample records</span></div>
  </header>
  <nav class="toc" aria-label="Process flows"><h2>Process flows</h2><ol>
${toc}
  </ol></nav>
${sections}
  <footer>Source flows: <span class="mono">docs/process-flows/*.pdf</span> · conformance matrix: <span class="mono">docs/process-conformance.md</span> · regenerate with <span class="mono">npm run walkthrough</span>.</footer>
</div>
`;
writeFileSync(resolve(dir, 'index.html'), html);

const md = [`# Process flow → screen walkthrough`, '', `Each step of the sixteen BDOI process flows against the BrokerVerse screen that performs it. ${total} screens captured from the running platform on ${manifest.generatedAt.slice(0, 10)}. Open \`index.html\` for the illustrated version; regenerate with \`npm run walkthrough\`.`, ''];
for (const p of manifest.processes) {
  md.push(`## ${p.id.slice(0, 2)}. ${p.title}`, '', `Source: \`${p.pdf}\` · personas: ${p.persona}`, '', p.summary, '', '| Step | Process step | Screen | Capture |', '| --- | --- | --- | --- |');
  for (const s of p.steps) md.push(`| ${p.id.slice(0, 2)}.${s.n} | ${s.step} | ${s.screen} | [${s.file.split('/').pop()}](${s.file}) |`);
  md.push('');
}
writeFileSync(resolve(dir, 'README.md'), md.join('\n'));
console.log(`walkthrough: ${manifest.processes.length} processes, ${total} screens → docs/process-walkthrough/index.html`);
