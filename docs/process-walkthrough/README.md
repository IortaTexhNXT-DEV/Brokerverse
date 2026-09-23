# Process flow → screen walkthrough

Each step of the sixteen BDOI process flows against the BrokerVerse screen that performs it. 111 screens captured from the running platform on 2026-09-23. Open `index.html` for the illustrated version; regenerate with `npm run walkthrough`.

## 01. BDOIR End-to-End

Source: `BDOIR E2E PROCESS FLOW.pdf` · personas: admin

The umbrella flow that chains new business, cashiering, collections, remittance, disbursement, the general ledger, renewal and claims. Each link is captured in detail in its own process below; these screens show the control points that tie the chain together.

| Step | Process step | Screen | Capture |
| --- | --- | --- | --- |
| 01.01 | Executive dashboard: KPIs across the whole chain (in force, in placement, unapplied payments, pending approvals, disbursements in flight, past-TAT requests) | Dashboard | [01.jpg](shots/01-bdoir-e2e/01.jpg) |
| 01.02 | Single maker-checker queue for bookings, endorsements, journals, disbursements, CTE, claim settlements, EB awards and product changes | Approvals & Audit › All | [02.jpg](shots/01-bdoir-e2e/02.jpg) |
| 01.03 | Production, collection and claims reports with CSV export | Reports & Analytics | [03.jpg](shots/01-bdoir-e2e/03.jpg) |
| 01.04 | Client onboarding with sanctions screening, PEP flag and risk tiering feeding every process | Sanction Screening & Risk | [04.jpg](shots/01-bdoir-e2e/04.jpg) |
| 01.05 | Twelve personas with module entitlements and approver rights (segregation of duties) | User Access Maintenance | [05.jpg](shots/01-bdoir-e2e/05.jpg) |
| 01.06 | Legacy data migration batches with load, reconciliation and disposition | Data Migration | [06.jpg](shots/01-bdoir-e2e/06.jpg) |

## 02. New Business

Source: `NEW BUSINESS.pdf` · personas: nb.officer → uw.head

Client creation and screening, quotation, proposal, placement to the insurer, e-policy and booking under maker-checker.

| Step | Process step | Screen | Capture |
| --- | --- | --- | --- |
| 02.01 | MAO creates the client in Broker; KYC details captured | Sanction Screening & Risk › New client form | [01.jpg](shots/02-new-business/01.jpg) |
| 02.02 | Client is sanction-screened automatically (clear / hit) and risk-tiered | Sanction Screening & Risk › Client register | [02.jpg](shots/02-new-business/02.jpg) |
| 02.03 | Quotation prepared with the rating engine (premium, VAT, DST, LGT, commission) | New Business › Quotations & proposals › New quotation form | [03.jpg](shots/02-new-business/03.jpg) |
| 02.04 | Quotation created (status: quoted); hold cover can be requested from the insurer | New Business › Quotations & proposals | [04.jpg](shots/02-new-business/04.jpg) |
| 02.05 | Proposal sent to the client by email (status: proposal sent) | New Business › Quotations & proposals › Send proposal | [05.jpg](shots/02-new-business/05.jpg) |
| 02.06 | Client acceptance recorded (Y); a decline with reason is the N branch | New Business › Quotations & proposals › Client accepted | [06.jpg](shots/02-new-business/06.jpg) |
| 02.07 | Placement requested: placement slip goes to the insurer via SFTP or email | New Business › Policy drawer (placement requested) | [07.jpg](shots/02-new-business/07.jpg) |
| 02.08 | Placement board tracks slips awaiting the insurer, returns and e-policies | New Business › Placement | [08.jpg](shots/02-new-business/08.jpg) |
| 02.09 | Insurer placed the risk; e-policy received (COG via SFTP or PO email) | New Business › Placement › Placed / e-policy received | [09.jpg](shots/02-new-business/09.jpg) |
| 02.10 | Booking and invoicing raised for checker approval (maker-checker) | New Business › Placement › Book & invoice | [10.jpg](shots/02-new-business/10.jpg) |
| 02.11 | Underwriting Head (checker) reviews the booking request | Approvals & Audit › Pending | [11.jpg](shots/02-new-business/11.jpg) |
| 02.12 | Booking approved: invoice, journal and e-policy dispatch are posted automatically | Approvals & Audit › Approve | [12.jpg](shots/02-new-business/12.jpg) |
| 02.13 | Policy register: the policy is in force with its invoice and e-policy channel | New Business › Policies | [13.jpg](shots/02-new-business/13.jpg) |
| 02.14 | Policy detail: placement history, e-policy status and the exception route to the contact centre | New Business › Policies › Policy detail | [14.jpg](shots/02-new-business/14.jpg) |

## 03. Operations

Source: `OPERATIONS PROCESS FLOW.pdf` · personas: cashier → checker

Cashiering channels, post-dated cheque hold, unapplied premium, direct payments with commission receivables, adjustments and production reconciliation.

| Step | Process step | Screen | Capture |
| --- | --- | --- | --- |
| 03.01 | Cashiering: open invoices (premium receivables) awaiting payment | Operations › Invoices & cashiering | [01.jpg](shots/03-operations/01.jpg) |
| 03.02 | Receive payment: channel (bills payment, OTC cash/cheque, batch files, autopay) and reference | Operations › Invoices & cashiering › Receive | [02.jpg](shots/03-operations/02.jpg) |
| 03.03 | Cheque payment recorded and held for the 4-day clearing period | Operations › Receive › Record payment | [03.jpg](shots/03-operations/03.jpg) |
| 03.04 | PDC register: held cheques, matured, bounced (exclusion list) and unapplied premium | Operations › Payments / PDC / UPP | [04.jpg](shots/03-operations/04.jpg) |
| 03.05 | Held cheque shows Matured / Bounced actions once the 4-day hold lapses | Operations › Payments / PDC / UPP › Held cheque | [05.jpg](shots/03-operations/05.jpg) |
| 03.06 | Cash / bills payment applied in full: official receipt issued and receivable cleared | Operations › Receive › Official receipt | [06.jpg](shots/03-operations/06.jpg) |
| 03.07 | Payment with zero PR / payment greater than PR is recorded without an invoice | Operations › Invoices & cashiering › Payment without invoice | [07.jpg](shots/03-operations/07.jpg) |
| 03.08 | The amount sits in Unapplied Premium (GL 2400) until applied to an invoice | Operations › Payments / PDC / UPP | [08.jpg](shots/03-operations/08.jpg) |
| 03.09 | Direct payment to insurer identified for a booked policy | Operations › Direct payments › Identify | [09.jpg](shots/03-operations/09.jpg) |
| 03.10 | Commission receivable (GL 1250) billed to the insurer; follow-up until collected | Operations › Direct payments › Bill insurer | [10.jpg](shots/03-operations/10.jpg) |
| 03.11 | Commission collected: commission official receipt issued | Operations › Direct payments › Collect (commission OR) | [11.jpg](shots/03-operations/11.jpg) |
| 03.12 | Adjustment / cancellation validated by the Adjustment Team and routed to the checker-poster | Operations › Adjustments › Endorsement form | [12.jpg](shots/03-operations/12.jpg) |
| 03.13 | Endorsement pending checker approval; a refund creates a Refund Request Form (RRF) on approval | Operations › Adjustments | [13.jpg](shots/03-operations/13.jpg) |
| 03.14 | Production reconciliation: insurer production file matched against booked policies | Operations › Production recon › Upload | [14.jpg](shots/03-operations/14.jpg) |
| 03.15 | Rows classified as matched, with discrepancies, or unbooked; each gets a disposition | Operations › Production recon › Result | [15.jpg](shots/03-operations/15.jpg) |
| 03.16 | Checker-poster reviews the endorsement | Approvals & Audit › Pending | [16.jpg](shots/03-operations/16.jpg) |
| 03.17 | Endorsement posted: premium and commission reversed, RRF raised for the refund | Approvals & Audit › Approve | [17.jpg](shots/03-operations/17.jpg) |

## 04. Marketing Collections

Source: `MARKETING COLLECTIONS - Process Flow.pdf` · personas: collections → fin.head

Premium receivable list by stage, marketing diary, credit-term extension under approval and statement of account.

| Step | Process step | Screen | Capture |
| --- | --- | --- | --- |
| 04.01 | PR list: newly booked accounts to collect within 10–15 days; ageing and collection stage per invoice | Collections › Outstanding premium | [01.jpg](shots/04-marketing-collections/01.jpg) |
| 04.02 | Statement of account sent to the client | Collections › SOA | [02.jpg](shots/04-marketing-collections/02.jpg) |
| 04.03 | Marketing diary: when / where / how / what of each collection effort, commitment date and arrangement | Collections › Log effort | [03.jpg](shots/04-marketing-collections/03.jpg) |
| 04.04 | Commitment beyond the 60-day credit term: MAO informed, tagged as committed | Collections › Outstanding premium | [04.jpg](shots/04-marketing-collections/04.jpg) |
| 04.05 | Credit-term extension (CTE) requested for Unit Head approval | Collections › CTE | [05.jpg](shots/04-marketing-collections/05.jpg) |
| 04.06 | Effort diary per invoice with category tagging | Collections › Diary | [06.jpg](shots/04-marketing-collections/06.jpg) |
| 04.07 | Unit / Finance Head reviews the CTE request | Approvals & Audit › Pending | [07.jpg](shots/04-marketing-collections/07.jpg) |
| 04.08 | CTE approved: due date extended and account stays within term | Approvals & Audit › Approve | [08.jpg](shots/04-marketing-collections/08.jpg) |

## 05. FRBS Accounting

Source: `FRBS - ACCOUNTING.pdf` · personas: accountant → fin.head

Chart of accounts, system-generated journals, manual entries under review, trial balance, period and year-end closing.

| Step | Process step | Screen | Capture |
| --- | --- | --- | --- |
| 05.01 | System-generated journals (booking, receipts, commissions) and manual entry form routed to the TL for posting | Accounting & Disbursement › Journals | [01.jpg](shots/05-frbs-accounting/01.jpg) |
| 05.02 | Trial balance and financial reports generated from the ledger | Accounting & Disbursement › Trial balance | [02.jpg](shots/05-frbs-accounting/02.jpg) |
| 05.03 | EOD / EOM / EOY: period close and reopen, fiscal-year close to retained earnings | Accounting & Disbursement › Periods & year-end | [03.jpg](shots/05-frbs-accounting/03.jpg) |

## 06. Disbursement

Source: `DISBURSEMENT.pdf` · personas: accountant → admin (reviewer) → fin.head → accountant

Disbursement chain DPO → DTL → DSH → DUH with segregation of duties, payment posting and confirmation email; weekly remittance to insurers.

| Step | Process step | Screen | Capture |
| --- | --- | --- | --- |
| 06.01 | Weekly remittance extract of applied payments per insurer, sanitised and submitted to Disbursement | Accounting & Disbursement › Remittances | [01.jpg](shots/06-disbursement/01.jpg) |
| 06.02 | Disbursement request (DPO) with payee, amount, mode and bank details | Accounting & Disbursement › Disbursements › Request | [02.jpg](shots/06-disbursement/02.jpg) |
| 06.03 | Request awaits a reviewer other than the maker (segregation of duties) | Accounting & Disbursement › Disbursements | [03.jpg](shots/06-disbursement/03.jpg) |
| 06.04 | Team lead review (DTL) OK; routed to the Finance Head for approval | Accounting & Disbursement › Disbursements › Review OK | [04.jpg](shots/06-disbursement/04.jpg) |
| 06.05 | Finance Head (DSH / DUH) reviews the voucher | Approvals & Audit › Pending | [05.jpg](shots/06-disbursement/05.jpg) |
| 06.06 | Approved; ready for payment | Approvals & Audit › Approve | [06.jpg](shots/06-disbursement/06.jpg) |
| 06.07 | Payment posted with cheque reference; status tagged paid and confirmation email sent | Accounting & Disbursement › Disbursements › Pay | [07.jpg](shots/06-disbursement/07.jpg) |

## 07. Refund Request

Source: `REFUND REQUEST.pdf` · personas: accountant (TL) → fin.head (UH)

Refund Request Form raised from a cancellation, TL review, Unit Head sign-off and hand-off to the disbursement chain.

| Step | Process step | Screen | Capture |
| --- | --- | --- | --- |
| 07.01 | RRF register: refund raised by the endorsement with amount, mode and reason | Accounting & Disbursement › Refund requests | [01.jpg](shots/07-refund-request/01.jpg) |
| 07.02 | Marketing TL reviews the RRF | Accounting & Disbursement › Refund requests › TL review OK | [02.jpg](shots/07-refund-request/02.jpg) |
| 07.03 | Unit Head sign-off: a disbursement request is created for the refund | Accounting & Disbursement › Refund requests › UH approve | [03.jpg](shots/07-refund-request/03.jpg) |
| 07.04 | Refund enters the disbursement chain (review → approve → pay) | Accounting & Disbursement › Disbursements | [04.jpg](shots/07-refund-request/04.jpg) |

## 08. ACSL (Insurer SOA reconciliation)

Source: `ACSL.pdf` · personas: accountant → fin.head

Insurer statement of account reconciled against the ledger; abnormal balances raise adjustment entries reviewed by the TL and posted by the FRBS approver.

| Step | Process step | Screen | Capture |
| --- | --- | --- | --- |
| 08.01 | Insurer SOA lines captured against the ledger | Accounting & Disbursement › ACSL / SOA recon | [01.jpg](shots/08-acsl/01.jpg) |
| 08.02 | Variances flagged (abnormal balances, unknown items) for manual subsidiary-ledger adjustment | Accounting & Disbursement › ACSL / SOA recon › Result | [02.jpg](shots/08-acsl/02.jpg) |

## 09. Claims

Source: `CLAIMS PROCESS FLOW.pdf` · personas: claims → fin.head

Notice of loss, PLA, document checklist, FLA to the insurer, evaluation and offer, contest loop, settlement approval and closure.

| Step | Process step | Screen | Capture |
| --- | --- | --- | --- |
| 09.01 | Notice of loss registered against the policy (Claims Acceptance Control checks premium status) | Claims › Register | [01.jpg](shots/09-claims/01.jpg) |
| 09.02 | Preliminary Loss Advice (PLA) sent; claim opened with reserve | Claims › Register | [02.jpg](shots/09-claims/02.jpg) |
| 09.03 | Document checklist by line (motor / non-motor); FLA blocked until complete | Claims › Claim detail › Document checklist | [03.jpg](shots/09-claims/03.jpg) |
| 09.04 | All requirements received: documents complete | Claims › Claim detail | [04.jpg](shots/09-claims/04.jpg) |
| 09.05 | Formal Loss Advice sent to the insurer; adjuster inspection flagged | Claims › Claim detail › Send FLA | [05.jpg](shots/09-claims/05.jpg) |
| 09.06 | Insurer evaluation and offer received | Claims › Claim detail › Offer received | [06.jpg](shots/09-claims/06.jpg) |
| 09.07 | Insured contests the offer; re-evaluation loop with the insurer | Claims › Claim detail › Contest offer | [07.jpg](shots/09-claims/07.jpg) |
| 09.08 | Settlement by LOA to casa/dealer or cash requested for approval | Claims › Claim detail › Request settlement approval | [08.jpg](shots/09-claims/08.jpg) |
| 09.09 | Approver reviews the settlement | Approvals & Audit › Pending | [09.jpg](shots/09-claims/09.jpg) |
| 09.10 | Settlement approved | Approvals & Audit › Approve | [10.jpg](shots/09-claims/10.jpg) |
| 09.11 | Claim tagged settled / paid, then closed; declination is the alternative exit | Claims › Claim detail › Mark settled | [11.jpg](shots/09-claims/11.jpg) |

## 10. Case Management (To-Be)

Source: `CASE MANAGEMENT TO BE PROCESS FLOW_07152026.pdf` · personas: compliance

General vs account-related inquiries, positive identification, point-of-contact handling or referral to the fulfilment unit, TAT monitoring and return to CCC.

| Step | Process step | Screen | Capture |
| --- | --- | --- | --- |
| 10.01 | Contact logged: general inquiry (no client) vs account-related concern | Customer Servicing › Cases › Log case | [01.jpg](shots/10-case-management/01.jpg) |
| 10.02 | General inquiry handled and closed at point of contact | Customer Servicing › Cases | [02.jpg](shots/10-case-management/02.jpg) |
| 10.03 | Account-related concern: positive identification (PID) and routing to the owning unit with a TAT | Customer Servicing › Cases › Log case | [03.jpg](shots/10-case-management/03.jpg) |
| 10.04 | Case referred to the fulfilment unit; TAT due time computed and past-TAT flagged | Customer Servicing › Cases | [04.jpg](shots/10-case-management/04.jpg) |
| 10.05 | Case returned to the Customer Contact Centre for re-logging with a reason | Customer Servicing › Cases › Return to CCC | [05.jpg](shots/10-case-management/05.jpg) |
| 10.06 | Case re-logged and back in the open queue | Customer Servicing › Cases › Re-log | [06.jpg](shots/10-case-management/06.jpg) |

## 11. Customer Servicing Facility

Source: `CUSTOMER SERVICING FACILITY - Process Flow.pdf` · personas: compliance

Search by invoice, policy or client name; view policies, invoices and receipts; update contact details.

| Step | Process step | Screen | Capture |
| --- | --- | --- | --- |
| 11.01 | Servicing facility: search by invoice no., policy no. or client name | Customer Servicing › Servicing facility | [01.jpg](shots/11-customer-servicing-facility/01.jpg) |
| 11.02 | Client contact details updated from the facility | Customer Servicing › Servicing facility › Update contact | [02.jpg](shots/11-customer-servicing-facility/02.jpg) |

## 12. Renewal (RMEL)

Source: `RENEWAL (1).pdf` · personas: renewals

Renewal master expiry list 140 days out, sanitation and disposition, initial and final RA letters, client acceptance and renewal placement.

| Step | Process step | Screen | Capture |
| --- | --- | --- | --- |
| 12.01 | RMEL: policies expiring within 140 days, pending sanitation | Renewal › Pipeline | [01.jpg](shots/12-renewal/01.jpg) |
| 12.02 | Sanitation: disposition for renewal / remarket / not for renewal (NRNS letter) | Renewal › For renewal | [02.jpg](shots/12-renewal/02.jpg) |
| 12.03 | Initial renewal advice letter sent 70 days before expiry | Renewal › Initial RA | [03.jpg](shots/12-renewal/03.jpg) |
| 12.04 | Final renewal advice letter sent 45 days before expiry | Renewal › Final RA | [04.jpg](shots/12-renewal/04.jpg) |
| 12.05 | Client accepted: renewal policy enters placement and the e-policy cycle | Renewal › Renew → placement | [05.jpg](shots/12-renewal/05.jpg) |

## 13. Reinsurance

Source: `RENISURANCE PROCESS FLOW.pdf` · personas: ri.officer

Facultative request with 24-hour acknowledgement and 3-day slip TAT, underwriting information loop, reinsurer security rating, signed slips, closing and debit note; treaties and cessions.

| Step | Process step | Screen | Capture |
| --- | --- | --- | --- |
| 13.01 | Facultative placement request from marketing with the risk details | Reinsurance › Facultative placements › Request | [01.jpg](shots/13-reinsurance/01.jpg) |
| 13.02 | Request logged; acknowledgement due within 24 hours (TAT flag) | Reinsurance › Facultative placements | [02.jpg](shots/13-reinsurance/02.jpg) |
| 13.03 | Acknowledged; slip due within 3 working days | Reinsurance › Acknowledge | [03.jpg](shots/13-reinsurance/03.jpg) |
| 13.04 | Slip: reinsurers approached with security rating, share and signed-slip evidence | Reinsurance › Prepare slip | [04.jpg](shots/13-reinsurance/04.jpg) |
| 13.05 | Closing: placement closed and debit note issued to the cedant | Reinsurance › Close & debit note | [05.jpg](shots/13-reinsurance/05.jpg) |
| 13.06 | Treaty register and cessions with capacity monitoring | Reinsurance › Treaties & cessions | [06.jpg](shots/13-reinsurance/06.jpg) |

## 14. Submitted Policies

Source: `Submitted Policies_Process Flow.pdf` · personas: accountant

Masterlist validation, matching and consolidation, adequacy review with IAAF findings, and hand-off to sanitation 150 days from expiry.

| Step | Process step | Screen | Capture |
| --- | --- | --- | --- |
| 14.01 | Masterlist upload from the bank / insurer for validation and matching | Submitted Policies › Masterlist batches | [01.jpg](shots/14-submitted-policies/01.jpg) |
| 14.02 | Rows validated, matched and consolidated; each reviewed for adequacy | Submitted Policies › Masterlist batches › Run pipeline | [02.jpg](shots/14-submitted-policies/02.jpg) |
| 14.03 | Findings recorded and an Insurance Adequacy Assessment Form (IAAF) issued | Submitted Policies › Findings → IAAF | [03.jpg](shots/14-submitted-policies/03.jpg) |
| 14.04 | Policies 150 days from expiry sent to the sanitation handler for renewal / conversion opportunity | Submitted Policies › Expiring (150 days) | [04.jpg](shots/14-submitted-policies/04.jpg) |

## 15. Employee Benefits

Source: `EMPLOYEE BENEFITS - Process Flow.pdf` · personas: eb.officer

Renewal advice, BOR, TOR with master list and utilisation released to insurers, comparative analysis, award with ISACOM for non-accredited providers, handoff.

| Step | Process step | Screen | Capture |
| --- | --- | --- | --- |
| 15.01 | Prospect scheme created from the renewal advice | Employee Benefits › Create scheme | [01.jpg](shots/15-employee-benefits/01.jpg) |
| 15.02 | Broker of Record received, Terms of Reference prepared, member census uploaded | Employee Benefits › Scheme detail | [02.jpg](shots/15-employee-benefits/02.jpg) |
| 15.03 | TOR, master list and utilisation released to insurers (franchise) | Employee Benefits › Release TOR to insurers | [03.jpg](shots/15-employee-benefits/03.jpg) |
| 15.04 | Comparative analysis of proposals: premium, benefits and capabilities | Employee Benefits › Proposals | [04.jpg](shots/15-employee-benefits/04.jpg) |
| 15.05 | Client confirmation and award; ISACOM approval when the provider is not accredited; handoff to processing and collections | Employee Benefits › Award | [05.jpg](shots/15-employee-benefits/05.jpg) |

## 16. Product Maintenance (TSU)

Source: `PRODUCT MAINTENANCE TSU PROCESS_0709.pdf` · personas: admin → uw.head

Technical Services Unit request for non-packaged risks: completeness and duplicate check, quotation slip, TL approval, RI referral, insurer responses, comparative table and proposal slip; package maintenance with release advisory.

| Step | Process step | Screen | Capture |
| --- | --- | --- | --- |
| 16.01 | PRF / TSU request for a non-packaged risk with completeness and duplicate check | Product Maintenance › TSU requests › Submit | [01.jpg](shots/16-product-maintenance-tsu/01.jpg) |
| 16.02 | TSU acknowledges the request (or returns it as incomplete) | Product Maintenance › TSU requests › Acknowledge | [02.jpg](shots/16-product-maintenance-tsu/02.jpg) |
| 16.03 | Quotation slip prepared and approved by the TL | Product Maintenance › TSU detail › TL approve QS | [03.jpg](shots/16-product-maintenance-tsu/03.jpg) |
| 16.04 | RI referral cleared; quotation slip sent to insurers | Product Maintenance › TSU detail › Send QS to insurers | [04.jpg](shots/16-product-maintenance-tsu/04.jpg) |
| 16.05 | Insurer responses recorded (accepted with evidence / declined / conditional); comparative table ready | Product Maintenance › TSU detail › Comparative table | [05.jpg](shots/16-product-maintenance-tsu/05.jpg) |
| 16.06 | Proposal slip approved with the selected insurer; released to marketing and the client | Product Maintenance › TSU detail › Approve proposal slip | [06.jpg](shots/16-product-maintenance-tsu/06.jpg) |
| 16.07 | Packaged product catalogue with rates, taxes and limits | Product Maintenance › Packages | [07.jpg](shots/16-product-maintenance-tsu/07.jpg) |
| 16.08 | Package maintenance request raised for validation and approval | Product Maintenance › Packages › Change request | [08.jpg](shots/16-product-maintenance-tsu/08.jpg) |
| 16.09 | Approver validates the product change | Approvals & Audit › Pending | [09.jpg](shots/16-product-maintenance-tsu/09.jpg) |
| 16.10 | Change applied and a release advisory published | Approvals & Audit › Approve | [10.jpg](shots/16-product-maintenance-tsu/10.jpg) |
| 16.11 | Insurer panel with accreditation and SFTP enrolment for placement channels | Product Maintenance › Insurers | [11.jpg](shots/16-product-maintenance-tsu/11.jpg) |
