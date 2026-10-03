CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Bangkok',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','payroll','viewer')),
  active boolean NOT NULL DEFAULT true,
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  code text NOT NULL,
  full_name text NOT NULL,
  normalized_name text NOT NULL,
  national_id_hash text,
  national_id_encrypted text,
  bank_account_encrypted text,
  employee_type text NOT NULL DEFAULT 'employee' CHECK (employee_type IN ('employee','director')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','resigned')),
  position text,
  department text,
  hire_date date,
  current_salary numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, code)
);
CREATE UNIQUE INDEX IF NOT EXISTS employees_national_id_idx ON employees(company_id,national_id_hash) WHERE national_id_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS employees_name_idx ON employees(company_id,normalized_name);

CREATE TABLE IF NOT EXISTS payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  year smallint NOT NULL CHECK (year BETWEEN 1900 AND 2200),
  month smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  payment_date date,
  active_import_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,year,month)
);

CREATE TABLE IF NOT EXISTS import_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  original_filename text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','committed','expired')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS import_uploads_company_time_idx ON import_uploads(company_id,created_at DESC);

CREATE TABLE IF NOT EXISTS imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  period_id uuid NOT NULL REFERENCES payroll_periods(id),
  version integer NOT NULL CHECK (version > 0),
  original_filename text NOT NULL,
  storage_key text NOT NULL,
  sha256 text NOT NULL,
  source_sheet text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','replaced','failed')),
  imported_by uuid REFERENCES users(id),
  imported_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(period_id,version)
);
ALTER TABLE payroll_periods DROP CONSTRAINT IF EXISTS payroll_periods_active_import_fk;
ALTER TABLE payroll_periods ADD CONSTRAINT payroll_periods_active_import_fk FOREIGN KEY (active_import_id) REFERENCES imports(id);
CREATE INDEX IF NOT EXISTS imports_period_idx ON imports(period_id,version DESC);

CREATE TABLE IF NOT EXISTS payroll_item_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  code text NOT NULL,
  label text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('income','deduction')),
  aliases text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,code)
);

CREATE TABLE IF NOT EXISTS import_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  normalized_header text NOT NULL,
  item_type_id uuid NOT NULL REFERENCES payroll_item_types(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,normalized_header)
);

CREATE TABLE IF NOT EXISTS payroll_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES imports(id),
  period_id uuid NOT NULL REFERENCES payroll_periods(id),
  employee_id uuid NOT NULL REFERENCES employees(id),
  source_row integer,
  excel_gross numeric(14,2),
  excel_net numeric(14,2),
  gross numeric(14,2) NOT NULL,
  deductions numeric(14,2) NOT NULL,
  net numeric(14,2) NOT NULL,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(import_id,employee_id)
);
CREATE INDEX IF NOT EXISTS payroll_entries_period_idx ON payroll_entries(period_id);
CREATE INDEX IF NOT EXISTS payroll_entries_employee_idx ON payroll_entries(employee_id);

CREATE TABLE IF NOT EXISTS payroll_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES payroll_entries(id) ON DELETE CASCADE,
  item_type_id uuid NOT NULL REFERENCES payroll_item_types(id),
  amount numeric(14,2) NOT NULL,
  source_header text,
  source_cell text,
  raw_formula text,
  raw_value text,
  source_type text NOT NULL CHECK (source_type IN ('imported','calculated','manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_items_entry_idx ON payroll_items(entry_id);

CREATE TABLE IF NOT EXISTS leave_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  employee_id uuid NOT NULL REFERENCES employees(id),
  date_from date NOT NULL,
  date_to date NOT NULL,
  leave_type text NOT NULL CHECK (leave_type IN ('personal','vacation','sick','unpaid','absence')),
  days numeric(5,2) NOT NULL CHECK (days > 0),
  reason text,
  note text,
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('imported','manual')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(date_to >= date_from)
);

CREATE TABLE IF NOT EXISTS salary_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  employee_id uuid NOT NULL REFERENCES employees(id),
  effective_date date NOT NULL,
  old_salary numeric(14,2) NOT NULL,
  new_salary numeric(14,2) NOT NULL,
  reason text,
  note text,
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('imported','manual')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES imports(id),
  row_number integer,
  field text,
  severity text NOT NULL CHECK (severity IN ('warning','error')),
  code text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_company_time_idx ON audit_logs(company_id,created_at DESC);

CREATE OR REPLACE VIEW active_payroll_entries AS
SELECT e.*,p.year,p.month,p.payment_date,p.company_id
FROM payroll_entries e
JOIN payroll_periods p ON p.id=e.period_id AND p.active_import_id=e.import_id;
