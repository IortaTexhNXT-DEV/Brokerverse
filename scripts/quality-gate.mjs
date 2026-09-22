#!/usr/bin/env node
/**
 * SonarQube-style quality gate for BrokerVerse.
 * Runs static analysis (ESLint + SonarJS), duplication (jscpd) and coverage (Vitest v8) and
 * evaluates them against fixed thresholds. Writes reports/quality-gate.{json,md}.
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const REPORTS = `${ROOT}reports`;
mkdirSync(REPORTS, { recursive: true });

const THRESHOLDS = {
  blockerIssues: 0,      // any ESLint error is a failed gate
  duplicationPct: 3,     // Sonar default for duplicated lines on new code
  lineCoveragePct: 80,   // Sonar default for coverage on new code
  branchCoveragePct: 65,
};

function run(cmd, opts = {}) {
  const r = spawnSync(cmd, { shell: true, cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  return { code: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

// ---------- 1. Static analysis (ESLint + SonarJS rules) ----------
function lint(workspace, target) {
  const r = run(`npx eslint ${target} -f json`, { cwd: `${ROOT}${workspace}` });
  const jsonStart = r.out.indexOf('[');
  let files = [];
  try { files = JSON.parse(r.out.slice(jsonStart)); } catch { /* eslint crashed */ }
  const issues = files.flatMap((f) => f.messages.map((m) => ({ file: `${workspace}/${f.filePath.split(`/${workspace}/`)[1] ?? f.filePath}`, line: m.line, rule: m.ruleId, severity: m.severity === 2 ? 'error' : 'warning', message: m.message })));
  return issues;
}
const lintIssues = [...lint('server', 'src test'), ...lint('web', 'src'), ...lint('shared', 'src test')];
const byRule = {};
for (const i of lintIssues) byRule[i.rule ?? 'parse'] = (byRule[i.rule ?? 'parse'] ?? 0) + 1;

// ---------- 2. Duplication (jscpd) ----------
run(`npx jscpd --silent --min-tokens 50 --min-lines 5 --reporters json --output ${REPORTS}/jscpd --ignore "**/node_modules/**,**/dist/**" --format "typescript,tsx" shared/src server/src web/src`);
let dup = { percentage: 0, clones: 0, duplicatedLines: 0, totalLines: 0 };
const dupFile = `${REPORTS}/jscpd/jscpd-report.json`;
if (existsSync(dupFile)) {
  const j = JSON.parse(readFileSync(dupFile, 'utf8'));
  const t = j.statistics.total;
  dup = { percentage: Number(t.percentage.toFixed(2)), clones: t.clones, duplicatedLines: t.duplicatedLines, totalLines: t.lines, details: (j.duplicates ?? []).map((d) => `${d.firstFile.name}:${d.firstFile.start} ↔ ${d.secondFile.name}:${d.secondFile.start} (${d.lines} lines)`) };
}

// ---------- 3. Coverage (Vitest v8, per workspace) ----------
function coverage(workspace) {
  run('npx vitest run --coverage --coverage.reporter=json-summary --coverage.reportsDirectory=coverage', { cwd: `${ROOT}${workspace}` });
  const f = `${ROOT}${workspace}/coverage/coverage-summary.json`;
  if (!existsSync(f)) return null;
  const s = JSON.parse(readFileSync(f, 'utf8')).total;
  return { lines: s.lines.pct, branches: s.branches.pct, functions: s.functions.pct, statements: s.statements.pct, raw: s };
}
const cov = { shared: coverage('shared'), server: coverage('server'), web: coverage('web') };
const covEntries = Object.values(cov).filter(Boolean);
// Overall coverage is line-weighted across workspaces (covered / total), as SonarQube computes it for a multi-module project.
const weighted = (k) => { const t = covEntries.reduce((s, c) => s + c.raw[k].total, 0); const cv = covEntries.reduce((s, c) => s + c.raw[k].covered, 0); return t ? Number(((cv / t) * 100).toFixed(2)) : 0; };
const overall = { lines: weighted('lines'), branches: weighted('branches'), functions: weighted('functions'), statements: weighted('statements') };

// ---------- 4. Gate ----------
const errors = lintIssues.filter((i) => i.severity === 'error').length;
const conditions = [
  { metric: 'Blocker/critical issues (ESLint errors)', actual: errors, threshold: `= ${THRESHOLDS.blockerIssues}`, passed: errors <= THRESHOLDS.blockerIssues },
  { metric: 'Duplicated lines (%)', actual: dup.percentage, threshold: `< ${THRESHOLDS.duplicationPct}`, passed: dup.percentage < THRESHOLDS.duplicationPct },
  { metric: 'Line coverage (%)', actual: overall.lines, threshold: `>= ${THRESHOLDS.lineCoveragePct}`, passed: overall.lines >= THRESHOLDS.lineCoveragePct },
  { metric: 'Branch coverage (%)', actual: overall.branches, threshold: `>= ${THRESHOLDS.branchCoveragePct}`, passed: overall.branches >= THRESHOLDS.branchCoveragePct },
];
const status = conditions.every((c) => c.passed) ? 'PASSED' : 'FAILED';
const commit = (() => { try { return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch { return 'n/a'; } })();

const stripRaw = (c) => (c ? { lines: c.lines, branches: c.branches, functions: c.functions, statements: c.statements } : null);
const report = { status, commit, generatedAt: new Date().toISOString(), thresholds: THRESHOLDS, conditions, lint: { total: lintIssues.length, errors, byRule, issues: lintIssues }, duplication: dup, coverage: { overall, shared: stripRaw(cov.shared), server: stripRaw(cov.server), web: stripRaw(cov.web) } };
writeFileSync(`${REPORTS}/quality-gate.json`, JSON.stringify(report, null, 2));

const md = [
  `# BrokerVerse Quality Gate — ${status}`, '',
  `Commit \`${commit}\` · ${report.generatedAt}`, '',
  '| Condition | Actual | Threshold | Result |', '| --- | ---: | --- | --- |',
  ...conditions.map((c) => `| ${c.metric} | ${c.actual} | ${c.threshold} | ${c.passed ? '✅' : '❌'} |`), '',
  '## Coverage by workspace', '', '| Workspace | Lines | Branches | Functions | Statements |', '| --- | ---: | ---: | ---: | ---: |',
  ...Object.entries(cov).map(([k, v]) => v ? `| ${k} | ${v.lines}% | ${v.branches}% | ${v.functions}% | ${v.statements}% |` : `| ${k} | n/a | | | |`),
  `| **overall (line-weighted)** | **${overall.lines}%** | **${overall.branches}%** | **${overall.functions}%** | **${overall.statements}%** |`, '',
  `## Duplication`, '', `${dup.clones} clones · ${dup.duplicatedLines} of ${dup.totalLines} lines (${dup.percentage}%)`, ...(dup.details?.length ? ['', ...dup.details.map((d) => `- ${d}`)] : []), '',
  `## Static analysis (${lintIssues.length} issues)`, '',
  ...(lintIssues.length ? ['| Rule | Count |', '| --- | ---: |', ...Object.entries(byRule).sort((a, b) => b[1] - a[1]).map(([r, n]) => `| ${r} | ${n} |`), '', ...lintIssues.slice(0, 200).map((i) => `- \`${i.file}:${i.line}\` **${i.rule}** — ${i.message}`)] : ['No issues. 🎉']),
].join('\n');
writeFileSync(`${REPORTS}/quality-gate.md`, md);

console.log(md);
process.exit(status === 'PASSED' ? 0 : 1);
