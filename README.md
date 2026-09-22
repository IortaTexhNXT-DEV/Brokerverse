# BrokerVerse

Core insurance-broking platform by **iorta TechNXT** – sixteen BRD modules, twelve personas, maker-checker on every financial decision and a double-entry ledger underneath.

| Layer | Stack |
| --- | --- |
| Web | React 18 · Vite · TypeScript · React Router (iorta TechNXT theme, light/dark) |
| API | Node 22 · Express · TypeScript · Zod · JWT |
| Data | PostgreSQL 16 (SQL migrations, seeded reference data) |
| Shared | `@brokerverse/shared` – personas, module registry, rating engine, screening, classification, ledger helpers |
| Tests | Vitest (domain + API integration + React), Playwright (real-browser, multi-persona) |

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

### Docker (one command)

```bash
docker compose up --build
# web: http://localhost:8080   api: http://localhost:4000/api/health
```

### Local development

```bash
npm install
cp .env.example .env            # adjust DATABASE_URL if needed
createdb brokerverse && createdb brokerverse_test
npm run db:reset                # migrate + seed reference and demo data
npm run dev                     # API on :4000, web on :5173 (proxies /api)
```

### Quality gates

```bash
npm run lint && npm run typecheck && npm test   # shared + server (Postgres) + web
npm run build && npm run test:e2e               # Playwright, real browser, five personas
```

The end-to-end test walks one account through the platform: the NB officer screens a client and quotes, the Underwriting Head approves, Claims is blocked by Claims Acceptance Control, the Cashier receives the premium, Collections clears, and the claim registers.

## Layout

```
shared/   domain logic and registries shared by server and web
server/   Express API, SQL migrations, seed, integration tests
web/      React app (iorta TechNXT theme), component tests
e2e/      Playwright browser tests
```

## Environment

See `.env.example`. `SEED_DEMO=true` seeds the demo personas and reference data on start (default in Docker). Emails are captured to the outbox table; wire an SMTP relay for production.
