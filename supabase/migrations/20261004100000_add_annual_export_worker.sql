CREATE TABLE IF NOT EXISTS annual_export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  requested_by uuid NOT NULL REFERENCES users(id),
  year smallint NOT NULL CHECK (year BETWEEN 1900 AND 2200),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','ready','failed')),
  result_storage_key text UNIQUE,
  error_message text,
  attempts integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '1 hour',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS annual_export_jobs_queue_idx ON annual_export_jobs(status,created_at);
CREATE INDEX IF NOT EXISTS annual_export_jobs_company_idx ON annual_export_jobs(company_id,requested_by,created_at DESC);
ALTER TABLE public.annual_export_jobs ENABLE ROW LEVEL SECURITY;
