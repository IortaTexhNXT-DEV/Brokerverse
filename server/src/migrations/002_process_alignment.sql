-- Aligns the schema with the BDOI high-level process flows (New Business, Operations, Collections,
-- Accounting/FRBS, Disbursement, Refund, ACSL, Claims, Case Management, Renewal, Reinsurance,
-- Submitted Policies, Employee Benefits, Product Maintenance/TSU).

-- ---------- Product Maintenance / TSU ----------
ALTER TABLE products ADD COLUMN packaged boolean NOT NULL DEFAULT true;
ALTER TABLE insurers ADD COLUMN accredited boolean NOT NULL DEFAULT true;
ALTER TABLE insurers ADD COLUMN sftp_enrolled boolean NOT NULL DEFAULT false;

CREATE TABLE tsu_requests (
  id serial PRIMARY KEY,
  request_no text NOT NULL UNIQUE,
  client_id int NOT NULL REFERENCES clients(id),
  product_id int REFERENCES products(id),
  line text NOT NULL,
  sum_insured numeric(16,2) NOT NULL,
  risk_details text NOT NULL,
  expiring_terms text,
  requires_ri boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','incomplete','acknowledged','qs_prepared','qs_approved','ri_referred','sent_to_insurers','comparative_ready','proposal_approved','closed','declined')),
  quotation_slip text,
  proposal_slip text,
  selected_insurer_id int REFERENCES insurers(id),
  created_by int REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tsu_insurer_responses (
  id serial PRIMARY KEY,
  request_id int NOT NULL REFERENCES tsu_requests(id) ON DELETE CASCADE,
  insurer_id int NOT NULL REFERENCES insurers(id),
  response text NOT NULL CHECK (response IN ('pending','accepted','declined','conditional')),
  premium numeric(14,2),
  conditions text,
  evidence text,
  responded_at timestamptz,
  UNIQUE (request_id, insurer_id)
);

CREATE TABLE release_advisories (
  id serial PRIMARY KEY,
  advisory_no text NOT NULL UNIQUE,
  product_id int NOT NULL REFERENCES products(id),
  summary text NOT NULL,
  changes jsonb NOT NULL,
  effective_date date NOT NULL,
  approved_by int REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- New Business: proposal acceptance and placement lifecycle ----------
ALTER TABLE quotations DROP CONSTRAINT quotations_status_check;
ALTER TABLE quotations ADD CONSTRAINT quotations_status_check CHECK (status IN ('quoted','proposal_sent','accepted','declined','converted','expired'));
ALTER TABLE quotations ADD COLUMN proposal_sent_at timestamptz;
ALTER TABLE quotations ADD COLUMN accepted_at timestamptz;
ALTER TABLE quotations ADD COLUMN decline_reason text;
ALTER TABLE quotations ADD COLUMN hold_cover_until date;
ALTER TABLE quotations ADD COLUMN tsu_request_id int REFERENCES tsu_requests(id);

ALTER TABLE policies DROP CONSTRAINT policies_status_check;
ALTER TABLE policies ADD CONSTRAINT policies_status_check CHECK (status IN ('placement_requested','returned','placed','pending_approval','in_force','cancelled','expired','renewed','rejected'));
ALTER TABLE policies ALTER COLUMN status SET DEFAULT 'placement_requested';
ALTER TABLE policies ADD COLUMN placement_requested_at timestamptz;
ALTER TABLE policies ADD COLUMN placed_at timestamptz;
ALTER TABLE policies ADD COLUMN insurer_policy_ref text;
ALTER TABLE policies ADD COLUMN return_reason text;
ALTER TABLE policies ADD COLUMN epolicy_channel text CHECK (epolicy_channel IN ('sftp','email','contact_centre'));
ALTER TABLE policies ADD COLUMN epolicy_sent_at timestamptz;
ALTER TABLE policies ADD COLUMN epolicy_exception text;
ALTER TABLE policies ADD COLUMN booked_at timestamptz;

-- ---------- Operations: payments, PDC, unapplied, direct payment, endorsements, production recon ----------
ALTER TABLE invoices ADD COLUMN credit_term_days int NOT NULL DEFAULT 30;

CREATE TABLE payments (
  id serial PRIMARY KEY,
  payment_no text NOT NULL UNIQUE,
  channel text NOT NULL CHECK (channel IN ('otc_cash','otc_cheque','bills_payment','clpc_file','trade_file','direct_credit','autopay','direct_to_insurer')),
  amount numeric(14,2) NOT NULL,
  reference text,
  cheque_no text,
  cheque_date date,
  received_at date NOT NULL,
  hold_until date,
  client_id int REFERENCES clients(id),
  invoice_id int REFERENCES invoices(id),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','held','matured','bounced','excluded','applied','unapplied','zero_pr')),
  exclusion_reason text,
  applied_amount numeric(14,2) NOT NULL DEFAULT 0,
  unapplied_amount numeric(14,2) NOT NULL DEFAULT 0,
  receipt_id int REFERENCES receipts(id),
  journal_id int REFERENCES journal_entries(id),
  created_by int REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_status_idx ON payments(status);
ALTER TABLE receipts ADD COLUMN payment_id int REFERENCES payments(id);

CREATE TABLE commission_receivables (
  id serial PRIMARY KEY,
  dp_no text NOT NULL UNIQUE,
  policy_id int NOT NULL REFERENCES policies(id),
  insurer_id int NOT NULL REFERENCES insurers(id),
  amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'identified' CHECK (status IN ('identified','billed','approved','rejected','collected')),
  insurer_reference text,
  billed_at timestamptz,
  collected_at timestamptz,
  receipt_no text,
  journal_id int REFERENCES journal_entries(id),
  note text,
  created_by int REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_id)
);

CREATE TABLE endorsements (
  id serial PRIMARY KEY,
  endorsement_no text NOT NULL UNIQUE,
  policy_id int NOT NULL REFERENCES policies(id),
  type text NOT NULL CHECK (type IN ('adjustment','cancellation')),
  description text NOT NULL,
  premium_delta numeric(14,2) NOT NULL DEFAULT 0,
  refund_amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval','posted','rejected')),
  created_by int REFERENCES users(id),
  posted_by int REFERENCES users(id),
  journal_id int REFERENCES journal_entries(id),
  refund_request_id int,
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz
);

CREATE TABLE production_recons (
  id serial PRIMARY KEY,
  recon_no text NOT NULL UNIQUE,
  insurer_id int NOT NULL REFERENCES insurers(id),
  period char(7) NOT NULL,
  total_rows int NOT NULL DEFAULT 0,
  matched int NOT NULL DEFAULT 0,
  discrepancy int NOT NULL DEFAULT 0,
  unbooked int NOT NULL DEFAULT 0,
  created_by int REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE production_recon_rows (
  id serial PRIMARY KEY,
  recon_id int NOT NULL REFERENCES production_recons(id) ON DELETE CASCADE,
  policy_no_raw text NOT NULL,
  premium_raw numeric(14,2),
  insurer_ref text,
  status text NOT NULL CHECK (status IN ('matched','discrepancy','unbooked')),
  policy_id int REFERENCES policies(id),
  variance numeric(14,2),
  disposition text
);

-- ---------- Collections: effort diary and credit-term extensions ----------
CREATE TABLE collection_efforts (
  id serial PRIMARY KEY,
  invoice_id int NOT NULL REFERENCES invoices(id),
  client_id int NOT NULL REFERENCES clients(id),
  effort_at timestamptz NOT NULL DEFAULT now(),
  mode text NOT NULL CHECK (mode IN ('call','email','visit','sms','messaging')),
  category text NOT NULL CHECK (category IN ('for_followup','committed','disputed','paid','for_cte','uncontactable')),
  commitment_date date,
  payment_arrangement text,
  contact_person text,
  contact_details text,
  remarks text,
  created_by int REFERENCES users(id)
);
CREATE INDEX collection_efforts_invoice_idx ON collection_efforts(invoice_id);

CREATE TABLE credit_term_extensions (
  id serial PRIMARY KEY,
  invoice_id int NOT NULL REFERENCES invoices(id),
  requested_days int NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_by int REFERENCES users(id),
  decided_by int REFERENCES users(id),
  decided_at timestamptz,
  previous_due_date date,
  new_due_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Accounting & Disbursement, Refund, ACSL ----------
CREATE TABLE fiscal_years (
  year int PRIMARY KEY,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_at timestamptz,
  closed_by int REFERENCES users(id),
  closing_journal_id int REFERENCES journal_entries(id)
);

CREATE TABLE refund_requests (
  id serial PRIMARY KEY,
  rrf_no text NOT NULL UNIQUE,
  client_id int NOT NULL REFERENCES clients(id),
  invoice_id int REFERENCES invoices(id),
  source_type text,
  source_id int,
  amount numeric(14,2) NOT NULL,
  reason text NOT NULL,
  payment_mode text NOT NULL CHECK (payment_mode IN ('credit_to_account','cheque','managers_cheque')),
  bank_account text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewed','approved','rejected','sent_to_disbursement')),
  requested_by int REFERENCES users(id),
  reviewed_by int REFERENCES users(id),
  approved_by int REFERENCES users(id),
  disbursement_id int,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE endorsements ADD CONSTRAINT endorsements_refund_fk FOREIGN KEY (refund_request_id) REFERENCES refund_requests(id);

CREATE TABLE disbursements (
  id serial PRIMARY KEY,
  voucher_no text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('refund','remittance','supplier','reimbursement','cash_advance','other')),
  payee_name text NOT NULL,
  client_id int REFERENCES clients(id),
  insurer_id int REFERENCES insurers(id),
  amount numeric(14,2) NOT NULL,
  mode text NOT NULL CHECK (mode IN ('cheque','credit_to_account','online_banking','managers_cheque')),
  bank_details text,
  reference text,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','pending_approval','approved','paid','rejected')),
  source_type text,
  source_id int,
  requested_by int REFERENCES users(id),
  reviewed_by int REFERENCES users(id),
  approved_by int REFERENCES users(id),
  paid_by int REFERENCES users(id),
  paid_at timestamptz,
  journal_id int REFERENCES journal_entries(id),
  confirmation_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE refund_requests ADD CONSTRAINT refund_requests_disb_fk FOREIGN KEY (disbursement_id) REFERENCES disbursements(id);

ALTER TABLE remittances DROP CONSTRAINT remittances_status_check;
ALTER TABLE remittances ADD CONSTRAINT remittances_status_check CHECK (status IN ('extracted','submitted','paid','rejected'));
ALTER TABLE remittances ALTER COLUMN status SET DEFAULT 'extracted';
ALTER TABLE remittances ADD COLUMN disbursement_id int REFERENCES disbursements(id);

CREATE TABLE insurer_soa_recons (
  id serial PRIMARY KEY,
  recon_no text NOT NULL UNIQUE,
  insurer_id int NOT NULL REFERENCES insurers(id),
  statement_total numeric(14,2) NOT NULL,
  ledger_total numeric(14,2) NOT NULL,
  variance numeric(14,2) NOT NULL,
  status text NOT NULL CHECK (status IN ('balanced','discrepancy','adjusted')),
  lines jsonb NOT NULL,
  adjustment_journal_id int REFERENCES journal_entries(id),
  created_by int REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Claims: documents, FLA, offer, settlement mode ----------
ALTER TABLE claims DROP CONSTRAINT claims_status_check;
ALTER TABLE claims ADD CONSTRAINT claims_status_check CHECK (status IN ('registered','documents_complete','fla_sent','under_review','offer_received','offer_accepted','approved','settled','declined','closed'));
ALTER TABLE claims ADD COLUMN fla_sent_at timestamptz;
ALTER TABLE claims ADD COLUMN adjuster_required boolean NOT NULL DEFAULT false;
ALTER TABLE claims ADD COLUMN insurer_claim_ref text;
ALTER TABLE claims ADD COLUMN offer_amount numeric(14,2);
ALTER TABLE claims ADD COLUMN offer_received_at timestamptz;
ALTER TABLE claims ADD COLUMN settlement_mode text CHECK (settlement_mode IN ('cash','loa'));

CREATE TABLE claim_documents (
  id serial PRIMARY KEY,
  claim_id int NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  name text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  received boolean NOT NULL DEFAULT false,
  received_at timestamptz,
  UNIQUE (claim_id, name)
);

-- ---------- Case management (customer servicing) ----------
ALTER TABLE service_requests DROP CONSTRAINT service_requests_status_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_status_check CHECK (status IN ('open','in_progress','resolved','closed','returned'));
ALTER TABLE service_requests ADD COLUMN case_type text NOT NULL DEFAULT 'account_related' CHECK (case_type IN ('general_inquiry','account_related'));
ALTER TABLE service_requests ADD COLUMN tat_hours int NOT NULL DEFAULT 48;
ALTER TABLE service_requests ADD COLUMN tat_due_at timestamptz;
ALTER TABLE service_requests ADD COLUMN handled_at_point_of_contact boolean NOT NULL DEFAULT false;
ALTER TABLE service_requests ADD COLUMN return_reason text;

-- ---------- Renewal ----------
ALTER TABLE renewal_notices DROP CONSTRAINT renewal_notices_notice_type_check;
ALTER TABLE renewal_notices ADD CONSTRAINT renewal_notices_notice_type_check CHECK (notice_type IN ('initial','final','reminder'));

CREATE TABLE renewal_dispositions (
  policy_id int PRIMARY KEY REFERENCES policies(id),
  disposition text NOT NULL CHECK (disposition IN ('for_renewal','not_for_renewal','client_declined','remarket')),
  note text,
  client_accepted boolean NOT NULL DEFAULT false,
  decided_by int REFERENCES users(id),
  decided_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Reinsurance: facultative placement ----------
CREATE TABLE ri_placements (
  id serial PRIMARY KEY,
  request_no text NOT NULL UNIQUE,
  tsu_request_id int REFERENCES tsu_requests(id),
  policy_id int REFERENCES policies(id),
  cedant text NOT NULL,
  risk_description text NOT NULL,
  sum_insured numeric(16,2) NOT NULL,
  requested_share numeric(6,4) NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','acknowledged','info_incomplete','slip_prepared','placed','declined')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  ack_due_at timestamptz NOT NULL,
  acknowledged_at timestamptz,
  slip_due_at timestamptz,
  slip_prepared_at timestamptz,
  placed_at timestamptz,
  debit_note_no text,
  created_by int REFERENCES users(id)
);

CREATE TABLE ri_placement_lines (
  id serial PRIMARY KEY,
  placement_id int NOT NULL REFERENCES ri_placements(id) ON DELETE CASCADE,
  reinsurer text NOT NULL,
  rating text NOT NULL,
  share numeric(6,4) NOT NULL,
  premium numeric(14,2) NOT NULL DEFAULT 0,
  signed_slip boolean NOT NULL DEFAULT false,
  conditions text
);

-- ---------- Submitted policies: adequacy review and expiry tracking ----------
ALTER TABLE submitted_rows ADD COLUMN insurer_name_raw text;
ALTER TABLE submitted_rows ADD COLUMN expiry_date date;
ALTER TABLE submitted_rows ADD COLUMN adequacy_status text NOT NULL DEFAULT 'pending' CHECK (adequacy_status IN ('pending','adequate','findings','iaaf_issued'));
ALTER TABLE submitted_rows ADD COLUMN findings text;
ALTER TABLE submitted_rows ADD COLUMN iaaf_no text;
ALTER TABLE submitted_rows ADD COLUMN reviewed_by int REFERENCES users(id);

-- ---------- Employee Benefits: BOR/TOR, proposals, award ----------
ALTER TABLE eb_schemes ADD COLUMN bor_received boolean NOT NULL DEFAULT false;
ALTER TABLE eb_schemes ADD COLUMN tor_prepared boolean NOT NULL DEFAULT false;
ALTER TABLE eb_schemes ADD COLUMN awarded_proposal_id int;
ALTER TABLE eb_schemes ADD COLUMN isacom_required boolean NOT NULL DEFAULT false;

CREATE TABLE eb_proposals (
  id serial PRIMARY KEY,
  scheme_id int NOT NULL REFERENCES eb_schemes(id) ON DELETE CASCADE,
  insurer_id int NOT NULL REFERENCES insurers(id),
  premium_per_life numeric(14,2),
  benefits text,
  capabilities_score int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','received','shortlisted','awarded','declined')),
  received_at timestamptz,
  UNIQUE (scheme_id, insurer_id)
);
ALTER TABLE eb_schemes ADD CONSTRAINT eb_schemes_award_fk FOREIGN KEY (awarded_proposal_id) REFERENCES eb_proposals(id);

-- ---------- GL accounts used by the new flows ----------
INSERT INTO gl_accounts(code, name, type) VALUES
  ('1250', 'Commission Receivable', 'asset'),
  ('2400', 'Unapplied Premium Payments', 'liability'),
  ('2500', 'Refunds Payable', 'liability')
ON CONFLICT DO NOTHING;
