-- =============================================================================
-- Day 1: Data Foundation — Lock Core Objects
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. plaid_items
--    Ensure all required columns exist. Standardise to `access_token`.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS plaid_items (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id          text        NOT NULL,
  access_token     text,
  institution_name text,
  cursor           text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);

-- Add missing columns on existing tables (idempotent)
ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS access_token     text;
ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS institution_name text;
ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS cursor           text;
ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS created_at       timestamptz NOT NULL DEFAULT now();
ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS updated_at       timestamptz NOT NULL DEFAULT now();

-- If the old column was called access_token_enc, copy it over then we keep both
-- (code will be updated to write/read `access_token` going forward)
ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS access_token_enc text;
UPDATE plaid_items
   SET access_token = access_token_enc
 WHERE access_token IS NULL
   AND access_token_enc IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. plaid_accounts (supporting table — used by /api/plaid/sync)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS plaid_accounts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id       text        NOT NULL,
  account_id    text        NOT NULL,
  name          text,
  mask          text,
  official_name text,
  subtype       text,
  type          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id)
);

ALTER TABLE plaid_accounts ADD COLUMN IF NOT EXISTS user_id    uuid        REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE plaid_accounts ADD COLUMN IF NOT EXISTS item_id    text;
ALTER TABLE plaid_accounts ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE plaid_accounts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- 3. plaid_transactions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS plaid_transactions (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id                 text,
  transaction_id          text        NOT NULL,
  account_id              text,
  name                    text,
  merchant_name           text,
  amount                  numeric(14,4),
  iso_currency_code       text,
  unofficial_currency_code text,
  date                    date,
  authorized_date         date,
  category_id             text,
  category                text[],
  pending                 boolean     NOT NULL DEFAULT false,
  transaction_type        text,
  payment_channel         text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_id)
);

ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS item_id                  text;
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS name                     text;
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS merchant_name            text;
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS iso_currency_code        text;
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS unofficial_currency_code text;
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS authorized_date          date;
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS category_id              text;
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS category                 text[];
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS transaction_type         text;
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS payment_channel          text;
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS created_at               timestamptz NOT NULL DEFAULT now();
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS updated_at               timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- 4. subscriptions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS subscriptions (
  id                     uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_name          text           NOT NULL,
  normalized_merchant    text           NOT NULL,
  amount                 numeric(12,2)  NOT NULL,
  currency               text           NOT NULL DEFAULT 'USD',
  cadence                text           NOT NULL DEFAULT 'monthly'
                           CHECK (cadence IN ('monthly', 'annual', 'unknown')),
  last_charge_date       date,
  next_estimated_renewal date,
  status                 text           NOT NULL DEFAULT 'suggested'
                           CHECK (status IN ('suggested', 'confirmed', 'ignored', 'active', 'inactive')),
  confidence_score       numeric(5,4),
  category               text,
  created_at             timestamptz    NOT NULL DEFAULT now(),
  updated_at             timestamptz    NOT NULL DEFAULT now(),
  UNIQUE (user_id, normalized_merchant, cadence)
);

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS currency               text          NOT NULL DEFAULT 'USD';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_charge_date       date;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS next_estimated_renewal date;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS category               text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS created_at             timestamptz   NOT NULL DEFAULT now();
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS updated_at             timestamptz   NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- 5. ai_insights
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_insights (
  id                      uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type                    text           NOT NULL
                            CHECK (type IN ('price_increase', 'renewal_upcoming', 'dormant', 'duplicate')),
  subscription_id         uuid           REFERENCES subscriptions(id) ON DELETE SET NULL,
  title                   text           NOT NULL,
  description             text,
  severity                text           NOT NULL DEFAULT 'medium'
                            CHECK (severity IN ('low', 'medium', 'high')),
  estimated_annual_impact numeric(12,2),
  status                  text           NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'dismissed', 'converted')),
  dedupe_key              text,
  created_at              timestamptz    NOT NULL DEFAULT now(),
  updated_at              timestamptz    NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);

-- ---------------------------------------------------------------------------
-- 6. actions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS actions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id uuid        REFERENCES subscriptions(id) ON DELETE SET NULL,
  insight_id      uuid        REFERENCES ai_insights(id) ON DELETE SET NULL,
  type            text        NOT NULL
                    CHECK (type IN ('cancel', 'downgrade', 'reminder', 'other')),
  status          text        NOT NULL DEFAULT 'prepared'
                    CHECK (status IN ('prepared', 'confirmed', 'completed')),
  payload         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 7. Row Level Security — enable on all five user-facing tables
-- ---------------------------------------------------------------------------

ALTER TABLE plaid_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE plaid_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE plaid_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights        ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions            ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 8. RLS Policies
--    Pattern: users see / write only their own rows.
--    Service-role bypasses RLS by default in Supabase.
-- ---------------------------------------------------------------------------

-- plaid_items
DROP POLICY IF EXISTS "plaid_items_select_own" ON plaid_items;
CREATE POLICY "plaid_items_select_own"
  ON plaid_items FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "plaid_items_insert_own" ON plaid_items;
CREATE POLICY "plaid_items_insert_own"
  ON plaid_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "plaid_items_update_own" ON plaid_items;
CREATE POLICY "plaid_items_update_own"
  ON plaid_items FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "plaid_items_delete_own" ON plaid_items;
CREATE POLICY "plaid_items_delete_own"
  ON plaid_items FOR DELETE
  USING (auth.uid() = user_id);

-- plaid_accounts
DROP POLICY IF EXISTS "plaid_accounts_select_own" ON plaid_accounts;
CREATE POLICY "plaid_accounts_select_own"
  ON plaid_accounts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "plaid_accounts_insert_own" ON plaid_accounts;
CREATE POLICY "plaid_accounts_insert_own"
  ON plaid_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "plaid_accounts_update_own" ON plaid_accounts;
CREATE POLICY "plaid_accounts_update_own"
  ON plaid_accounts FOR UPDATE
  USING (auth.uid() = user_id);

-- plaid_transactions
DROP POLICY IF EXISTS "plaid_transactions_select_own" ON plaid_transactions;
CREATE POLICY "plaid_transactions_select_own"
  ON plaid_transactions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "plaid_transactions_insert_own" ON plaid_transactions;
CREATE POLICY "plaid_transactions_insert_own"
  ON plaid_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "plaid_transactions_update_own" ON plaid_transactions;
CREATE POLICY "plaid_transactions_update_own"
  ON plaid_transactions FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "plaid_transactions_delete_own" ON plaid_transactions;
CREATE POLICY "plaid_transactions_delete_own"
  ON plaid_transactions FOR DELETE
  USING (auth.uid() = user_id);

-- subscriptions
DROP POLICY IF EXISTS "subscriptions_select_own" ON subscriptions;
CREATE POLICY "subscriptions_select_own"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "subscriptions_insert_own" ON subscriptions;
CREATE POLICY "subscriptions_insert_own"
  ON subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "subscriptions_update_own" ON subscriptions;
CREATE POLICY "subscriptions_update_own"
  ON subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "subscriptions_delete_own" ON subscriptions;
CREATE POLICY "subscriptions_delete_own"
  ON subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- ai_insights
DROP POLICY IF EXISTS "ai_insights_select_own" ON ai_insights;
CREATE POLICY "ai_insights_select_own"
  ON ai_insights FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_insights_insert_own" ON ai_insights;
CREATE POLICY "ai_insights_insert_own"
  ON ai_insights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_insights_update_own" ON ai_insights;
CREATE POLICY "ai_insights_update_own"
  ON ai_insights FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_insights_delete_own" ON ai_insights;
CREATE POLICY "ai_insights_delete_own"
  ON ai_insights FOR DELETE
  USING (auth.uid() = user_id);

-- actions
DROP POLICY IF EXISTS "actions_select_own" ON actions;
CREATE POLICY "actions_select_own"
  ON actions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "actions_insert_own" ON actions;
CREATE POLICY "actions_insert_own"
  ON actions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "actions_update_own" ON actions;
CREATE POLICY "actions_update_own"
  ON actions FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "actions_delete_own" ON actions;
CREATE POLICY "actions_delete_own"
  ON actions FOR DELETE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 9. Indexes (performance)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_plaid_items_user_id
  ON plaid_items (user_id);

CREATE INDEX IF NOT EXISTS idx_plaid_transactions_user_id
  ON plaid_transactions (user_id);

CREATE INDEX IF NOT EXISTS idx_plaid_transactions_date
  ON plaid_transactions (user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id
  ON subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_ai_insights_user_id
  ON ai_insights (user_id);

CREATE INDEX IF NOT EXISTS idx_ai_insights_subscription_id
  ON ai_insights (subscription_id);

CREATE INDEX IF NOT EXISTS idx_actions_user_id
  ON actions (user_id);

CREATE INDEX IF NOT EXISTS idx_actions_subscription_id
  ON actions (subscription_id);
