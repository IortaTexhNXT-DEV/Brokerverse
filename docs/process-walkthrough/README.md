# Process flow → screen walkthrough

Each step of the sixteen BDOI process flows against the BrokerVerse screen that performs it, with who acts, what they do, what they enter, what the system answers and which control applies. 111 steps captured from the running platform on 2026-09-23. Open `index.html` for the illustrated version; regenerate with `npm run walkthrough`.

## 01. BDOIR End-to-End

Source: `BDOIR E2E PROCESS FLOW.pdf` · personas: admin

The umbrella flow that chains new business, cashiering, collections, remittance, disbursement, the general ledger, renewal and claims. Each link is captured in detail in its own process below; these screens show the control points that tie the chain together.

### 01.01 Executive dashboard: KPIs across the whole chain (in force, in placement, unapplied payments, pending approvals, disbursements in flight, past-TAT requests)

- **Who:** System Administrator, Administrator
- **Screen:** Dashboard
- **Do:** Sign in; the dashboard opens.
- **Result:** KPI tiles for policies in force, in placement, premium and commission YTD, outstanding premium, unapplied payments, pending approvals, disbursements in flight, open claims, renewals due, past-TAT requests and screening hits.
- **Control:** Each tile reads the same tables the processes write; there is no separate reporting copy.
- **Capture:** [01.jpg](shots/01-bdoir-e2e/01.jpg) · [close-up](shots/01-bdoir-e2e/01-zoom.jpg)

### 01.02 Single maker-checker queue for bookings, endorsements, journals, disbursements, CTE, claim settlements, EB awards and product changes

- **Who:** System Administrator, Administrator
- **Screen:** Approvals & Audit › All
- **Do:** Open Approvals & Audit and the All tab.
- **Result:** Every approval request across modules with maker, checker, status and note.
- **Control:** One registry, eight request types, segregation of duties on all of them.
- **Capture:** [02.jpg](shots/01-bdoir-e2e/02.jpg) · [close-up](shots/01-bdoir-e2e/02-zoom.jpg)

### 01.03 Production, collection and claims reports with CSV export

- **Who:** System Administrator, Administrator
- **Screen:** Reports & Analytics
- **Do:** Open Reports & Analytics.
- **Result:** Production by product and insurer, collections ageing, claims by status, with CSV export.
- **Control:** Reports are entitlement-scoped (RPT module).
- **Capture:** [03.jpg](shots/01-bdoir-e2e/03.jpg) · [close-up](shots/01-bdoir-e2e/03-zoom.jpg)

### 01.04 Client onboarding with sanctions screening, PEP flag and risk tiering feeding every process

- **Who:** System Administrator, Administrator
- **Screen:** Sanction Screening & Risk
- **Do:** Open Sanction Screening & Risk.
- **Result:** Client register with screening status, PEP, risk score and tier; hits offer Clear (false positive) or Decline.
- **Control:** Compliance decides hits; declined clients cannot transact.
- **Capture:** [04.jpg](shots/01-bdoir-e2e/04.jpg) · [close-up](shots/01-bdoir-e2e/04-zoom.jpg)

### 01.05 Twelve personas with module entitlements and approver rights (segregation of duties)

- **Who:** System Administrator, Administrator
- **Screen:** User Access Maintenance
- **Do:** Open User Access Maintenance.
- **Result:** Users with role, department, status and module entitlements; create user with a temporary password.
- **Control:** Roles define modules and approver rights; menus and APIs enforce them.
- **Capture:** [05.jpg](shots/01-bdoir-e2e/05.jpg) · [close-up](shots/01-bdoir-e2e/05-zoom.jpg)

### 01.06 Legacy data migration batches with load, reconciliation and disposition

- **Who:** System Administrator, Administrator
- **Screen:** Data Migration
- **Do:** Open Data Migration.
- **Result:** Batches with source count, loaded count, variance and disposition.
- **Control:** A batch with variance requires a disposition before it is accepted.
- **Capture:** [06.jpg](shots/01-bdoir-e2e/06.jpg) · [close-up](shots/01-bdoir-e2e/06-zoom.jpg)

## 02. New Business

Source: `NEW BUSINESS.pdf` · personas: nb.officer → uw.head

Client creation and screening, quotation, proposal, placement to the insurer, e-policy and booking under maker-checker.

### 02.01 MAO creates the client in Broker; KYC details captured

- **Who:** Maria Santos, New Business Officer (MAO)
- **Screen:** Sanction Screening & Risk › New client form
- **Do:** Open Sanction Screening & Risk, fill in the new client form and press Create & screen.
- **Enter:** Name: Acme Freight 73800; Type: corporate; Email: acmefreight@example.com; TIN: TIN-73800-18
- **Result:** The client is created with a client number and screened against the sanctions and PEP lists in the same call.
- **Control:** Every client is screened before any quotation can be issued for it; a hit blocks new business until Compliance clears it.
- **Capture:** [01.jpg](shots/02-new-business/01.jpg) · [close-up](shots/02-new-business/01-zoom.jpg)

### 02.02 Client is sanction-screened automatically (clear / hit) and risk-tiered

- **Who:** Maria Santos, New Business Officer (MAO)
- **Screen:** Sanction Screening & Risk › Client register
- **Do:** Read the toast and the new row in the client register.
- **Result:** Toast confirms the client number, screening result and risk tier; the row shows the CDD level and screening status.
- **System said:** CLT-2026-00066 created · screening clear · tier low
- **Control:** Risk tier drives the customer due-diligence level (simplified / standard / enhanced).
- **Capture:** [02.jpg](shots/02-new-business/02.jpg) · [close-up](shots/02-new-business/02-zoom.jpg)

### 02.03 Quotation prepared with the rating engine (premium, VAT, DST, LGT, commission)

- **Who:** Maria Santos, New Business Officer (MAO)
- **Screen:** New Business › Quotations & proposals › New quotation form
- **Do:** Pick the client, the packaged product and the insurer, enter the sum insured and press Create quotation.
- **Enter:** Client: Acme Freight 73800; Product: MTR-CMP · Motor Comprehensive; Insurer: first accredited insurer on the panel; Sum insured: ₱1,000,000; Hold cover (days): blank unless the insurer must hold cover before placement
- **Result:** The rating engine computes premium, VAT, DST, LGT and FST, and the broker commission from the product rates.
- **System said:** CLT-2026-00066 created · screening clear · tier low
- **Control:** Non-packaged products cannot be quoted here; they require an approved TSU proposal first (see Product Maintenance / TSU).
- **Capture:** [03.jpg](shots/02-new-business/03.jpg) · [close-up](shots/02-new-business/03-zoom.jpg)

### 02.04 Quotation created (status: quoted); hold cover can be requested from the insurer

- **Who:** Maria Santos, New Business Officer (MAO)
- **Screen:** New Business › Quotations & proposals
- **Do:** Check the new quotation row and its computed amounts.
- **Result:** Quotation number QT-YYYY-NNNNN assigned; status quoted; the row offers Send proposal.
- **System said:** CLT-2026-00066 created · screening clear · tier low · Quotation created
- **Control:** Acceptance limits and the survey threshold on the product are checked at quotation time.
- **Capture:** [04.jpg](shots/02-new-business/04.jpg) · [close-up](shots/02-new-business/04-zoom.jpg)

### 02.05 Proposal sent to the client by email (status: proposal sent)

- **Who:** Maria Santos, New Business Officer (MAO)
- **Screen:** New Business › Quotations & proposals › Send proposal
- **Do:** Press Send proposal on the quotation row.
- **Result:** The proposal is emailed to the client (see Outbox) and the status moves to proposal sent.
- **System said:** CLT-2026-00066 created · screening clear · tier low · Quotation created · Proposal emailed to client
- **Control:** Order is enforced: a quotation must be quoted before a proposal can be sent.
- **Capture:** [05.jpg](shots/02-new-business/05.jpg) · [close-up](shots/02-new-business/05-zoom.jpg)

### 02.06 Client acceptance recorded (Y); a decline with reason is the N branch

- **Who:** Maria Santos, New Business Officer (MAO)
- **Screen:** New Business › Quotations & proposals › Client accepted
- **Do:** Press Client accepted once the signed proposal or proof of payment is received.
- **Result:** Acceptance recorded with a timestamp; Request placement becomes available.
- **System said:** Quotation created · Proposal emailed to client · Client acceptance recorded
- **Control:** Declined is the N branch: a decline reason is captured and the quotation is closed.
- **Capture:** [06.jpg](shots/02-new-business/06.jpg) · [close-up](shots/02-new-business/06-zoom.jpg)

### 02.07 Placement requested: placement slip goes to the insurer via SFTP or email

- **Who:** Maria Santos, New Business Officer (MAO)
- **Screen:** New Business › Policy drawer (placement requested)
- **Do:** Press Request placement; the policy shell opens in a drawer.
- **Result:** Policy POL-2026-00068 created in status placement requested; the placement slip is sent by SFTP when the insurer is enrolled, otherwise by email.
- **System said:** Proposal emailed to client · Client acceptance recorded · Placement slip sent to insurer
- **Control:** Placement channel is decided by the insurer record (SFTP-enrolled or not).
- **Capture:** [07.jpg](shots/02-new-business/07.jpg) · [close-up](shots/02-new-business/07-zoom.jpg)

### 02.08 Placement board tracks slips awaiting the insurer, returns and e-policies

- **Who:** Maria Santos, New Business Officer (MAO)
- **Screen:** New Business › Placement
- **Do:** Open the Placement tab.
- **Result:** Every policy awaiting the insurer is listed with slip sent time, return reason and the next action.
- **System said:** Proposal emailed to client · Client acceptance recorded · Placement slip sent to insurer
- **Control:** A placement returned by the insurer carries a reason routed to marketing and can be resubmitted.
- **Capture:** [08.jpg](shots/02-new-business/08.jpg) · [close-up](shots/02-new-business/08-zoom.jpg)

### 02.09 Insurer placed the risk; e-policy received (COG via SFTP or PO email)

- **Who:** Maria Santos, New Business Officer (MAO)
- **Screen:** New Business › Placement › Placed / e-policy received
- **Do:** Press Placed / e-policy received and enter the insurer policy reference in the prompt.
- **Enter:** Insurer policy reference: INS-73800
- **Result:** Status placed; e-policy channel recorded; Book & invoice becomes available.
- **System said:** Client acceptance recorded · Placement slip sent to insurer · E-policy received
- **Control:** E-policy exceptions are routed to the contact centre with an exception note.
- **Capture:** [09.jpg](shots/02-new-business/09.jpg) · [close-up](shots/02-new-business/09-zoom.jpg)

### 02.10 Booking and invoicing raised for checker approval (maker-checker)

- **Who:** Maria Santos, New Business Officer (MAO)
- **Screen:** New Business › Placement › Book & invoice
- **Do:** Press Book & invoice.
- **Result:** A policy_issue approval request is raised; the policy waits in pending approval.
- **System said:** Placement slip sent to insurer · E-policy received · Booking sent for checker approval
- **Control:** Maker-checker: the officer who books cannot approve; segregation of duties is enforced by the approval registry.
- **Capture:** [10.jpg](shots/02-new-business/10.jpg) · [close-up](shots/02-new-business/10-zoom.jpg)

### 02.11 Underwriting Head (checker) reviews the booking request

- **Who:** Ramon Villareal, Underwriting Head (checker)
- **Screen:** Approvals & Audit › Pending
- **Do:** Open Approvals & Audit; the Pending tab lists requests raised by makers.
- **Result:** The request shows type, summary, maker, maker note and time raised.
- **Control:** Only users with approver rights on the module can decide; a maker can never approve their own request.
- **Capture:** [11.jpg](shots/02-new-business/11.jpg) · [close-up](shots/02-new-business/11-zoom.jpg)

### 02.12 Booking approved: invoice, journal and e-policy dispatch are posted automatically

- **Who:** Ramon Villareal, Underwriting Head (checker)
- **Screen:** Approvals & Audit › Approve
- **Do:** Press Approve and enter a checker note.
- **Enter:** Checker note: Reviewed and approved
- **Result:** Policy in force, invoice generated, booking journal posted and the e-policy dispatched on the recorded channel.
- **System said:** Request approved
- **Control:** Every decision is written to the audit trail with before/after state.
- **Capture:** [12.jpg](shots/02-new-business/12.jpg) · [close-up](shots/02-new-business/12-zoom.jpg)

### 02.13 Policy register: the policy is in force with its invoice and e-policy channel

- **Who:** Maria Santos, New Business Officer (MAO)
- **Screen:** New Business › Policies
- **Do:** Open the Policies tab.
- **Result:** Policy POL-2026-00068 shows in force with inception, expiry, premium, insurer reference and e-policy channel.
- **Control:** Only in-force, renewed or expired policies can carry claims.
- **Capture:** [13.jpg](shots/02-new-business/13.jpg) · [close-up](shots/02-new-business/13-zoom.jpg)

### 02.14 Policy detail: placement history, e-policy status and the exception route to the contact centre

- **Who:** Maria Santos, New Business Officer (MAO)
- **Screen:** New Business › Policies › Policy detail
- **Do:** Click the policy row to open its detail drawer.
- **Result:** Drawer shows period, taxes, commission, placement/booking/e-policy timestamps, invoices and claims.
- **Control:** E-policy exception sends the case to the contact centre with the exception note.
- **Capture:** [14.jpg](shots/02-new-business/14.jpg) · [close-up](shots/02-new-business/14-zoom.jpg)

## 03. Operations

Source: `OPERATIONS PROCESS FLOW.pdf` · personas: cashier → checker

Cashiering channels, post-dated cheque hold, unapplied premium, direct payments with commission receivables, adjustments and production reconciliation.

### 03.01 Cashiering: open invoices (premium receivables) awaiting payment

- **Who:** Liza Bautista, Cashier
- **Screen:** Operations › Invoices & cashiering
- **Do:** Open Operations; the Invoices & cashiering tab lists premium receivables.
- **Result:** Each invoice shows billed, paid, balance and status; open ones offer Receive.
- **Control:** Invoices are generated automatically when the checker approves booking.
- **Capture:** [01.jpg](shots/03-operations/01.jpg) · [close-up](shots/03-operations/01-zoom.jpg)

### 03.02 Receive payment: channel (bills payment, OTC cash/cheque, batch files, autopay) and reference

- **Who:** Liza Bautista, Cashier
- **Screen:** Operations › Invoices & cashiering › Receive
- **Do:** Press Receive on the invoice, choose the channel and enter the cheque details.
- **Enter:** Channel: OTC cheque; Cheque no.: CHQ-73800; Amount: defaults to the invoice balance
- **Result:** The form is ready to post; cheque channels will be held for clearing.
- **Control:** Channels mirror the flow: bills payment, OTC cash/cheque, CLPC/PMS/trade batch files, direct credit, autopay.
- **Capture:** [02.jpg](shots/03-operations/02.jpg) · [close-up](shots/03-operations/02-zoom.jpg)

### 03.03 Cheque payment recorded and held for the 4-day clearing period

- **Who:** Liza Bautista, Cashier
- **Screen:** Operations › Receive › Record payment
- **Do:** Press Record payment.
- **Result:** Toast shows the hold-until date; the payment is created in status held and is not yet applied to the invoice.
- **System said:** Cheque held until 2026-09-27 (PDC monitoring)
- **Control:** Post-dated / OTC cheques are held four days before they can mature and apply.
- **Capture:** [03.jpg](shots/03-operations/03.jpg) · [close-up](shots/03-operations/03-zoom.jpg)

### 03.04 PDC register: held cheques, matured, bounced (exclusion list) and unapplied premium

- **Who:** Liza Bautista, Cashier
- **Screen:** Operations › Payments / PDC / UPP
- **Do:** Open the Payments / PDC / UPP tab.
- **Result:** The held cheque appears with Matured and Bounced actions; unapplied premium rows offer Apply to invoice.
- **System said:** Cheque held until 2026-09-27 (PDC monitoring)
- **Control:** A bounced cheque is tagged with a reason and feeds the exclusion list.
- **Capture:** [04.jpg](shots/03-operations/04.jpg) · [close-up](shots/03-operations/04-zoom.jpg)

### 03.05 Held cheque shows Matured / Bounced actions once the 4-day hold lapses

- **Who:** Liza Bautista, Cashier
- **Screen:** Operations › Payments / PDC / UPP › Held cheque
- **Do:** Attempting Matured before the hold date is refused by the API.
- **Result:** Conflict: "Cheque is on hold until <date> (4-day clearing)"; after the date, Matured applies the payment and issues the OR.
- **System said:** Cheque held until 2026-09-27 (PDC monitoring)
- **Control:** PDC monitoring: maturity cannot be forced before the clearing period.
- **Capture:** [05.jpg](shots/03-operations/05.jpg) · [close-up](shots/03-operations/05-zoom.jpg)

### 03.06 Cash / bills payment applied in full: official receipt issued and receivable cleared

- **Who:** Liza Bautista, Cashier
- **Screen:** Operations › Receive › Official receipt
- **Do:** Receive the same invoice again through a cash / bills-payment channel and press Record payment.
- **Enter:** Channel: bills payment (default); Amount: invoice balance
- **Result:** Official receipt OR-YYYY-NNNNN issued; invoice status paid; cash and premium journals posted.
- **System said:** Cheque held until 2026-09-27 (PDC monitoring) · Official receipt OR-2026-00022 issued
- **Control:** An applied payment posts Dr Cash / Cr Premium receivable and books the commission income.
- **Capture:** [06.jpg](shots/03-operations/06.jpg) · [close-up](shots/03-operations/06-zoom.jpg)

### 03.07 Payment with zero PR / payment greater than PR is recorded without an invoice

- **Who:** Liza Bautista, Cashier
- **Screen:** Operations › Invoices & cashiering › Payment without invoice
- **Do:** Press Payment without invoice and enter the amount received.
- **Enter:** Amount: ₱2,500.00; Client id: optional; Reference: transaction / file reference
- **Result:** The payment can be posted even though no premium receivable matches it.
- **System said:** Cheque held until 2026-09-27 (PDC monitoring) · Official receipt OR-2026-00022 issued
- **Control:** Zero-PR and excess payments never sit against an invoice; they go to unapplied premium.
- **Capture:** [07.jpg](shots/03-operations/07.jpg) · [close-up](shots/03-operations/07-zoom.jpg)

### 03.08 The amount sits in Unapplied Premium (GL 2400) until applied to an invoice

- **Who:** Liza Bautista, Cashier
- **Screen:** Operations › Payments / PDC / UPP
- **Do:** Open Payments / PDC / UPP and find the unapplied row.
- **Result:** Status unapplied with the unapplied amount; Apply to invoice prompts for the invoice id.
- **System said:** Cheque held until 2026-09-27 (PDC monitoring) · Official receipt OR-2026-00022 issued · Payment PAY-2026-00040 recorded as unapplied
- **Control:** Unapplied premium is a liability (GL 2400) until matched; refunds of UPP go through the RRF.
- **Capture:** [08.jpg](shots/03-operations/08.jpg) · [close-up](shots/03-operations/08-zoom.jpg)

### 03.09 Direct payment to insurer identified for a booked policy

- **Who:** Liza Bautista, Cashier
- **Screen:** Operations › Direct payments › Identify
- **Do:** Enter the policy number the client paid directly to the insurer and press Identify direct payment.
- **Enter:** Policy no.: POL-2026-00069
- **Result:** The invoice is tagged direct-paid and a commission receivable is booked against the insurer.
- **System said:** Official receipt OR-2026-00022 issued · Payment PAY-2026-00040 recorded as unapplied
- **Control:** Direct-paid policies are excluded from the remittance extract; the broker collects only its commission.
- **Capture:** [09.jpg](shots/03-operations/09.jpg) · [close-up](shots/03-operations/09-zoom.jpg)

### 03.10 Commission receivable (GL 1250) billed to the insurer; follow-up until collected

- **Who:** Liza Bautista, Cashier
- **Screen:** Operations › Direct payments › Bill insurer
- **Do:** Press Bill insurer on the receivable row.
- **Result:** Status billed; the billing letter is queued to the insurer. Rejected / Re-bill handle disputes.
- **System said:** Payment PAY-2026-00040 recorded as unapplied · Direct payment identified; commission receivable booked · Updated
- **Control:** Commission receivable lifecycle: identified → billed → approved → collected.
- **Capture:** [10.jpg](shots/03-operations/10.jpg) · [close-up](shots/03-operations/10-zoom.jpg)

### 03.11 Commission collected: commission official receipt issued

- **Who:** Liza Bautista, Cashier
- **Screen:** Operations › Direct payments › Collect (commission OR)
- **Do:** Press Insurer approved, then Collect (commission OR).
- **Result:** Status collected; a commission OR is issued and Dr Cash / Cr Commission receivable is posted.
- **System said:** Updated · Updated · Updated
- **Control:** Only approved receivables can be collected.
- **Capture:** [11.jpg](shots/03-operations/11.jpg) · [close-up](shots/03-operations/11-zoom.jpg)

### 03.12 Adjustment / cancellation validated by the Adjustment Team and routed to the checker-poster

- **Who:** Liza Bautista, Cashier
- **Screen:** Operations › Adjustments › Endorsement form
- **Do:** Fill in the endorsement: policy, type, premium delta, refund and description, then press Submit for posting.
- **Enter:** Policy no.: POL-2026-00068; Type: adjustment (cancellation is the other type); Premium delta: −₱3,000.00; Refund to client: ₱1,500.00; Description: Premium adjustment: sum insured reduced per client request
- **Result:** An endorsement number is assigned and an endorsement approval is raised.
- **System said:** Updated · Updated · Updated
- **Control:** Endorsements post only after the checker-poster approves; a cancellation sets the policy to cancelled.
- **Capture:** [12.jpg](shots/03-operations/12.jpg) · [close-up](shots/03-operations/12-zoom.jpg)

### 03.13 Endorsement pending checker approval; a refund creates a Refund Request Form (RRF) on approval

- **Who:** Liza Bautista, Cashier
- **Screen:** Operations › Adjustments
- **Do:** Check the endorsement register.
- **Result:** The endorsement waits in pending; on approval the premium delta is journaled and an RRF is raised for the refund.
- **System said:** Updated · Updated · Endorsement sent to checker for posting
- **Control:** Refund Request Forms originate from endorsements or unapplied premium, never from free-form entry.
- **Capture:** [13.jpg](shots/03-operations/13.jpg) · [close-up](shots/03-operations/13-zoom.jpg)

### 03.14 Production reconciliation: insurer production file matched against booked policies

- **Who:** Liza Bautista, Cashier
- **Screen:** Operations › Production recon › Upload
- **Do:** Choose the insurer, the booking period and paste the production register rows, then press Match & classify.
- **Enter:** Insurer: first insurer on the panel; Booking period: current month; Rows: POL-2026-00068, 12500, INS-73800  /  POL-9999-00001, 8000, INS-X
- **Result:** A reconciliation run is created with one classified row per line.
- **System said:** Updated · Updated · Endorsement sent to checker for posting
- **Control:** Rows are classified matched, with discrepancies (premium or reference differs) or unbooked (policy unknown).
- **Capture:** [14.jpg](shots/03-operations/14.jpg) · [close-up](shots/03-operations/14-zoom.jpg)

### 03.15 Rows classified as matched, with discrepancies, or unbooked; each gets a disposition

- **Who:** Liza Bautista, Cashier
- **Screen:** Operations › Production recon › Result
- **Do:** Read the result: counts per class and the detail rows.
- **Result:** Toast summarises matched / discrepancies / unbooked; the run detail lists each row with a Disposition action.
- **System said:** Updated · Endorsement sent to checker for posting · PRC-2026-00005: 1 matched · 0 discrepancies · 1 unbooked
- **Control:** Unbooked rows must be dispositioned (book, insurer error, cancelled) before the run closes.
- **Capture:** [15.jpg](shots/03-operations/15.jpg) · [close-up](shots/03-operations/15-zoom.jpg)

### 03.16 Checker-poster reviews the endorsement

- **Who:** System Administrator, Administrator
- **Screen:** Approvals & Audit › Pending
- **Do:** Open Approvals & Audit; the Pending tab lists requests raised by makers.
- **Result:** The request shows type, summary, maker, maker note and time raised.
- **Control:** The checker-poster must be a different user from the maker (segregation of duties).
- **Capture:** [16.jpg](shots/03-operations/16.jpg) · [close-up](shots/03-operations/16-zoom.jpg)

### 03.17 Endorsement posted: premium and commission reversed, RRF raised for the refund

- **Who:** System Administrator, Administrator
- **Screen:** Approvals & Audit › Approve
- **Do:** Press Approve and enter a checker note.
- **Enter:** Checker note: Reviewed and approved
- **Result:** Endorsement status posted; adjustment journal booked; RRF created in status submitted for the refund amount.
- **System said:** Request approved
- **Control:** Every decision is written to the audit trail with before/after state.
- **Capture:** [17.jpg](shots/03-operations/17.jpg) · [close-up](shots/03-operations/17-zoom.jpg)

## 04. Marketing Collections

Source: `MARKETING COLLECTIONS - Process Flow.pdf` · personas: collections → fin.head

Premium receivable list by stage, marketing diary, credit-term extension under approval and statement of account.

### 04.01 PR list: newly booked accounts to collect within 10–15 days; ageing and collection stage per invoice

- **Who:** Paolo Reyes, Collections Officer
- **Screen:** Collections › Outstanding premium
- **Do:** Open Collections; the outstanding register lists every unpaid invoice.
- **Result:** Each row shows days since booking, days overdue, ageing bucket and the collection stage (newly booked, within credit term, committed, overdue, escalate).
- **Control:** Newly booked accounts are collected within 10–15 days; commitments must fall within the 60-day credit term.
- **Capture:** [01.jpg](shots/04-marketing-collections/01.jpg) · [close-up](shots/04-marketing-collections/01-zoom.jpg)

### 04.02 Statement of account sent to the client

- **Who:** Paolo Reyes, Collections Officer
- **Screen:** Collections › SOA
- **Do:** Press SOA on the invoice row.
- **Result:** The statement lists all open invoices of the client with balances and ageing, ready to send.
- **Control:** SOA is the collection instrument for account-level follow-up.
- **Capture:** [02.jpg](shots/04-marketing-collections/02.jpg) · [close-up](shots/04-marketing-collections/02-zoom.jpg)

### 04.03 Marketing diary: when / where / how / what of each collection effort, commitment date and arrangement

- **Who:** Paolo Reyes, Collections Officer
- **Screen:** Collections › Log effort
- **Do:** Press Log effort and record the contact.
- **Enter:** Category: committed; Commitment date: 2026-11-07 (45 days out); Contact person: Ms. Reyes; Mode / arrangement / remarks: as agreed with the client
- **Result:** The effort is added to the diary and the invoice stage is recomputed.
- **Control:** Every effort captures when, where, how and what, so the diary is auditable.
- **Capture:** [03.jpg](shots/04-marketing-collections/03.jpg) · [close-up](shots/04-marketing-collections/03-zoom.jpg)

### 04.04 Commitment beyond the 60-day credit term: MAO informed, tagged as committed

- **Who:** Paolo Reyes, Collections Officer
- **Screen:** Collections › Outstanding premium
- **Do:** Read the toast after logging.
- **Result:** Toast warns the commitment is beyond the credit term and that the MAO was emailed; stage becomes committed.
- **System said:** Effort logged · commitment is beyond the credit term, marketing AO informed
- **Control:** A commitment past the credit term requires a credit-term extension (CTE) approved by the unit head.
- **Capture:** [04.jpg](shots/04-marketing-collections/04.jpg) · [close-up](shots/04-marketing-collections/04-zoom.jpg)

### 04.05 Credit-term extension (CTE) requested for Unit Head approval

- **Who:** Paolo Reyes, Collections Officer
- **Screen:** Collections › CTE
- **Do:** Press CTE and answer the prompts.
- **Enter:** Extension: 30 days; Reason: Client budget cycle
- **Result:** A cte approval request is raised; the invoice shows the pending extension.
- **System said:** Effort logged · commitment is beyond the credit term, marketing AO informed · CTE requested; awaiting unit head approval
- **Control:** CTE extends the due date only after approval; the request is maker-checker.
- **Capture:** [05.jpg](shots/04-marketing-collections/05.jpg) · [close-up](shots/04-marketing-collections/05-zoom.jpg)

### 04.06 Effort diary per invoice with category tagging

- **Who:** Paolo Reyes, Collections Officer
- **Screen:** Collections › Diary
- **Do:** Press Diary on the row.
- **Result:** All efforts for the invoice, with mode, category, commitment, arrangement, contact and who logged it.
- **System said:** Effort logged · commitment is beyond the credit term, marketing AO informed · CTE requested; awaiting unit head approval
- **Control:** Tagging status / category drives the escalation stage.
- **Capture:** [06.jpg](shots/04-marketing-collections/06.jpg) · [close-up](shots/04-marketing-collections/06-zoom.jpg)

### 04.07 Unit / Finance Head reviews the CTE request

- **Who:** Antonio Cruz, Finance Head (approver)
- **Screen:** Approvals & Audit › Pending
- **Do:** Open Approvals & Audit; the Pending tab lists requests raised by makers.
- **Result:** The request shows type, summary, maker, maker note and time raised.
- **Control:** Only users with approver rights on the module can decide; a maker can never approve their own request.
- **Capture:** [07.jpg](shots/04-marketing-collections/07.jpg) · [close-up](shots/04-marketing-collections/07-zoom.jpg)

### 04.08 CTE approved: due date extended and account stays within term

- **Who:** Antonio Cruz, Finance Head (approver)
- **Screen:** Approvals & Audit › Approve
- **Do:** Press Approve and enter a checker note.
- **Enter:** Checker note: Reviewed and approved
- **Result:** Invoice due date extended by the approved days; stage returns to within credit term / committed.
- **System said:** Request approved
- **Control:** Every decision is written to the audit trail with before/after state.
- **Capture:** [08.jpg](shots/04-marketing-collections/08.jpg) · [close-up](shots/04-marketing-collections/08-zoom.jpg)

## 05. FRBS Accounting

Source: `FRBS - ACCOUNTING.pdf` · personas: accountant → fin.head

Chart of accounts, system-generated journals, manual entries under review, trial balance, period and year-end closing.

### 05.01 System-generated journals (booking, receipts, commissions) and manual entry form routed to the TL for posting

- **Who:** Grace Lim, Accountant (FRBS)
- **Screen:** Accounting & Disbursement › Journals
- **Do:** Open the Journals tab: the register lists automatic journals; the form drafts a manual entry.
- **Enter:** Entry date, description; Lines: account, debit, credit (must balance)
- **Result:** Route for posting raises a journal approval; system journals are already posted.
- **Control:** Manual journals post only after the TL / FRBS approver decides; debits must equal credits.
- **Capture:** [01.jpg](shots/05-frbs-accounting/01.jpg) · [close-up](shots/05-frbs-accounting/01-zoom.jpg)

### 05.02 Trial balance and financial reports generated from the ledger

- **Who:** Grace Lim, Accountant (FRBS)
- **Screen:** Accounting & Disbursement › Trial balance
- **Do:** Open Trial balance; optionally filter by period (YYYY-MM).
- **Result:** Debit and credit totals per account with the balanced indicator.
- **Control:** The ledger is double-entry; the trial balance must always balance.
- **Capture:** [02.jpg](shots/05-frbs-accounting/02.jpg) · [close-up](shots/05-frbs-accounting/02-zoom.jpg)

### 05.03 EOD / EOM / EOY: period close and reopen, fiscal-year close to retained earnings

- **Who:** Grace Lim, Accountant (FRBS)
- **Screen:** Accounting & Disbursement › Periods & year-end
- **Do:** Open Periods & year-end: close a month, reopen with a reason, or close the fiscal year.
- **Enter:** Period: YYYY-MM to close; Reason to reopen: required when reopening; Year: fiscal year to close
- **Result:** Closed periods reject new postings; the year-end close posts nominal balances to retained earnings.
- **Control:** Only the Finance Head may reopen a closed period.
- **Capture:** [03.jpg](shots/05-frbs-accounting/03.jpg) · [close-up](shots/05-frbs-accounting/03-zoom.jpg)

## 06. Disbursement

Source: `DISBURSEMENT.pdf` · personas: accountant → admin (reviewer) → fin.head → accountant

Disbursement chain DPO → DTL → DSH → DUH with segregation of duties, payment posting and confirmation email; weekly remittance to insurers.

### 06.01 Weekly remittance extract of applied payments per insurer, sanitised and submitted to Disbursement

- **Who:** Grace Lim, Accountant (FRBS)
- **Screen:** Accounting & Disbursement › Remittances
- **Do:** Open Remittances: the extract groups applied payments due to each insurer.
- **Result:** Per insurer: number of policies and net amount; Submit creates the remittance schedule and its disbursement request.
- **Control:** Direct-paid and already-remitted policies are excluded from the extract.
- **Capture:** [01.jpg](shots/06-disbursement/01.jpg) · [close-up](shots/06-disbursement/01-zoom.jpg)

### 06.02 Disbursement request (DPO) with payee, amount, mode and bank details

- **Who:** Grace Lim, Accountant (FRBS)
- **Screen:** Accounting & Disbursement › Disbursements › Request
- **Do:** Fill in the disbursement request and press Request.
- **Enter:** Type: supplier; Payee: Supplier 73800; Amount: ₱1,200.00; Mode: cheque; Bank details: optional
- **Result:** A voucher number is assigned in status pending review.
- **Control:** The requester (DPO) cannot review or approve their own voucher.
- **Capture:** [02.jpg](shots/06-disbursement/02.jpg) · [close-up](shots/06-disbursement/02-zoom.jpg)

### 06.03 Request awaits a reviewer other than the maker (segregation of duties)

- **Who:** Grace Lim, Accountant (FRBS)
- **Screen:** Accounting & Disbursement › Disbursements
- **Do:** Check the voucher row.
- **Result:** Status pending review; Review OK / Reject are hidden from the maker.
- **System said:** Disbursement requested
- **Control:** Segregation of duties: maker, reviewer, approver and payer are distinct roles or users.
- **Capture:** [03.jpg](shots/06-disbursement/03.jpg) · [close-up](shots/06-disbursement/03-zoom.jpg)

### 06.04 Team lead review (DTL) OK; routed to the Finance Head for approval

- **Who:** System Administrator, Administrator
- **Screen:** Accounting & Disbursement › Disbursements › Review OK
- **Do:** As the team lead, press Review OK on the voucher.
- **Result:** Status pending approval; a disbursement approval request is raised for the Finance Head.
- **System said:** Reviewed; sent to Finance Head
- **Control:** Review confirms supporting documents before approval.
- **Capture:** [04.jpg](shots/06-disbursement/04.jpg) · [close-up](shots/06-disbursement/04-zoom.jpg)

### 06.05 Finance Head (DSH / DUH) reviews the voucher

- **Who:** Antonio Cruz, Finance Head (approver)
- **Screen:** Approvals & Audit › Pending
- **Do:** Open Approvals & Audit; the Pending tab lists requests raised by makers.
- **Result:** The request shows type, summary, maker, maker note and time raised.
- **Control:** Only users with approver rights on the module can decide; a maker can never approve their own request.
- **Capture:** [05.jpg](shots/06-disbursement/05.jpg) · [close-up](shots/06-disbursement/05-zoom.jpg)

### 06.06 Approved; ready for payment

- **Who:** Antonio Cruz, Finance Head (approver)
- **Screen:** Approvals & Audit › Approve
- **Do:** Press Approve and enter a checker note.
- **Enter:** Checker note: Reviewed and approved
- **Result:** Voucher status approved; the payer can now release payment.
- **System said:** Request approved
- **Control:** Every decision is written to the audit trail with before/after state.
- **Capture:** [06.jpg](shots/06-disbursement/06.jpg) · [close-up](shots/06-disbursement/06-zoom.jpg)

### 06.07 Payment posted with cheque reference; status tagged paid and confirmation email sent

- **Who:** Grace Lim, Accountant (FRBS)
- **Screen:** Accounting & Disbursement › Disbursements › Pay
- **Do:** Press Pay and enter the cheque / transaction reference.
- **Enter:** Cheque / transaction reference: CHQ-PAY-73800
- **Result:** Status paid with timestamp; payment journal posted; confirmation email queued to the payee.
- **System said:** Paid, posted and confirmation emailed
- **Control:** Payment posts Cr Cash / Dr the payable account of the voucher type.
- **Capture:** [07.jpg](shots/06-disbursement/07.jpg) · [close-up](shots/06-disbursement/07-zoom.jpg)

## 07. Refund Request

Source: `REFUND REQUEST.pdf` · personas: accountant (TL) → fin.head (UH)

Refund Request Form raised from a cancellation, TL review, Unit Head sign-off and hand-off to the disbursement chain.

### 07.01 RRF register: refund raised by the endorsement with amount, mode and reason

- **Who:** Grace Lim, Accountant (FRBS)
- **Screen:** Accounting & Disbursement › Refund requests
- **Do:** Open Refund requests.
- **Result:** RRF for POL-2026-00068 in status submitted with amount ₱1,500.00, mode credit to account and the endorsement as reason.
- **Control:** The RRF carries the MAO who raised it; TL review must be by someone else.
- **Capture:** [01.jpg](shots/07-refund-request/01.jpg) · [close-up](shots/07-refund-request/01-zoom.jpg)

### 07.02 Marketing TL reviews the RRF

- **Who:** Grace Lim, Accountant (FRBS)
- **Screen:** Accounting & Disbursement › Refund requests › TL review OK
- **Do:** Press TL review OK.
- **Result:** Status reviewed; UH approve becomes available to an approver.
- **System said:** RRF reviewed
- **Control:** Review and approval are separate steps by separate people.
- **Capture:** [02.jpg](shots/07-refund-request/02.jpg) · [close-up](shots/07-refund-request/02-zoom.jpg)

### 07.03 Unit Head sign-off: a disbursement request is created for the refund

- **Who:** Antonio Cruz, Finance Head (approver)
- **Screen:** Accounting & Disbursement › Refund requests › UH approve
- **Do:** As Unit Head, press UH approve.
- **Result:** Status approved and a refund disbursement voucher is created automatically.
- **System said:** Approved; disbursement request created
- **Control:** Refunds are paid only through the disbursement chain.
- **Capture:** [03.jpg](shots/07-refund-request/03.jpg) · [close-up](shots/07-refund-request/03-zoom.jpg)

### 07.04 Refund enters the disbursement chain (review → approve → pay)

- **Who:** Antonio Cruz, Finance Head (approver)
- **Screen:** Accounting & Disbursement › Disbursements
- **Do:** Open Disbursements and find the refund voucher.
- **Result:** Type refund, payee the client, status pending review.
- **System said:** Approved; disbursement request created
- **Control:** Same DPO → DTL → DSH → DUH chain as any other disbursement.
- **Capture:** [04.jpg](shots/07-refund-request/04.jpg) · [close-up](shots/07-refund-request/04-zoom.jpg)

## 08. ACSL (Insurer SOA reconciliation)

Source: `ACSL.pdf` · personas: accountant → fin.head

Insurer statement of account reconciled against the ledger; abnormal balances raise adjustment entries reviewed by the TL and posted by the FRBS approver.

### 08.01 Insurer SOA lines captured against the ledger

- **Who:** Grace Lim, Accountant (FRBS)
- **Screen:** Accounting & Disbursement › ACSL / SOA recon
- **Do:** Choose the insurer, paste the statement lines and press Reconcile.
- **Enter:** Insurer: first insurer on the panel; SOA lines: POL-2026-00068, 12000  /  POL-9999-00002, 500
- **Result:** A reconciliation run compares each statement line with the ledger balance for the policy.
- **Control:** Statement total, ledger total and variance are stored per run.
- **Capture:** [01.jpg](shots/08-acsl/01.jpg) · [close-up](shots/08-acsl/01-zoom.jpg)

### 08.02 Variances flagged (abnormal balances, unknown items) for manual subsidiary-ledger adjustment

- **Who:** Grace Lim, Accountant (FRBS)
- **Screen:** Accounting & Disbursement › ACSL / SOA recon › Result
- **Do:** Read the run: per policy statement vs ledger, variance and whether the policy is known.
- **Result:** Lines with variance or unknown policies are flagged; Adjust drafts the correcting entries.
- **System said:** SOA-2026-00009: discrepancy (variance ₱-1,281.25)
- **Control:** Adjustment entries are routed to the FRBS approver; nothing posts directly from the recon.
- **Capture:** [02.jpg](shots/08-acsl/02.jpg) · [close-up](shots/08-acsl/02-zoom.jpg)

## 09. Claims

Source: `CLAIMS PROCESS FLOW.pdf` · personas: claims → fin.head

Notice of loss, PLA, document checklist, FLA to the insurer, evaluation and offer, contest loop, settlement approval and closure.

### 09.01 Notice of loss registered against the policy (Claims Acceptance Control checks premium status)

- **Who:** Jenny Ocampo, Claims Officer
- **Screen:** Claims › Register
- **Do:** Fill in the notice of loss and press Register.
- **Enter:** Policy number: POL-2026-00068; Date of loss: today; Estimated amount: ₱50,000.00; Description: Collision on C5 southbound
- **Result:** Claims Acceptance Control checks the policy is in force and the premium is paid before accepting.
- **Control:** CAC: an unpaid premium or a cancelled policy blocks registration with an explicit reason.
- **Capture:** [01.jpg](shots/09-claims/01.jpg) · [close-up](shots/09-claims/01-zoom.jpg)

### 09.02 Preliminary Loss Advice (PLA) sent; claim opened with reserve

- **Who:** Jenny Ocampo, Claims Officer
- **Screen:** Claims › Register
- **Do:** Read the toast and the new claim row.
- **Result:** Claim CLM-YYYY-NNNNN registered, reserve set to the estimate and the PLA emailed to the client.
- **System said:** Claim CLM-2026-00014 registered · Preliminary Loss Advice sent
- **Control:** The document checklist is generated by line of business (motor vs non-motor CRF).
- **Capture:** [02.jpg](shots/09-claims/02.jpg) · [close-up](shots/09-claims/02-zoom.jpg)

### 09.03 Document checklist by line (motor / non-motor); FLA blocked until complete

- **Who:** Jenny Ocampo, Claims Officer
- **Screen:** Claims › Claim detail › Document checklist
- **Do:** Click the claim row to open the detail drawer.
- **Result:** Checklist rows (claim form, police report, licence, OR/CR, photos, estimate) all pending; the FLA button is not offered yet.
- **System said:** Claim CLM-2026-00014 registered · Preliminary Loss Advice sent
- **Control:** Formal Loss Advice cannot be sent until every required document is received.
- **Capture:** [03.jpg](shots/09-claims/03.jpg) · [close-up](shots/09-claims/03-zoom.jpg)

### 09.04 All requirements received: documents complete

- **Who:** Jenny Ocampo, Claims Officer
- **Screen:** Claims › Claim detail
- **Do:** Press Received on each checklist row as documents arrive.
- **Result:** Pill shows documents complete; Send Formal Loss Advice appears.
- **System said:** Document received · Document received
- **Control:** Received dates are kept per document for TAT reporting.
- **Capture:** [04.jpg](shots/09-claims/04.jpg) · [close-up](shots/09-claims/04-zoom.jpg)

### 09.05 Formal Loss Advice sent to the insurer; adjuster inspection flagged

- **Who:** Jenny Ocampo, Claims Officer
- **Screen:** Claims › Claim detail › Send FLA
- **Do:** Press Send Formal Loss Advice and confirm whether an adjuster inspection is needed.
- **Enter:** Adjuster inspection needed? Yes
- **Result:** Status fla sent; adjuster pill shown; FLA emailed to the insurer.
- **System said:** Document received · Document received · Claim fla sent
- **Control:** Adjuster requirement is recorded for follow-up with the insurer.
- **Capture:** [05.jpg](shots/09-claims/05.jpg) · [close-up](shots/09-claims/05-zoom.jpg)

### 09.06 Insurer evaluation and offer received

- **Who:** Jenny Ocampo, Claims Officer
- **Screen:** Claims › Claim detail › Offer received
- **Do:** Press Insurer evaluating, then Offer received and enter the offer amount.
- **Enter:** Offer amount: ₱40,000.00
- **Result:** Status offer received with the offer stored against the reserve.
- **System said:** Claim fla sent · Claim under review · Claim offer received
- **Control:** Offer below estimate can be contested; acceptance closes the evaluation loop.
- **Capture:** [06.jpg](shots/09-claims/06.jpg) · [close-up](shots/09-claims/06-zoom.jpg)

### 09.07 Insured contests the offer; re-evaluation loop with the insurer

- **Who:** Jenny Ocampo, Claims Officer
- **Screen:** Claims › Claim detail › Contest offer
- **Do:** Press Contest offer and state the position.
- **Enter:** Position: Estimate is 45000
- **Result:** Status offer contested; the insurer re-evaluates and a new offer can be recorded.
- **System said:** Claim under review · Claim offer received · Claim offer contested
- **Control:** The contest loop can repeat until the insured accepts or the claim is declined.
- **Capture:** [07.jpg](shots/09-claims/07.jpg) · [close-up](shots/09-claims/07-zoom.jpg)

### 09.08 Settlement by LOA to casa/dealer or cash requested for approval

- **Who:** Jenny Ocampo, Claims Officer
- **Screen:** Claims › Claim detail › Request settlement approval
- **Do:** After Insured accepts, press Request settlement approval and choose LOA or cash.
- **Enter:** Settle by LOA to casa/dealer? Yes (Cancel = cash)
- **Result:** Status settlement requested; a claim_settlement approval is raised.
- **System said:** Claim offer received · Claim offer accepted · Claim settlement requested
- **Control:** Settlement mode (LOA vs cash) is recorded; approval is maker-checker.
- **Capture:** [08.jpg](shots/09-claims/08.jpg) · [close-up](shots/09-claims/08-zoom.jpg)

### 09.09 Approver reviews the settlement

- **Who:** Antonio Cruz, Finance Head (approver)
- **Screen:** Approvals & Audit › Pending
- **Do:** Open Approvals & Audit; the Pending tab lists requests raised by makers.
- **Result:** The request shows type, summary, maker, maker note and time raised.
- **Control:** Only users with approver rights on the module can decide; a maker can never approve their own request.
- **Capture:** [09.jpg](shots/09-claims/09.jpg) · [close-up](shots/09-claims/09-zoom.jpg)

### 09.10 Settlement approved

- **Who:** Antonio Cruz, Finance Head (approver)
- **Screen:** Approvals & Audit › Approve
- **Do:** Press Approve and enter a checker note.
- **Enter:** Checker note: Reviewed and approved
- **Result:** Claim status settlement approved; the claims officer can mark it settled / paid.
- **System said:** Request approved
- **Control:** Every decision is written to the audit trail with before/after state.
- **Capture:** [10.jpg](shots/09-claims/10.jpg) · [close-up](shots/09-claims/10-zoom.jpg)

### 09.11 Claim tagged settled / paid, then closed; declination is the alternative exit

- **Who:** Jenny Ocampo, Claims Officer
- **Screen:** Claims › Claim detail › Mark settled
- **Do:** Reopen the claim and press Mark settled / paid.
- **Result:** Status settled with paid amount; Close finishes the claim.
- **System said:** Claim settled
- **Control:** Decline (with reason) is available at any open stage as the alternative exit.
- **Capture:** [11.jpg](shots/09-claims/11.jpg) · [close-up](shots/09-claims/11-zoom.jpg)

## 10. Case Management (To-Be)

Source: `CASE MANAGEMENT TO BE PROCESS FLOW_07152026.pdf` · personas: compliance

General vs account-related inquiries, positive identification, point-of-contact handling or referral to the fulfilment unit, TAT monitoring and return to CCC.

### 10.01 Contact logged: general inquiry (no client) vs account-related concern

- **Who:** Lily Belarmino, Compliance Officer (CCC)
- **Screen:** Customer Servicing › Cases › Log case
- **Do:** Log the contact: leave Client blank for a general inquiry, choose the concern and describe it.
- **Enter:** Client: blank (general inquiry); Channel: phone; Concern: General inquiry; Description: What are your office hours?; Handled at point of contact: yes
- **Result:** The case is created and, being general, closed immediately.
- **Control:** General inquiries close at point of contact; account-related concerns need PID.
- **Capture:** [01.jpg](shots/10-case-management/01.jpg) · [close-up](shots/10-case-management/01-zoom.jpg)

### 10.02 General inquiry handled and closed at point of contact

- **Who:** Lily Belarmino, Compliance Officer (CCC)
- **Screen:** Customer Servicing › Cases
- **Do:** Read the toast and the case row.
- **Result:** Request number assigned; case type general; status closed.
- **System said:** SR-2026-00023 logged and closed at point of contact
- **Control:** No TAT applies to a case closed at point of contact.
- **Capture:** [02.jpg](shots/10-case-management/02.jpg) · [close-up](shots/10-case-management/02-zoom.jpg)

### 10.03 Account-related concern: positive identification (PID) and routing to the owning unit with a TAT

- **Who:** Lily Belarmino, Compliance Officer (CCC)
- **Screen:** Customer Servicing › Cases › Log case
- **Do:** Select the client, choose the concern, describe it and quote the PID answer given by the caller.
- **Enter:** Client: Acme Freight 73800; Concern: Billing (→ OPS); Description: Client disputes the amount on the latest invoice; Positive identification: acmefreight@example.com; TAT (hours): default for the category
- **Result:** PID is verified against the registered TIN or email; the case is routed to Operations with a TAT due time.
- **System said:** SR-2026-00023 logged and closed at point of contact
- **Control:** A failed PID blocks the case with reason PID_FAILED.
- **Capture:** [03.jpg](shots/10-case-management/03.jpg) · [close-up](shots/10-case-management/03-zoom.jpg)

### 10.04 Case referred to the fulfilment unit; TAT due time computed and past-TAT flagged

- **Who:** Lily Belarmino, Compliance Officer (CCC)
- **Screen:** Customer Servicing › Cases
- **Do:** Check the new case row.
- **Result:** Owning unit OPS, status open, TAT due timestamp; past-TAT cases are flagged on the dashboard.
- **System said:** SR-2026-00023 logged and closed at point of contact · SR-2026-00024 referred to OPS (TAT 48h)
- **Control:** TAT monitoring: tat_due_at = logged time + category TAT hours.
- **Capture:** [04.jpg](shots/10-case-management/04.jpg) · [close-up](shots/10-case-management/04-zoom.jpg)

### 10.05 Case returned to the Customer Contact Centre for re-logging with a reason

- **Who:** Lily Belarmino, Compliance Officer (CCC)
- **Screen:** Customer Servicing › Cases › Return to CCC
- **Do:** Press in progress, then Return to CCC and give the reason.
- **Enter:** Return reason: Mis-routed to billing; policy concern
- **Result:** Status returned with the reason stored; the fulfilment unit no longer owns it.
- **System said:** SR-2026-00024 referred to OPS (TAT 48h) · Case updated · Case updated
- **Control:** Return is allowed from open or in progress only.
- **Capture:** [05.jpg](shots/10-case-management/05.jpg) · [close-up](shots/10-case-management/05-zoom.jpg)

### 10.06 Case re-logged and back in the open queue

- **Who:** Lily Belarmino, Compliance Officer (CCC)
- **Screen:** Customer Servicing › Cases › Re-log
- **Do:** Press Re-log.
- **Result:** Status open again; the CCC re-routes it to the correct unit.
- **System said:** Case updated · Case updated · Case updated
- **Control:** Lifecycle: open → in progress → resolved → closed, with returned → open as the loop.
- **Capture:** [06.jpg](shots/10-case-management/06.jpg) · [close-up](shots/10-case-management/06-zoom.jpg)

## 11. Customer Servicing Facility

Source: `CUSTOMER SERVICING FACILITY - Process Flow.pdf` · personas: compliance

Search by invoice, policy or client name; view policies, invoices and receipts; update contact details.

### 11.01 Servicing facility: search by invoice no., policy no. or client name

- **Who:** Lily Belarmino, Compliance Officer (CCC)
- **Screen:** Customer Servicing › Servicing facility
- **Do:** Open Servicing facility, type an invoice number, policy number or client name and press Search.
- **Enter:** Search: Acme
- **Result:** Matching clients with their policies, invoices and receipts.
- **Control:** Search is entitlement-scoped to the servicing modules.
- **Capture:** [01.jpg](shots/11-customer-servicing-facility/01.jpg) · [close-up](shots/11-customer-servicing-facility/01-zoom.jpg)

### 11.02 Client contact details updated from the facility

- **Who:** Lily Belarmino, Compliance Officer (CCC)
- **Screen:** Customer Servicing › Servicing facility › Update contact
- **Do:** Press Update contact and enter the new email and phone.
- **Enter:** Email: updated73800@example.com; Phone: 0917-555-0100
- **Result:** Contact saved; the change is audited with before/after values.
- **System said:** Contact details updated
- **Control:** Contact updates are audited; PID applies before changes are accepted over the phone.
- **Capture:** [02.jpg](shots/11-customer-servicing-facility/02.jpg) · [close-up](shots/11-customer-servicing-facility/02-zoom.jpg)

## 12. Renewal (RMEL)

Source: `RENEWAL (1).pdf` · personas: renewals

Renewal master expiry list 140 days out, sanitation and disposition, initial and final RA letters, client acceptance and renewal placement.

### 12.01 RMEL: policies expiring within 140 days, pending sanitation

- **Who:** Carlo Mendoza, Renewal Officer
- **Screen:** Renewal › Pipeline
- **Do:** Open Renewal; the pipeline is the renewal master expiry list.
- **Result:** Policy POL-2026-00071 (expiring in 30 days) listed as pending sanitation with its days-to-expiry.
- **Control:** RMEL window: 140 days before expiry.
- **Capture:** [01.jpg](shots/12-renewal/01.jpg) · [close-up](shots/12-renewal/01-zoom.jpg)

### 12.02 Sanitation: disposition for renewal / remarket / not for renewal (NRNS letter)

- **Who:** Carlo Mendoza, Renewal Officer
- **Screen:** Renewal › For renewal
- **Do:** Press For renewal (or Remarket, or Not for renewal with a reason).
- **Result:** Disposition stored; RA letter actions appear according to the timing rules.
- **System said:** Dispositioned for renewal
- **Control:** Not for renewal sends the NRNS letter automatically.
- **Capture:** [02.jpg](shots/12-renewal/02.jpg) · [close-up](shots/12-renewal/02-zoom.jpg)

### 12.03 Initial renewal advice letter sent 70 days before expiry

- **Who:** Carlo Mendoza, Renewal Officer
- **Screen:** Renewal › Initial RA
- **Do:** Press Initial RA (−70d).
- **Result:** Initial renewal advice emailed to the client and logged as a notice.
- **System said:** Dispositioned for renewal · Initial RA letter sent
- **Control:** Initial RA is offered only once the policy is inside the 70-day window.
- **Capture:** [03.jpg](shots/12-renewal/03.jpg) · [close-up](shots/12-renewal/03-zoom.jpg)

### 12.04 Final renewal advice letter sent 45 days before expiry

- **Who:** Carlo Mendoza, Renewal Officer
- **Screen:** Renewal › Final RA
- **Do:** Press Final RA (−45d).
- **Result:** Final renewal advice emailed; both notices show on the row.
- **System said:** Dispositioned for renewal · Initial RA letter sent · Final RA letter sent
- **Control:** Final RA requires the initial RA to have been sent first.
- **Capture:** [04.jpg](shots/12-renewal/04.jpg) · [close-up](shots/12-renewal/04-zoom.jpg)

### 12.05 Client accepted: renewal policy enters placement and the e-policy cycle

- **Who:** Carlo Mendoza, Renewal Officer
- **Screen:** Renewal › Renew → placement
- **Do:** Press Client accepted, then Renew → placement and enter the renewal sum insured.
- **Enter:** Renewal sum insured: ₱120,000.00
- **Result:** A renewal policy is created in placement requested and linked to the expiring one.
- **System said:** Final RA letter sent · Client acceptance recorded · Renewal POL-2026-00072 placed with insurer (variance ₱112.00)
- **Control:** Renewal placement follows the same placement → booking → e-policy lifecycle as new business.
- **Capture:** [05.jpg](shots/12-renewal/05.jpg) · [close-up](shots/12-renewal/05-zoom.jpg)

## 13. Reinsurance

Source: `RENISURANCE PROCESS FLOW.pdf` · personas: ri.officer

Facultative request with 24-hour acknowledgement and 3-day slip TAT, underwriting information loop, reinsurer security rating, signed slips, closing and debit note; treaties and cessions.

### 13.01 Facultative placement request from marketing with the risk details

- **Who:** Ana Dizon, Reinsurance Officer
- **Screen:** Reinsurance › Facultative placements › Request
- **Do:** Fill in the facultative request and press Request placement.
- **Enter:** Cedant / policy no.: optional; Sum insured: ₱2,000,000,000.00; Share sought: default; Risk description: Petrochemical plant, sum insured PHP 2B
- **Result:** Request FAC-YYYY-NNNNN created in status requested.
- **Control:** The 24-hour acknowledgement TAT starts at request time.
- **Capture:** [01.jpg](shots/13-reinsurance/01.jpg) · [close-up](shots/13-reinsurance/01-zoom.jpg)

### 13.02 Request logged; acknowledgement due within 24 hours (TAT flag)

- **Who:** Ana Dizon, Reinsurance Officer
- **Screen:** Reinsurance › Facultative placements
- **Do:** Check the request row.
- **Result:** Status requested with the acknowledgement due time; late rows are flagged.
- **System said:** Facultative request logged · acknowledge within 24h
- **Control:** TAT: acknowledge within 24 hours, slip within 3 working days.
- **Capture:** [02.jpg](shots/13-reinsurance/02.jpg) · [close-up](shots/13-reinsurance/02-zoom.jpg)

### 13.03 Acknowledged; slip due within 3 working days

- **Who:** Ana Dizon, Reinsurance Officer
- **Screen:** Reinsurance › Acknowledge
- **Do:** Press Acknowledge (or Info received / Return incomplete when underwriting information is missing).
- **Result:** Status acknowledged; slip due date computed.
- **System said:** Facultative request logged · acknowledge within 24h · Placement acknowledged
- **Control:** Incomplete underwriting information loops back to marketing with what is missing.
- **Capture:** [03.jpg](shots/13-reinsurance/03.jpg) · [close-up](shots/13-reinsurance/03-zoom.jpg)

### 13.04 Slip: reinsurers approached with security rating, share and signed-slip evidence

- **Who:** Ana Dizon, Reinsurance Officer
- **Screen:** Reinsurance › Prepare slip
- **Do:** Press Prepare slip, add each reinsurer with rating, share and premium, tick Signed slip, then Save slip.
- **Enter:** Reinsurer: Munich Re; Rating: AA; Share: 1.00 (100%); Premium: ₱250,000.00; Signed slip: yes
- **Result:** Slip saved; placed share shown against the share sought.
- **System said:** Facultative request logged · acknowledge within 24h · Placement acknowledged
- **Control:** Security rating gate: reinsurers below the minimum rating are rejected; shares must total the sought share before closing.
- **Capture:** [04.jpg](shots/13-reinsurance/04.jpg) · [close-up](shots/13-reinsurance/04-zoom.jpg)

### 13.05 Closing: placement closed and debit note issued to the cedant

- **Who:** Ana Dizon, Reinsurance Officer
- **Screen:** Reinsurance › Close & debit note
- **Do:** Press Close & debit note.
- **Result:** Status placed; closing recorded and the debit note emailed to the cedant.
- **System said:** Placement acknowledged · Reinsurance slip prepared · Placed · closing and debit note DN-2026-00008 sent to cedant
- **Control:** Closing requires signed slips for every line.
- **Capture:** [05.jpg](shots/13-reinsurance/05.jpg) · [close-up](shots/13-reinsurance/05-zoom.jpg)

### 13.06 Treaty register and cessions with capacity monitoring

- **Who:** Ana Dizon, Reinsurance Officer
- **Screen:** Reinsurance › Treaties & cessions
- **Do:** Open Treaties & cessions: register treaties and cede policies.
- **Enter:** Treaty: code, name, reinsurer, type (quota share / surplus / XOL / facultative), cession rate, capacity, period; Cession: policy no., treaty
- **Result:** Cessions reduce remaining treaty capacity.
- **System said:** Placement acknowledged · Reinsurance slip prepared · Placed · closing and debit note DN-2026-00008 sent to cedant
- **Control:** A cession beyond capacity is refused.
- **Capture:** [06.jpg](shots/13-reinsurance/06.jpg) · [close-up](shots/13-reinsurance/06-zoom.jpg)

## 14. Submitted Policies

Source: `Submitted Policies_Process Flow.pdf` · personas: accountant

Masterlist validation, matching and consolidation, adequacy review with IAAF findings, and hand-off to sanitation 150 days from expiry.

### 14.01 Masterlist upload from the bank / insurer for validation and matching

- **Who:** Grace Lim, Accountant (FRBS)
- **Screen:** Submitted Policies › Masterlist batches
- **Do:** Choose the insurer for matching, paste or upload the masterlist CSV and press Run pipeline.
- **Enter:** Insurer (for matching): first insurer on the panel; File: CSV of policy no, client, premium, insurer, expiry
- **Result:** A batch is created and every row validated and matched against booked policies.
- **Control:** Rows are classified matched / unmatched / duplicate before consolidation.
- **Capture:** [01.jpg](shots/14-submitted-policies/01.jpg) · [close-up](shots/14-submitted-policies/01-zoom.jpg)

### 14.02 Rows validated, matched and consolidated; each reviewed for adequacy

- **Who:** Grace Lim, Accountant (FRBS)
- **Screen:** Submitted Policies › Masterlist batches › Run pipeline
- **Do:** Open the batch: each row offers Adequate or Findings → IAAF.
- **Result:** Batch totals and per-row classification with adequacy pending.
- **System said:** SPB-2026-00012: 0 masterlist · 0 renewal · 2 fallout · 1 excluded
- **Control:** Adequacy compares sum insured with the loan / collateral value.
- **Capture:** [02.jpg](shots/14-submitted-policies/02.jpg) · [close-up](shots/14-submitted-policies/02-zoom.jpg)

### 14.03 Findings recorded and an Insurance Adequacy Assessment Form (IAAF) issued

- **Who:** Grace Lim, Accountant (FRBS)
- **Screen:** Submitted Policies › Findings → IAAF
- **Do:** Press Findings → IAAF on a row and describe the finding.
- **Enter:** Findings: Sum insured below loan value
- **Result:** IAAF number issued and emailed; row marked with findings.
- **System said:** SPB-2026-00012: 0 masterlist · 0 renewal · 2 fallout · 1 excluded · IAAF IAAF-2026-00011 issued
- **Control:** Adequate rows need no IAAF.
- **Capture:** [03.jpg](shots/14-submitted-policies/03.jpg) · [close-up](shots/14-submitted-policies/03-zoom.jpg)

### 14.04 Policies 150 days from expiry sent to the sanitation handler for renewal / conversion opportunity

- **Who:** Grace Lim, Accountant (FRBS)
- **Screen:** Submitted Policies › Expiring (150 days)
- **Do:** Open Expiring (150 days).
- **Result:** Submitted policies expiring within 150 days, ready for the sanitation handler.
- **System said:** SPB-2026-00012: 0 masterlist · 0 renewal · 2 fallout · 1 excluded · IAAF IAAF-2026-00011 issued
- **Control:** Conversion opportunities proceed through New Business; NRNS cases are noted.
- **Capture:** [04.jpg](shots/14-submitted-policies/04.jpg) · [close-up](shots/14-submitted-policies/04-zoom.jpg)

## 15. Employee Benefits

Source: `EMPLOYEE BENEFITS - Process Flow.pdf` · personas: eb.officer

Renewal advice, BOR, TOR with master list and utilisation released to insurers, comparative analysis, award with ISACOM for non-accredited providers, handoff.

### 15.01 Prospect scheme created from the renewal advice

- **Who:** Mark Tan, Employee Benefits Officer
- **Screen:** Employee Benefits › Create scheme
- **Do:** Fill in the scheme and press Create scheme.
- **Enter:** Corporate client: first corporate client; Incumbent insurer: first insurer; Plan: Gold HMO 73800; Indicative premium per life: ₱12,000.00; Inception: default
- **Result:** Scheme EB-YYYY-NNNNN created in status prospect.
- **Control:** A scheme needs a BOR before insurers can be approached.
- **Capture:** [01.jpg](shots/15-employee-benefits/01.jpg) · [close-up](shots/15-employee-benefits/01-zoom.jpg)

### 15.02 Broker of Record received, Terms of Reference prepared, member census uploaded

- **Who:** Mark Tan, Employee Benefits Officer
- **Screen:** Employee Benefits › Scheme detail
- **Do:** Open the scheme, press BOR received, TOR prepared, then paste the census and press Upload census.
- **Enter:** Census rows: member no, name, birth date, dependents
- **Result:** Scheme documents flagged; members listed with covered lives count.
- **System said:** BOR received · TOR prepared · Census: 2 added, 0 updated
- **Control:** Master list and utilisation are part of the TOR pack.
- **Capture:** [02.jpg](shots/15-employee-benefits/02.jpg) · [close-up](shots/15-employee-benefits/02-zoom.jpg)

### 15.03 TOR, master list and utilisation released to insurers (franchise)

- **Who:** Mark Tan, Employee Benefits Officer
- **Screen:** Employee Benefits › Release TOR to insurers
- **Do:** Select the insurers to approach and press Release TOR to insurers.
- **Enter:** Insurers: first two on the panel (non-accredited ones are marked)
- **Result:** Proposal requests created per insurer in status requested.
- **System said:** TOR prepared · Census: 2 added, 0 updated · TOR, master list and utilisation released to insurers
- **Control:** Non-accredited insurers can quote but an award to them needs ISACOM approval.
- **Capture:** [03.jpg](shots/15-employee-benefits/03.jpg) · [close-up](shots/15-employee-benefits/03-zoom.jpg)

### 15.04 Comparative analysis of proposals: premium, benefits and capabilities

- **Who:** Mark Tan, Employee Benefits Officer
- **Screen:** Employee Benefits › Proposals
- **Do:** Press Record proposal for each insurer and enter premium, benefits and capabilities score.
- **Enter:** Insurer 1: ₱11,500 / life; Room and board 4,000; MBL 150,000; dental; capabilities 85; Insurer 2: ₱12,800 / life; Room and board 3,500; MBL 120,000; capabilities 70
- **Result:** Proposals sorted by premium with benefits and capability score side by side.
- **System said:** TOR, master list and utilisation released to insurers · Proposal recorded · Proposal recorded
- **Control:** Comparative analysis covers premium, benefits and capabilities (stability, providers, technology).
- **Capture:** [04.jpg](shots/15-employee-benefits/04.jpg) · [close-up](shots/15-employee-benefits/04-zoom.jpg)

### 15.05 Client confirmation and award; ISACOM approval when the provider is not accredited; handoff to processing and collections

- **Who:** Mark Tan, Employee Benefits Officer
- **Screen:** Employee Benefits › Award
- **Do:** Press Award on the chosen proposal after client confirmation.
- **Result:** Scheme placed and the handoff email sent, or ISACOM approval requested when the insurer is not accredited.
- **System said:** Proposal recorded · Proposal recorded · Awarded · handoff to processing and collections
- **Control:** eb_award approval type gates non-accredited providers.
- **Capture:** [05.jpg](shots/15-employee-benefits/05.jpg) · [close-up](shots/15-employee-benefits/05-zoom.jpg)

## 16. Product Maintenance (TSU)

Source: `PRODUCT MAINTENANCE TSU PROCESS_0709.pdf` · personas: admin → uw.head

Technical Services Unit request for non-packaged risks: completeness and duplicate check, quotation slip, TL approval, RI referral, insurer responses, comparative table and proposal slip; package maintenance with release advisory.

### 16.01 PRF / TSU request for a non-packaged risk with completeness and duplicate check

- **Who:** System Administrator, Administrator
- **Screen:** Product Maintenance › TSU requests › Submit
- **Do:** Fill in the TSU request and press Submit to TSU.
- **Enter:** Client: Warehouse Corp 73800; Line: as selected; Sum insured: ₱30,000,000.00; Risk details: Warehouse complex, sprinklered, Class A construction
- **Result:** Request TSU-YYYY-NNNNN created; duplicates for the same client and risk are rejected.
- **System said:** CLT-2026-00070 created · screening clear · tier low
- **Control:** Completeness and duplicate checks run on submission.
- **Capture:** [01.jpg](shots/16-product-maintenance-tsu/01.jpg) · [close-up](shots/16-product-maintenance-tsu/01-zoom.jpg)

### 16.02 TSU acknowledges the request (or returns it as incomplete)

- **Who:** System Administrator, Administrator
- **Screen:** Product Maintenance › TSU requests › Acknowledge
- **Do:** Press Acknowledge on the request row (Return incomplete is the alternative).
- **Result:** TSU-2026-00013 acknowledged; Prepare quotation slip appears.
- **System said:** CLT-2026-00070 created · screening clear · tier low · TSU request submitted · Request acknowledged
- **Control:** An incomplete request goes back to marketing and re-enters on Resubmitted.
- **Capture:** [02.jpg](shots/16-product-maintenance-tsu/02.jpg) · [close-up](shots/16-product-maintenance-tsu/02-zoom.jpg)

### 16.03 Quotation slip prepared and approved by the TL

- **Who:** System Administrator, Administrator
- **Screen:** Product Maintenance › TSU detail › TL approve QS
- **Do:** Press Prepare quotation slip and describe the terms, then TL approve QS.
- **Enter:** Quotation slip: Fire and allied perils, PHP 30M, deductible 1%
- **Result:** Status qs approved; the slip can be referred to RI or sent to insurers.
- **System said:** Request acknowledged · Request qs prepared · Request qs approved
- **Control:** TL approve QS is available to approvers only (green button).
- **Capture:** [03.jpg](shots/16-product-maintenance-tsu/03.jpg) · [close-up](shots/16-product-maintenance-tsu/03-zoom.jpg)

### 16.04 RI referral cleared; quotation slip sent to insurers

- **Who:** System Administrator, Administrator
- **Screen:** Product Maintenance › TSU detail › Send QS to insurers
- **Do:** Press Refer to RI, then RI cleared → send to insurers.
- **Result:** Status sent to insurers; insurer responses can be recorded in the detail card.
- **System said:** Request qs approved · Request ri referred · Request sent to insurers
- **Control:** Risks above treaty capacity are referred to RI before quoting.
- **Capture:** [04.jpg](shots/16-product-maintenance-tsu/04.jpg) · [close-up](shots/16-product-maintenance-tsu/04-zoom.jpg)

### 16.05 Insurer responses recorded (accepted with evidence / declined / conditional); comparative table ready

- **Who:** System Administrator, Administrator
- **Screen:** Product Maintenance › TSU detail › Comparative table
- **Do:** Press Record response per insurer and enter premium, evidence and conditions; then Comparative table ready.
- **Enter:** Premium quoted: ₱180,000.00; Acceptance evidence: signed slip; Conditions: Subject to survey
- **Result:** Status comparative ready; responses listed for comparison.
- **System said:** Request ri referred · Request sent to insurers · Request comparative ready
- **Control:** An acceptance without evidence (signed / stamped slip or explicit email) is not accepted.
- **Capture:** [05.jpg](shots/16-product-maintenance-tsu/05.jpg) · [close-up](shots/16-product-maintenance-tsu/05-zoom.jpg)

### 16.06 Proposal slip approved with the selected insurer; released to marketing and the client

- **Who:** System Administrator, Administrator
- **Screen:** Product Maintenance › TSU detail › Approve proposal slip
- **Do:** Press Approve proposal slip, choose the insurer and describe the proposal.
- **Enter:** Selected insurer id: 1; Proposal slip: Malayan selected: best terms, no exceptions
- **Result:** Status proposal approved; New Business can now quote the non-packaged product against this proposal.
- **System said:** Request sent to insurers · Request comparative ready · Request proposal approved
- **Control:** A non-packaged quotation must reference an approved TSU proposal.
- **Capture:** [06.jpg](shots/16-product-maintenance-tsu/06.jpg) · [close-up](shots/16-product-maintenance-tsu/06-zoom.jpg)

### 16.07 Packaged product catalogue with rates, taxes and limits

- **Who:** System Administrator, Administrator
- **Screen:** Product Maintenance › Packages
- **Do:** Open Packages: the catalogue of packaged products.
- **Result:** Each product shows base rate, commission, VAT/DST/LGT/FST, minimum premium, maximum sum insured and survey threshold.
- **System said:** Request comparative ready · Request proposal approved · Request closed
- **Control:** Changes to a product go through a maintenance request, never a direct edit.
- **Capture:** [07.jpg](shots/16-product-maintenance-tsu/07.jpg) · [close-up](shots/16-product-maintenance-tsu/07-zoom.jpg)

### 16.08 Package maintenance request raised for validation and approval

- **Who:** System Administrator, Administrator
- **Screen:** Product Maintenance › Packages › Change request
- **Do:** Press Change request on the product and answer the prompts.
- **Enter:** Field to change: commissionRate; New value: 0.16; Change summary: Commission uplift 73800
- **Result:** A product_change approval is raised.
- **System said:** Request proposal approved · Request closed · Maintenance request raised for approval
- **Control:** Product changes are maker-checker and publish a release advisory on approval.
- **Capture:** [08.jpg](shots/16-product-maintenance-tsu/08.jpg) · [close-up](shots/16-product-maintenance-tsu/08-zoom.jpg)

### 16.09 Approver validates the product change

- **Who:** Ramon Villareal, Underwriting Head (checker)
- **Screen:** Approvals & Audit › Pending
- **Do:** Open Approvals & Audit; the Pending tab lists requests raised by makers.
- **Result:** The request shows type, summary, maker, maker note and time raised.
- **Control:** Only users with approver rights on the module can decide; a maker can never approve their own request.
- **Capture:** [09.jpg](shots/16-product-maintenance-tsu/09.jpg) · [close-up](shots/16-product-maintenance-tsu/09-zoom.jpg)

### 16.10 Change applied and a release advisory published

- **Who:** Ramon Villareal, Underwriting Head (checker)
- **Screen:** Approvals & Audit › Approve
- **Do:** Press Approve and enter a checker note.
- **Enter:** Checker note: Reviewed and approved
- **Result:** Product updated; release advisory recorded and emailed to the distribution list.
- **System said:** Request approved
- **Control:** Every decision is written to the audit trail with before/after state.
- **Capture:** [10.jpg](shots/16-product-maintenance-tsu/10.jpg) · [close-up](shots/16-product-maintenance-tsu/10-zoom.jpg)

### 16.11 Insurer panel with accreditation and SFTP enrolment for placement channels

- **Who:** System Administrator, Administrator
- **Screen:** Product Maintenance › Insurers
- **Do:** Open Insurers to maintain the panel.
- **Enter:** Code, insurer name, accredited, SFTP enrolled
- **Result:** Accreditation drives ISACOM on EB awards; SFTP enrolment drives the placement channel.
- **Control:** Only accredited insurers appear in the New Business insurer picker by default.
- **Capture:** [11.jpg](shots/16-product-maintenance-tsu/11.jpg) · [close-up](shots/16-product-maintenance-tsu/11-zoom.jpg)
