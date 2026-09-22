-- BrokerVerse core schema
CREATE TABLE roles (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  modules text[] NOT NULL DEFAULT '{}',
  can_approve boolean NOT NULL DEFAULT false
);

CREATE TABLE users (
  id serial PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  role_code text NOT NULL REFERENCES roles(code),
  department text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  user_id int REFERENCES users(id),
  username text,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  before jsonb,
  after jsonb
);
CREATE INDEX audit_log_entity_idx ON audit_log(entity, entity_id);

CREATE TABLE sequences (
  key text PRIMARY KEY,
  prefix text NOT NULL,
  last_no int NOT NULL DEFAULT 0
);

CREATE TABLE accounting_periods (
  period char(7) PRIMARY KEY,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_at timestamptz,
  closed_by int REFERENCES users(id),
  reopened_at timestamptz,
  reopened_by int REFERENCES users(id)
);

CREATE TABLE gl_accounts (
  code text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('asset','liability','equity','income','expense'))
);

CREATE TABLE journal_entries (
  id serial PRIMARY KEY,
  jv_no text NOT NULL UNIQUE,
  period char(7) NOT NULL REFERENCES accounting_periods(period),
  entry_date date NOT NULL,
  description text NOT NULL,
  source_type text,
  source_id text,
  posted_by int REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE journal_lines (
  id serial PRIMARY KEY,
  journal_id int NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_code text NOT NULL REFERENCES gl_accounts(code),
  debit numeric(14,2) NOT NULL DEFAULT 0,
  credit numeric(14,2) NOT NULL DEFAULT 0,
  memo text
);
CREATE INDEX journal_lines_journal_idx ON journal_lines(journal_id);

CREATE TABLE approvals (
  id serial PRIMARY KEY,
  request_type text NOT NULL,
  entity text NOT NULL,
  entity_id int NOT NULL,
  summary text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  maker_id int NOT NULL REFERENCES users(id),
  checker_id int REFERENCES users(id),
  maker_note text,
  checker_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX approvals_status_idx ON approvals(status, created_at DESC);

CREATE TABLE sanctions_list (
  id serial PRIMARY KEY,
  name text NOT NULL,
  list_source text NOT NULL,
  category text NOT NULL DEFAULT 'sanction'
);

CREATE TABLE clients (
  id serial PRIMARY KEY,
  client_no text NOT NULL UNIQUE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('individual','corporate')),
  tin text,
  email text,
  phone text,
  address text,
  country text NOT NULL DEFAULT 'PH',
  pep boolean NOT NULL DEFAULT false,
  risk_score int NOT NULL DEFAULT 0,
  risk_tier text NOT NULL DEFAULT 'low',
  cdd_level text NOT NULL DEFAULT 'simplified',
  screening_status text NOT NULL DEFAULT 'clear' CHECK (screening_status IN ('clear','review','hit','declined')),
  screened_at timestamptz,
  created_by int REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE screening_results (
  id serial PRIMARY KEY,
  client_id int NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  matched_name text NOT NULL,
  list_source text,
  method text NOT NULL,
  score int NOT NULL,
  decision text,
  decided_by int REFERENCES users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE insurers (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  security_rating text NOT NULL DEFAULT 'A',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended'))
);

CREATE TABLE products (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  line text NOT NULL,
  base_rate numeric(10,6) NOT NULL,
  min_premium numeric(14,2) NOT NULL DEFAULT 0,
  commission_rate numeric(6,4) NOT NULL,
  vat_rate numeric(6,4) NOT NULL DEFAULT 0.12,
  dst_rate numeric(6,4) NOT NULL DEFAULT 0.125,
  lgt_rate numeric(6,4) NOT NULL DEFAULT 0.0075,
  fst_rate numeric(6,4) NOT NULL DEFAULT 0,
  max_sum_insured numeric(16,2),
  survey_required_above numeric(16,2),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quotations (
  id serial PRIMARY KEY,
  quote_no text NOT NULL UNIQUE,
  client_id int NOT NULL REFERENCES clients(id),
  product_id int NOT NULL REFERENCES products(id),
  insurer_id int NOT NULL REFERENCES insurers(id),
  sum_insured numeric(16,2) NOT NULL,
  premium numeric(14,2) NOT NULL,
  vat numeric(14,2) NOT NULL,
  dst numeric(14,2) NOT NULL,
  lgt numeric(14,2) NOT NULL,
  fst numeric(14,2) NOT NULL,
  total_amount numeric(14,2) NOT NULL,
  commission numeric(14,2) NOT NULL,
  inception_date date NOT NULL,
  expiry_date date NOT NULL,
  survey_required boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'quoted' CHECK (status IN ('quoted','converted','declined','expired')),
  created_by int REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE policies (
  id serial PRIMARY KEY,
  policy_no text NOT NULL UNIQUE,
  quotation_id int REFERENCES quotations(id),
  client_id int NOT NULL REFERENCES clients(id),
  product_id int NOT NULL REFERENCES products(id),
  insurer_id int NOT NULL REFERENCES insurers(id),
  sum_insured numeric(16,2) NOT NULL,
  premium numeric(14,2) NOT NULL,
  vat numeric(14,2) NOT NULL,
  dst numeric(14,2) NOT NULL,
  lgt numeric(14,2) NOT NULL,
  fst numeric(14,2) NOT NULL,
  total_amount numeric(14,2) NOT NULL,
  commission numeric(14,2) NOT NULL,
  inception_date date NOT NULL,
  expiry_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval','in_force','cancelled','expired','renewed','rejected')),
  renewed_from_id int REFERENCES policies(id),
  created_by int REFERENCES users(id),
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX policies_client_idx ON policies(client_id);
CREATE INDEX policies_status_idx ON policies(status);

CREATE TABLE invoices (
  id serial PRIMARY KEY,
  invoice_no text NOT NULL UNIQUE,
  policy_id int NOT NULL REFERENCES policies(id),
  client_id int NOT NULL REFERENCES clients(id),
  amount numeric(14,2) NOT NULL,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','partial','paid')),
  due_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE receipts (
  id serial PRIMARY KEY,
  receipt_no text NOT NULL UNIQUE,
  invoice_id int NOT NULL REFERENCES invoices(id),
  client_id int NOT NULL REFERENCES clients(id),
  amount numeric(14,2) NOT NULL,
  method text NOT NULL CHECK (method IN ('cash','cheque','transfer','card')),
  reference text,
  received_at date NOT NULL,
  received_by int REFERENCES users(id),
  journal_id int REFERENCES journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE remittances (
  id serial PRIMARY KEY,
  voucher_no text NOT NULL UNIQUE,
  insurer_id int NOT NULL REFERENCES insurers(id),
  amount numeric(14,2) NOT NULL,
  policy_ids int[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval','approved','paid','rejected')),
  cheque_no text,
  created_by int REFERENCES users(id),
  journal_id int REFERENCES journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE TABLE claims (
  id serial PRIMARY KEY,
  claim_no text NOT NULL UNIQUE,
  policy_id int NOT NULL REFERENCES policies(id),
  client_id int NOT NULL REFERENCES clients(id),
  loss_date date NOT NULL,
  reported_date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL,
  estimated_amount numeric(14,2) NOT NULL DEFAULT 0,
  reserve_amount numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','under_review','approved','settled','declined','closed')),
  created_by int REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE claim_events (
  id serial PRIMARY KEY,
  claim_id int NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  user_id int REFERENCES users(id),
  event text NOT NULL,
  note text
);

CREATE TABLE renewal_notices (
  id serial PRIMARY KEY,
  policy_id int NOT NULL REFERENCES policies(id),
  notice_no text NOT NULL UNIQUE,
  notice_type text NOT NULL CHECK (notice_type IN ('first','second','final')),
  channel text NOT NULL DEFAULT 'email',
  sent_by int REFERENCES users(id),
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE treaties (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  reinsurer text NOT NULL,
  reinsurer_rating text NOT NULL DEFAULT 'A',
  type text NOT NULL CHECK (type IN ('quota_share','surplus','xol','facultative')),
  cession_rate numeric(6,4) NOT NULL,
  capacity numeric(16,2) NOT NULL,
  inception_date date NOT NULL,
  expiry_date date NOT NULL,
  status text NOT NULL DEFAULT 'active'
);

CREATE TABLE cessions (
  id serial PRIMARY KEY,
  policy_id int NOT NULL REFERENCES policies(id),
  treaty_id int NOT NULL REFERENCES treaties(id),
  ceded_sum_insured numeric(16,2) NOT NULL,
  ceded_premium numeric(14,2) NOT NULL,
  created_by int REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_id, treaty_id)
);

CREATE TABLE eb_schemes (
  id serial PRIMARY KEY,
  scheme_no text NOT NULL UNIQUE,
  client_id int NOT NULL REFERENCES clients(id),
  insurer_id int NOT NULL REFERENCES insurers(id),
  plan_name text NOT NULL,
  per_member_premium numeric(14,2) NOT NULL,
  inception_date date NOT NULL,
  expiry_date date NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE eb_members (
  id serial PRIMARY KEY,
  scheme_id int NOT NULL REFERENCES eb_schemes(id) ON DELETE CASCADE,
  member_no text NOT NULL,
  name text NOT NULL,
  birth_date date,
  dependents int NOT NULL DEFAULT 0,
  joined_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn')),
  UNIQUE (scheme_id, member_no)
);

CREATE TABLE service_requests (
  id serial PRIMARY KEY,
  request_no text NOT NULL UNIQUE,
  client_id int REFERENCES clients(id),
  channel text NOT NULL DEFAULT 'email',
  category text NOT NULL,
  description text NOT NULL,
  owning_unit text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  identity_verified boolean NOT NULL DEFAULT false,
  created_by int REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE submitted_batches (
  id serial PRIMARY KEY,
  batch_no text NOT NULL UNIQUE,
  insurer_id int NOT NULL REFERENCES insurers(id),
  file_name text NOT NULL,
  total_rows int NOT NULL DEFAULT 0,
  masterlist int NOT NULL DEFAULT 0,
  renewal int NOT NULL DEFAULT 0,
  excluded int NOT NULL DEFAULT 0,
  fallout int NOT NULL DEFAULT 0,
  uploaded_by int REFERENCES users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE submitted_rows (
  id serial PRIMARY KEY,
  batch_id int NOT NULL REFERENCES submitted_batches(id) ON DELETE CASCADE,
  policy_no_raw text NOT NULL,
  client_name_raw text NOT NULL,
  premium_raw numeric(14,2),
  classification text NOT NULL,
  matched_policy_id int REFERENCES policies(id)
);

CREATE TABLE migration_batches (
  id serial PRIMARY KEY,
  batch_no text NOT NULL UNIQUE,
  entity text NOT NULL,
  source_count int NOT NULL,
  source_value numeric(16,2) NOT NULL DEFAULT 0,
  loaded_count int NOT NULL DEFAULT 0,
  loaded_value numeric(16,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reconciled','disposition_required','dispositioned')),
  disposition_note text,
  created_by int REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_outbox (
  id serial PRIMARY KEY,
  to_addr text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  template text NOT NULL,
  ref_type text,
  ref_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
