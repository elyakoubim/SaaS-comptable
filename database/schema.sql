CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS accountants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mandants (
  ecb_number CHAR(10) PRIMARY KEY,
  company_name TEXT,
  accountant_id UUID NOT NULL REFERENCES accountants(id),
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expiry TIMESTAMPTZ NOT NULL,
  last_sync_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('ok', 'warning', 'alert')),
  consent_given_at TIMESTAMPTZ NOT NULL,
  consent_given_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mandants_accountant_id ON mandants(accountant_id);
CREATE INDEX IF NOT EXISTS idx_mandants_status ON mandants(status);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_ecb CHAR(10) NOT NULL REFERENCES mandants(ecb_number),
  niveau TEXT NOT NULL CHECK (niveau IN ('info', 'warning', 'critical')),
  titre TEXT NOT NULL,
  detail TEXT,
  document_fps_id TEXT NOT NULL UNIQUE,
  document_type_fps TEXT,
  document_date DATE,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  statut TEXT NOT NULL CHECK (statut IN ('active', 'acknowledged', 'resolved')),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES accountants(id)
);

CREATE INDEX IF NOT EXISTS idx_alerts_mandant_ecb ON alerts(mandant_ecb);
CREATE INDEX IF NOT EXISTS idx_alerts_status_level ON alerts(statut, niveau);

CREATE TABLE IF NOT EXISTS sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_ecb CHAR(10) NOT NULL REFERENCES mandants(ecb_number),
  job_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  error_code TEXT,
  error_detail TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_mandant ON sync_runs(mandant_ecb);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started_at ON sync_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS token_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_ecb CHAR(10) NOT NULL REFERENCES mandants(ecb_number),
  event_type TEXT NOT NULL CHECK (event_type IN ('token_exchange', 'token_refresh', 'refresh_failed')),
  event_status TEXT NOT NULL CHECK (event_status IN ('success', 'failed')),
  error_code TEXT,
  error_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_events_mandant ON token_events(mandant_ecb);
CREATE INDEX IF NOT EXISTS idx_token_events_created_at ON token_events(created_at DESC);

CREATE TABLE IF NOT EXISTS vat_period_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_ecb CHAR(10) NOT NULL REFERENCES mandants(ecb_number),
  period_label TEXT NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('monthly', 'quarterly')),
  declared_vat_amount NUMERIC(14, 2) NOT NULL,
  deductible_vat_amount NUMERIC(14, 2) NOT NULL,
  sales_amount NUMERIC(14, 2),
  payments_amount NUMERIC(14, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mandant_ecb, period_label)
);

CREATE INDEX IF NOT EXISTS idx_vat_period_mandant ON vat_period_aggregates(mandant_ecb);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_fps_id TEXT NOT NULL UNIQUE,
  mandant_ecb CHAR(10) NOT NULL REFERENCES mandants(ecb_number),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('CBE', 'SSIN')),
  owner_identifier TEXT NOT NULL,
  document_type_fps TEXT,
  document_date TIMESTAMPTZ,
  publish_date TIMESTAMPTZ,
  metadata JSONB,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_mandant_publish ON documents (mandant_ecb, publish_date DESC);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents (document_type_fps);
