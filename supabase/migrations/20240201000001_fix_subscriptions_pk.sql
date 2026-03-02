-- =============================================================================
-- Fix: ensure subscriptions.id is a proper primary key,
--      then create ai_insights and actions tables.
-- Run this in Supabase SQL Editor after the main migration.
-- =============================================================================

-- 1. Add id column if it doesn't exist yet
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

-- 2. Backfill any rows that have a NULL id
UPDATE subscriptions SET id = gen_random_uuid() WHERE id IS NULL;

-- 3. Add the primary key constraint if it isn't already there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE subscriptions ADD PRIMARY KEY (id);
  END IF;
END $$;

-- 4. Add unique constraint on (user_id, normalized_merchant, cadence) if missing
--    (needed for the upsert onConflict in the detection route)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid  = 'public.subscriptions'::regclass
      AND contype   = 'u'
      AND conname   = 'subscriptions_user_id_normalized_merchant_cadence_key'
  ) THEN
    ALTER TABLE subscriptions
      ADD CONSTRAINT subscriptions_user_id_normalized_merchant_cadence_key
      UNIQUE (user_id, normalized_merchant, cadence);
  END IF;
END $$;

-- 5. Now that subscriptions(id) is guaranteed unique, create ai_insights
CREATE TABLE IF NOT EXISTS ai_insights (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type                    text          NOT NULL
                            CHECK (type IN ('price_increase', 'renewal_upcoming', 'dormant', 'duplicate')),
  subscription_id         uuid          REFERENCES subscriptions(id) ON DELETE SET NULL,
  title                   text          NOT NULL,
  description             text,
  severity                text          NOT NULL DEFAULT 'medium'
                            CHECK (severity IN ('low', 'medium', 'high')),
  estimated_annual_impact numeric(12,2),
  status                  text          NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'dismissed', 'converted')),
  dedupe_key              text,
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);

-- 6. Create actions
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

-- 7. Enable RLS on new tables
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions     ENABLE ROW LEVEL SECURITY;

-- 8. ai_insights policies
DROP POLICY IF EXISTS "ai_insights_select_own" ON ai_insights;
CREATE POLICY "ai_insights_select_own" ON ai_insights FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "ai_insights_insert_own" ON ai_insights;
CREATE POLICY "ai_insights_insert_own" ON ai_insights FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "ai_insights_update_own" ON ai_insights;
CREATE POLICY "ai_insights_update_own" ON ai_insights FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "ai_insights_delete_own" ON ai_insights;
CREATE POLICY "ai_insights_delete_own" ON ai_insights FOR DELETE USING (auth.uid() = user_id);

-- 9. actions policies
DROP POLICY IF EXISTS "actions_select_own" ON actions;
CREATE POLICY "actions_select_own" ON actions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "actions_insert_own" ON actions;
CREATE POLICY "actions_insert_own" ON actions FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "actions_update_own" ON actions;
CREATE POLICY "actions_update_own" ON actions FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "actions_delete_own" ON actions;
CREATE POLICY "actions_delete_own" ON actions FOR DELETE USING (auth.uid() = user_id);

-- 10. Indexes
CREATE INDEX IF NOT EXISTS idx_ai_insights_user_id       ON ai_insights (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_subscription  ON ai_insights (subscription_id);
CREATE INDEX IF NOT EXISTS idx_actions_user_id           ON actions (user_id);
CREATE INDEX IF NOT EXISTS idx_actions_subscription      ON actions (subscription_id);
