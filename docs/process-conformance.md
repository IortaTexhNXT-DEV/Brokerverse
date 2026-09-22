# Process conformance — BDOI high-level process flows → BrokerVerse

Source: `HL_Process_Overview.zip` (16 signed-off process flows). Each process step is mapped to the platform feature that enforces it, the API that implements it and the automated test that proves it.

Legend: ✅ enforced by the platform · 🔶 supported (recorded, not enforced) · ⛔ out of scope (external system)

## BDOIR end-to-end process

| Step in the flow | Platform | API | Test |
| --- | --- | --- | --- |
| Prospect/client → packaged? → create quotation/proposal; non-packaged → TSU quotation | ✅ `products.packaged`; non-packaged quotations require a TSU request with an approved proposal | `POST /new-business/quotations`, `/tsu/*` | `newBusiness.test` non-packaged |
| Send proposal → client accepts (Y/N) | ✅ `quoted → proposal_sent → accepted/declined` with decline reason | `/quotations/:id/send-proposal`, `/decision` | `newBusiness.test` order |
| Request placement → placement to insurer → e-policy / placement return | ✅ `placement_requested → placed / returned`, placement slip via SFTP or email, return reason handled and re-submitted | `/request-placement`, `/placement-response`, `/resubmit-placement` | same |
| Booking / invoicing (checker) | ✅ maker-checker `policy_issue`; invoice, journal, e-policy on approval | `/policies/:id/book`, `/approvals/:id/decide` | same |
| E-policy exception → contact centre | ✅ `epolicy_channel = contact_centre` with exception note | `/policies/:id/epolicy-exception` | same |
| Cancellation / adjustment → post transaction → refund | ✅ endorsements under checker-poster; refund raises an RRF | `/operations/endorsements` | `finance.test` endorsements |
| Cashiering: bills payment, OTC cash/cheque, files, autopay, direct payment to insurer | ✅ payment channels; cheque PDC hold 4 days → matured/bounced; exclusion tag | `/operations/payments*` | `finance.test` cashiering |
| Applied payment vs zero PR / payment > PR → unapplied | ✅ excess and zero-PR go to UPP (GL 2400) and are applied later | `/payments/:id/apply` | same |
| Direct payment → collect commission from insurer → commission OR | ✅ commission receivable (GL 1250): identify → bill → approve/reject → collect | `/operations/direct-payments*` | same |
| Outstanding premium → collect from client → fully paid | ✅ PR list with ageing and collection stage | `/collections/outstanding` | `finance.test` collections |
| Remittance: extract schedule → submit to disbursement | ✅ weekly extract excludes direct-paid and remitted policies; submission creates a disbursement | `/accounting/remittances*` | `finance.test` remittance |
| Disbursement: review → approve → post | ✅ maker → reviewer (SoD) → Finance Head approval → payment journal → confirmation email | `/disbursements/*` | same |
| GL: generate entries → financial reports → EOD/EOY closing | ✅ automatic journals, period close/reopen, fiscal year close to retained earnings | `/accounting/periods*`, `/fiscal-years/:y/close` | `finance.test` journals |
| ACSL: SOA recon with insurer → discrepancy → manual SL adjustment | ✅ statement vs ledger, adjustment journal under maker-checker | `/accounting/soa-recons*` | `finance.test` ACSL |
| Renewal: sanitised RMEL → RA letter to client | ✅ 140-day window, dispositions, timed notices | `/renewals/*` | `servicing.test` renewal |
| Claims: receive claim → documents → insurer → approved? → settlement / declination | ✅ full lifecycle below | `/claims/*` | `servicing.test` claims |

## New Business (CBG Motor, CBG Fire, Non-CBG, Branches)

| Step | Platform |
| --- | --- |
| MAO creates client in Broker | ✅ client creation with sanctions screening (`/clients`) |
| Quotation (IDF / ISYS) | ✅ rating engine (premium, VAT, DST, LGT, FST, commission), acceptance limits, survey threshold |
| Hold cover to insurer | ✅ `holdCoverDays` on quotation emails a hold-cover request |
| Accepted quotation with proof of payment | ✅ proposal acceptance recorded before placement |
| Placement slip via SFTP or email | ✅ channel by `insurers.sftp_enrolled` |
| Placement return → reason routed to marketing | ✅ `returned` with `return_reason`; resubmission |
| E-policy via COG (SFTP) or PO email; exception report → contact centre | ✅ `epolicy_channel`, exception fallout |
| Non-packaged → TSU / MTL review | ✅ TSU workflow required for non-packaged products |
| Booking cancellation via Adjustment Team | ✅ pre-booking cancel; post-booking cancellation endorsement |
| ISYS / QPS / Ebix migration steps | ⛔ external systems; BrokerVerse is the core |

## Operations

| Step | Platform |
| --- | --- |
| Batch files (bills payment, CLPC, PMS, trade, direct credit) | ✅ channels recorded on each payment |
| Hold cheques 4 days; bounced cheque list | ✅ `held → matured` after hold; `bounced` with exclusion tag |
| Exclusion list / zero PR / payment > PR | ✅ zero-PR and excess become unapplied; exclusion reason tagged |
| Remittance weekly extract, sanitise, posting by Disbursement | ✅ remittance schedule → disbursement chain |
| Adjustment/cancellation: validate → endorsement → checker-poster | ✅ endorsements approval type |
| Commission receivables (direct payment) → billing → follow-up → OR | ✅ direct-payment lifecycle |
| Production reconciliation: matched / with discrepancies / unbooked | ✅ `/operations/production-recons` with dispositions |
| DPPR reversal, EBIX invoicing menus | ⛔ legacy Ebix mechanics; journals are automatic here |

## Marketing Collections

| Step | Platform |
| --- | --- |
| PR list by market segment; marketing diary (when/where/how/what) | ✅ outstanding register; effort diary with mode, commitment, arrangement, contact |
| Newly booked: collect within 10–15 days; commitment within 60 days | ✅ collection stage flags (`newly_booked`, `within_credit_term`, `committed`, `overdue`, `escalate`) |
| Commitment outside credit term → inform MAO → CTE request → unit head approval | ✅ beyond-term flag emails MAO; CTE under maker-checker extends due date |
| Tagging status / category | ✅ effort categories |

## FRBS Accounting / Disbursement / Refund / ACSL

| Step | Platform |
| --- | --- |
| Chart of accounts maintenance | ✅ `POST /accounting/accounts` |
| System-generated journals; manual entries reviewed and posted by TL | ✅ manual journals are approval-posted |
| EOD/EOM/EOY; close nominal accounts to retained earnings | ✅ period close, fiscal-year close journal |
| Disbursement: DPO → DTL → DSH → DUH; confirmation email; status tagging | ✅ requester → reviewer → approver → payer with SoD; confirmation email |
| Refund request: RRF → MTL review → UH sign-off → Disbursement | ✅ `/refunds` submit → review → approve → disbursement |
| ACSL abnormal balances → adjustment → TL review → FRBS approver posts | ✅ SOA reconciliation → adjustment journal approval |

## Claims (motor and non-motor swim lanes)

| Step | Platform |
| --- | --- |
| Notice of loss; PLA | ✅ registration with Claims Acceptance Control; PLA email |
| Complete documents/requirements | ✅ checklist by line (motor vs CRF); FLA blocked until complete |
| Send to insurer (FLA); adjuster | ✅ `fla_sent` with adjuster flag |
| Evaluation → offer → insured accepts / contests → re-evaluation | ✅ `offer_received`, `offer_accepted`, `offer_contested` loop |
| Settlement: LOA to casa/dealer or cash; approval | ✅ settlement mode; `claim_settlement` approval |
| Tag settled / closed; declination | ✅ `settled → closed`, `declined` |

## Case management (customer servicing)

| Step | Platform |
| --- | --- |
| Account-related vs general inquiry | ✅ `case_type`; general inquiries close at point of contact |
| Positive identification (PID) | ✅ TIN/email challenge; failure blocks |
| Handled at point of contact vs referral to fulfilment unit | ✅ `handledAtPointOfContact`; routing by category to owning unit |
| TAT monitoring | ✅ `tat_due_at`, `past_tat` |
| Return case to CCC for re-logging | ✅ `returned` with reason → `open` |
| Servicing facility: search by invoice / policy / name; update contact | ✅ `/servicing/search`, `PATCH /servicing/clients/:id/contact` |

## Renewal (automated RMEL)

| Step | Platform |
| --- | --- |
| RMEL extract 140 days from expiry | ✅ pipeline window |
| Sanitation: identify accounts, disposition | ✅ `for_renewal`, `not_for_renewal` (NRNS letter), `client_declined`, `remarket` |
| RA letters: initial −70 days, final −40/45 days | ✅ enforced timings and order |
| Client accepts → placement → e-policy | ✅ acceptance gate; renewal enters placement lifecycle |

## Reinsurance

| Step | Platform |
| --- | --- |
| Facultative request; acknowledge within 24 h; slip within 3 working days | ✅ `ri_placements` with TAT flags |
| Complete underwriting information? | ✅ `info_incomplete` loop |
| Approach reinsurers; security rating; signed slips; closings & debit note | ✅ rating gate, signed-slip check, share completeness, debit note email |
| Treaties and cessions; capacity | ✅ existing treaty register |
| RI commission monitoring; RI claims | 🔶 tracked through commission receivables and claims; dedicated RI claims ledger not modelled |

## Submitted Policies

| Step | Platform |
| --- | --- |
| Masterlist: validate, match, consolidate | ✅ classification pipeline |
| Review adequacy → findings → IAAF | ✅ row review; IAAF issued and emailed |
| Send to sanitation handler 150 days from expiry | ✅ `/submitted-policies/expiring` |
| Renewal / conversion opportunity, NRNS | 🔶 surfaced in the expiring list; conversion proceeds through New Business |

## Employee Benefits

| Step | Platform |
| --- | --- |
| Renewal advice; BOR; master list & utilisation | ✅ scheme documents flags; census |
| TOR; release to insurers with franchise | ✅ `tor_prepared`; proposals requested |
| Comparative analysis (premium, benefits, capabilities) | ✅ proposals compared, sorted by premium |
| Client confirmation → placement; ISACOM for non-accredited | ✅ award; `eb_award` approval when insurer is not accredited |
| Handoff to processing and collections | ✅ handoff email on award |

## Product Maintenance (TSU)

| Step | Platform |
| --- | --- |
| PRF / TSU request; completeness and duplicate check | ✅ `/tsu` with duplicate detection; `incomplete` return |
| Quotation slip → TL approval → RI referral | ✅ transitions with approver gate |
| Send QS to insurers; responses (accepted with evidence / declined / conditional) | ✅ insurer responses; evidence required for acceptance |
| Comparative table → proposal slip → approval → marketing → client | ✅ `comparative_ready → proposal_approved` with selected insurer |
| Package creation / maintenance request → validation → release advisory | ✅ `product_change` approval publishes a release advisory |
