# BrokerVerse

Core insurance-broking platform by **iorta TechNXT** – sixteen BRD modules, twelve personas, maker-checker on every financial decision and a double-entry ledger underneath.

| Layer | Stack |
| --- | --- |
| Web | React 18 · Vite · TypeScript · React Router (iorta TechNXT theme, light/dark) |
| API | Node 22 · Express · TypeScript · Zod · JWT |
| Data | PostgreSQL 16 (SQL migrations, seeded reference data) |
| Shared | `@brokerverse/shared` – personas, module registry, rating engine, screening, classification, ledger helpers |
| Tests | Vitest (domain + API integration + React), Playwright (real-browser, multi-persona) |

## Process conformance

The platform implements the sixteen BDOI high-level process flows. The step-by-step mapping (flow step → feature → API → test) is in [`docs/process-conformance.md`](docs/process-conformance.md).

## Quality gate (SonarQube-style)

```bash
npm run quality        # ESLint + SonarJS rules, jscpd duplication, Vitest coverage → reports/quality-gate.md
```

Gate conditions: 0 static-analysis errors · duplicated lines < 3% · line coverage ≥ 80% · branch coverage ≥ 65%. Rules enforced on every workspace: cognitive complexity ≤ 15, cyclomatic complexity ≤ 12, functions ≤ 120 lines, files ≤ 400 lines, ≤ 5 parameters, no nested ternaries, no duplicated string literals, no hard-coded credentials. `sonar-project.properties` is provided for a real SonarQube/SonarCloud scan.

## Modules

| Code | Module | What is built |
| --- | --- | --- |
| NB | New Business | Quotation with live rating (premium, VAT, DST, LGT, FST, commission), acceptance limits, survey flag, screening gate, bind → maker-checker issuance, invoice, e-policy email |
| OPS | Operations | Cashiering: official receipts against invoices (partial/full), posts Dr Cash / Cr Premium Receivable, receipt email |
| CLXN | Collections | Outstanding register with ageing buckets, statement of account, payment reminders |
| ADA | Accounting & Disbursement | Chart of accounts, proforma journals (balanced, open-period check), trial balance, period close/reopen, insurer remittance vouchers under maker-checker with cheque payment journal |
| CLM | Claims | Claims Acceptance Control (unpaid premium blocks registration), policy-period check, lifecycle registered → review → settlement approval → settled → closed, Preliminary Loss Advice email, timeline |
| RN | Renewal | Expiry pipeline, first/second/final notices in order, renewal re-rated at current rates with premium variance, checker approval, old term marked renewed |
| RI | Reinsurance | Treaty register with security-rating gate (BBB+) and capacity, per-policy cessions |
| EB | Employee Benefits | Corporate group schemes, census upload (upsert), member withdrawal, covered-lives premium |
| CSF | Customer Servicing | Multi-channel requests, caller identity verification (TIN/email), category → owning-unit routing, status flow |
| SS | Sanction Screening & Risk | Exact / fuzzy (Levenshtein) / phonetic (Soundex) matching against sanctions and PEP lists, weighted risk score → tier → CDD level, compliance disposition (false positive / decline), re-screen |
| PM | Product Maintenance | Rating parameters, statutory taxes, commission, acceptance limits, retire/reactivate, insurer panel |
| SP | Submitted Policies | Insurer masterlist upload → sanitise → match in-force → Masterlist / Renewal / Excluded / Fallout |
| UAM | User Access Maintenance | Joiner / mover / leaver, one persona per user, password reset, segregation-of-duties on self-changes |
| DM | Data Migration | Extract registration with control totals, load, count & value reconciliation, disposition gate |
| RPT | Reports & Analytics | Dashboard KPIs, production by product/month, claims position, production register with CSV export |
| CORE | Approvals & Audit | Maker-checker queue (maker ≠ checker), per-action audit trail, email outbox |

Cross-cutting: JWT auth, server-side persona entitlement (hand-typed URLs refused), document numbering (`POL-2026-00001`, `INV-`, `OR-`, `JV-`, `CLM-`, `PV-`…), audit log on every mutation.

## Personas (demo logins)

`admin / Admin@123`, and with password `Broker@123`: `nb.officer`, `uw.head` (checker), `cashier`, `collections`, `accountant`, `fin.head` (checker), `claims`, `renewals`, `ri.officer`, `eb.officer`, `compliance` (checker).

## Run it

### Option A — Docker (recommended on Windows; one command)

Requires Docker Desktop. From the repository root:

```bash
docker compose up --build
```

Then open **http://localhost:8080** and sign in as `admin / Admin@123` (or any demo persona with `Broker@123`). The stack runs PostgreSQL, the API (migrated and seeded on first start) and the web app behind nginx, all with health checks and restart policies.

### Option B — Local Node + PostgreSQL

Prerequisites: Node 20+ and a PostgreSQL 14+ server you can reach (local install, or `docker compose up db` for just the database).

```bash
npm install
npm run setup     # creates .env from .env.example, creates the databases, migrates and seeds
npm run dev       # API on http://localhost:4000, web on http://localhost:5173
```

Open **http://localhost:5173**. `npm run setup` works on Windows PowerShell / CMD as well as macOS and Linux; it does not need `createdb`. If PostgreSQL uses a different user or password, edit `DATABASE_URL` in `.env` before running setup.

**"localhost refused to connect" checklist**

1. `npm run dev` must still be running in a terminal; the app is served only while it runs.
2. PostgreSQL must be running; `npm run setup` reports if it cannot reach it.
3. Port 5173 (or 4000) already in use: stop the other process or set `PORT` in `.env`.
4. On Windows, run the commands in the repository folder (for example `I:\BrokerVerseApp` after copying this branch there).

### Production deployment

- Set `NODE_ENV=production`, a random `JWT_SECRET` of at least 32 characters, and `CORS_ORIGIN` to the web origin. The server refuses to start otherwise.
- Set `SEED_DEMO=false` so demo personas are not created; the `admin` account is created once and its password must be changed on first use through User Access Maintenance.
- Run behind TLS (nginx image already proxies `/api`); set `TRUST_PROXY=true` when a proxy sits in front of the API.
- Probes: `GET /api/health` (liveness) and `GET /api/ready` (database + migrations). Structured JSON request logs go to stdout.
- Sign-in is rate-limited per IP and username (`LOGIN_RATE_LIMIT` attempts per `LOGIN_RATE_WINDOW_SEC`, default 10 per 5 minutes). Raise it for automated test runs (the Playwright config sets 1000).
- External integrations are delivered as seams: email is captured to the outbox table (wire SMTP), placement slips and e-policies via SFTP are modelled as channels (wire the COG/SFTP job), and legacy systems (Ebix, QPS, ISYS) are out of scope.

### Quality gates

```bash
npm run lint && npm run typecheck && npm test   # shared + server (Postgres) + web
npm run build && npm run test:e2e               # Playwright: process journeys and every persona × menu
npm run quality                                 # SonarQube-style gate → reports/quality-gate.md
```

## Layout

```
shared/   domain logic and registries shared by server and web
server/   Express API, SQL migrations, seed, integration tests
web/      React app (iorta TechNXT theme), component tests
e2e/      Playwright browser tests
```

## Environment

See `.env.example`. `SEED_DEMO=true` seeds the demo personas and reference data on start (default in Docker). Emails are captured to the outbox table; wire an SMTP relay for production.

## Demo mode (no server)

`npm run build:demo -w web` produces `web/dist-demo`, a static build that runs entirely in the browser: a mock API answers every endpoint with sample data and simulated write results, so all sixteen modules can be walked through from any static host. A gold banner marks demo mode. Sign in as `admin / Admin@123` or any persona with `Broker@123`. The full platform still needs PostgreSQL (`npm run setup && npm run dev`).

## Process flow → screen walkthrough

`docs/process-walkthrough/index.html` shows every step of the sixteen BDOI process flows against the screen that performs it (111 screens captured from the running platform with the responsible personas). `docs/process-walkthrough/README.md` is the text index, and the same walkthrough ships as `BrokerVerse-Process-Walkthrough.pptx` and `.pdf` in that folder (`scripts/build-walkthrough-deck.js`). Regenerate the screens against a running local stack with `npm run walkthrough`.
