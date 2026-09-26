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
  category TEXT,
  actionable BOOLEAN NOT NULL DEFAULT FALSE,
  document_fps_id TEXT NOT NULL UNIQUE,
  document_type_fps TEXT,
  document_date DATE,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  statut TEXT NOT NULL CHECK (statut IN ('active', 'acknowledged', 'resolved')),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES accountants(id)
);

-- 23/09/2026 : category et actionable ajoutés pour la vue portefeuille.
-- documentClassifier.service.js les calcule depuis longtemps (11/09) mais ils
-- n'etaient jamais persistes. ADD COLUMN IF NOT EXISTS pour les bases deja
-- creees avant ce changement (ensureDatabaseSchema rejoue ce fichier a chaque
-- demarrage, cf. src/config/db.js).
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS actionable BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_alerts_mandant_ecb ON alerts(mandant_ecb);
CREATE INDEX IF NOT EXISTS idx_alerts_status_level ON alerts(statut, niveau);
CREATE INDEX IF NOT EXISTS idx_alerts_category ON alerts(category);

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

-- Abonnement Stripe (Vatu Connect / Vatu Pro). ADD COLUMN IF NOT EXISTS pour
-- les bases deja creees avant ce changement (ensureDatabaseSchema rejoue ce
-- fichier a chaque demarrage, cf. src/config/db.js).
ALTER TABLE accountants ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE accountants ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE accountants ADD COLUMN IF NOT EXISTS subscription_plan TEXT CHECK (subscription_plan IN ('connect', 'pro'));
ALTER TABLE accountants ADD COLUMN IF NOT EXISTS subscription_status TEXT;
ALTER TABLE accountants ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;
ALTER TABLE accountants ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_accountants_stripe_customer ON accountants (stripe_customer_id);

-- Lire avec l'IA (Vatu Pro, phase 3) : extraction ciblee montant/echeance/
-- reference sur une alerte, faite une fois par document puis mise en cache.
-- ADD COLUMN IF NOT EXISTS pour les bases deja creees avant ce changement
-- (ensureDatabaseSchema rejoue ce fichier a chaque demarrage, cf. src/config/db.js).
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS extracted_montant TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS extracted_date_echeance DATE;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS extracted_reference TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS extracted_accroche TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ;

-- Multi-utilisateurs par cabinet (decision du 24/09/2026) : un cabinet est
-- l'unite de propriete (mandats, abonnement Stripe), pas le login individuel.
-- V1 volontairement simple : pas de permissions par dossier, tout membre
-- d'un cabinet voit tous ses mandats ; role 'owner' (gere facturation et
-- invitations) ou 'member'.
CREATE TABLE IF NOT EXISTS cabinets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_plan TEXT CHECK (subscription_plan IN ('connect', 'pro')),
  subscription_status TEXT,
  subscription_current_period_end TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cabinets_stripe_customer ON cabinets (stripe_customer_id);

ALTER TABLE accountants ADD COLUMN IF NOT EXISTS cabinet_id UUID REFERENCES cabinets(id);
ALTER TABLE accountants ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'member'));

-- Backfill idempotent : chaque comptable existant sans cabinet devient owner
-- d'un cabinet cree pour lui, en reprenant son etat d'abonnement Stripe
-- actuel (accountants.stripe_* reste en place, non utilise, pour ne rien
-- perdre si ce script devait etre rejoue ou inspecte plus tard). Ne touche
-- que les lignes encore sans cabinet_id : sans effet a partir du deuxieme
-- redemarrage (ensureDatabaseSchema rejoue ce fichier a chaque boot).
DO $$
DECLARE
  rec RECORD;
  new_cabinet_id UUID;
BEGIN
  FOR rec IN SELECT * FROM accountants WHERE cabinet_id IS NULL LOOP
    INSERT INTO cabinets (
      name, stripe_customer_id, stripe_subscription_id, subscription_plan,
      subscription_status, subscription_current_period_end, trial_end
    )
    VALUES (
      rec.full_name, rec.stripe_customer_id, rec.stripe_subscription_id,
      rec.subscription_plan, rec.subscription_status,
      rec.subscription_current_period_end, rec.trial_end
    )
    RETURNING id INTO new_cabinet_id;

    UPDATE accountants SET cabinet_id = new_cabinet_id, role = 'owner' WHERE id = rec.id;
  END LOOP;
END $$;

ALTER TABLE accountants ALTER COLUMN cabinet_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accountants_cabinet_id ON accountants (cabinet_id);

-- mandants garde accountant_id (qui a donne le consentement, utile pour
-- l'audit) mais l'acces/la liste passent desormais par cabinet_id : tout
-- membre du cabinet voit le mandat, pas seulement qui l'a connecte.
ALTER TABLE mandants ADD COLUMN IF NOT EXISTS cabinet_id UUID REFERENCES cabinets(id);
UPDATE mandants m SET cabinet_id = a.cabinet_id
  FROM accountants a
  WHERE m.accountant_id = a.id AND m.cabinet_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_mandants_cabinet_id ON mandants (cabinet_id);

-- Invitations : pas d'envoi d'email automatise (pas d'infra email a ce
-- stade, cf. vatu/decisions.md Phase 1) - l'owner copie/colle le lien
-- lui-meme. Un token oppaque suffit, pas besoin d'expiration stricte en V1.
CREATE TABLE IF NOT EXISTS cabinet_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES cabinets(id),
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES accountants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cabinet_invitations_cabinet_id ON cabinet_invitations (cabinet_id);

-- Recap quotidien par email (24/09/2026, cf. vatu/decisions.md) : un email par
-- cabinet, une fois par jour, listant les alertes apparues depuis le dernier
-- envoi. DEFAULT NOW() evite qu'un cabinet deja existant recoive d'un coup
-- tout son historique au premier envoi apres deploiement de cette migration.
ALTER TABLE cabinets ADD COLUMN IF NOT EXISTS last_digest_sent_at TIMESTAMPTZ DEFAULT NOW();
