-- =============================================================================
-- Fix: migrate subscriptions from old column names to spec column names,
--      then add PK, unique constraint, and create ai_insights + actions.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add new spec columns alongside old ones (idempotent)
-- ---------------------------------------------------------------------------

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS merchant_name          text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS normalized_merchant    text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS amount                 numeric(12,2);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS confidence_score       numeric(5,4);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_charge_date       date;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS next_estimated_renewal date;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS currency               text NOT NULL DEFAULT 'USD';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS category               text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS created_at             timestamptz NOT NULL DEFAULT now();
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS updated_at             timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- 2. Back-fill new columns from old columns where data exists
-- ---------------------------------------------------------------------------

-- merchant_name ← display_name (if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'subscriptions'
               AND column_name = 'display_name') THEN
    UPDATE subscriptions SET merchant_name = display_name
     WHERE merchant_name IS NULL AND display_name IS NOT NULL;
  END IF;
END $$;

-- normalized_merchant ← merchant_norm (if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'subscriptions'
               AND column_name = 'merchant_norm') THEN
    UPDATE subscriptions SET normalized_merchant = merchant_norm
     WHERE normalized_merchant IS NULL AND merchant_norm IS NOT NULL;
  END IF;
END $$;

-- amount ← amount_cents / 100 (if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'subscriptions'
               AND column_name = 'amount_cents') THEN
    UPDATE subscriptions SET amount = amount_cents::numeric / 100
     WHERE amount IS NULL AND amount_cents IS NOT NULL;
  END IF;
END $$;

-- confidence_score ← confidence (if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'subscriptions'
               AND column_name = 'confidence') THEN
    UPDATE subscriptions SET confidence_score = confidence::numeric
     WHERE confidence_score IS NULL AND confidence IS NOT NULL;
  END IF;
END $$;

-- last_charge_date ← last_seen (if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'subscriptions'
               AND column_name = 'last_seen') THEN
    UPDATE subscriptions SET last_charge_date = last_seen::date
     WHERE last_charge_date IS NULL AND last_seen IS NOT NULL;
  END IF;
END $$;

-- Fallback: any rows still missing normalized_merchant or merchant_name
UPDATE subscriptions
   SET normalized_merchant = COALESCE(normalized_merchant, merchant_name, 'unknown'),
       merchant_name       = COALESCE(merchant_name, normalized_merchant, 'unknown')
 WHERE normalized_merchant IS NULL OR merchant_name IS NULL;

-- amount: set 0 if still null
UPDATE subscriptions SET amount = 0 WHERE amount IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Set NOT NULL on the columns that require it (now data is populated)
-- ---------------------------------------------------------------------------

ALTER TABLE subscriptions ALTER COLUMN merchant_name       SET NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN normalized_merchant SET NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN amount              SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Ensure status values are in the allowed set
-- ---------------------------------------------------------------------------

-- Map old status values to new ones
UPDATE subscriptions SET status = 'suggested'  WHERE status = 'tracking';
UPDATE subscriptions SET status = 'confirmed'  WHERE status NOT IN ('suggested','confirmed','ignored','active','inactive');

-- Add/replace the check constraint
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('suggested', 'confirmed', 'ignored', 'active', 'inactive'));

-- ---------------------------------------------------------------------------
-- 5. Ensure id column + PRIMARY KEY
-- ---------------------------------------------------------------------------

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
UPDATE subscriptions SET id = gen_random_uuid() WHERE id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE subscriptions ADD PRIMARY KEY (id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Unique constraint on (user_id, normalized_merchant, cadence)
--    Drop first in case a stale version exists, then recreate.
-- ---------------------------------------------------------------------------

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_user_id_normalized_merchant_cadence_key;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_user_id_normalized_merchant_cadence_key
  UNIQUE (user_id, normalized_merchant, cadence);

-- ---------------------------------------------------------------------------
-- 7. ai_insights
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_insights (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type                    text          NOT NULL
                            CHECK (type IN ('price_increase','renewal_upcoming','dormant','duplicate')),
  subscription_id         uuid          REFERENCES subscriptions(id) ON DELETE SET NULL,
  title                   text          NOT NULL,
  description             text,
  severity                text          NOT NULL DEFAULT 'medium'
                            CHECK (severity IN ('low','medium','high')),
  estimated_annual_impact numeric(12,2),
  status                  text          NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','dismissed','converted')),
  dedupe_key              text,
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);

-- ---------------------------------------------------------------------------
-- 8. actions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS actions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id uuid        REFERENCES subscriptions(id) ON DELETE SET NULL,
  insight_id      uuid        REFERENCES ai_insights(id) ON DELETE SET NULL,
  type            text        NOT NULL
                    CHECK (type IN ('cancel','downgrade','reminder','other')),
  status          text        NOT NULL DEFAULT 'prepared'
                    CHECK (status IN ('prepared','confirmed','completed')),
  payload         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 9. RLS on new tables
-- ---------------------------------------------------------------------------

ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_insights_select_own" ON ai_insights;
CREATE POLICY "ai_insights_select_own" ON ai_insights FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "ai_insights_insert_own" ON ai_insights;
CREATE POLICY "ai_insights_insert_own" ON ai_insights FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "ai_insights_update_own" ON ai_insights;
CREATE POLICY "ai_insights_update_own" ON ai_insights FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "ai_insights_delete_own" ON ai_insights;
CREATE POLICY "ai_insights_delete_own" ON ai_insights FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "actions_select_own" ON actions;
CREATE POLICY "actions_select_own" ON actions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "actions_insert_own" ON actions;
CREATE POLICY "actions_insert_own" ON actions FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "actions_update_own" ON actions;
CREATE POLICY "actions_update_own" ON actions FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "actions_delete_own" ON actions;
CREATE POLICY "actions_delete_own" ON actions FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 10. Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id     ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_user_id       ON ai_insights (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_subscription  ON ai_insights (subscription_id);
CREATE INDEX IF NOT EXISTS idx_actions_user_id           ON actions (user_id);
CREATE INDEX IF NOT EXISTS idx_actions_subscription      ON actions (subscription_id);
