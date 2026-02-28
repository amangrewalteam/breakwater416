-- =============================================================================
-- Harden plaid_items: one row per user, non-null access_token
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Step 1: Delete older duplicate rows, keep the newest per user_id
-- ---------------------------------------------------------------------------

DELETE FROM plaid_items
 WHERE id NOT IN (
   SELECT DISTINCT ON (user_id) id
     FROM plaid_items
    ORDER BY user_id, created_at DESC
 );

-- ---------------------------------------------------------------------------
-- Step 2: Drop the old composite unique constraint (user_id, item_id)
--         and replace with a simple unique on user_id.
--         This enforces exactly one bank connection per user.
-- ---------------------------------------------------------------------------

ALTER TABLE plaid_items
  DROP CONSTRAINT IF EXISTS plaid_items_user_id_item_id_key;

ALTER TABLE plaid_items
  DROP CONSTRAINT IF EXISTS plaid_items_user_id_key;

ALTER TABLE plaid_items
  ADD CONSTRAINT plaid_items_user_id_key UNIQUE (user_id);

-- ---------------------------------------------------------------------------
-- Step 3: Add a CHECK constraint so future writes cannot store a NULL token.
--         (We don't set NOT NULL yet in case old rows remain; a CHECK is
--         enforced only on new INSERT/UPDATE and is safe to add now.)
-- ---------------------------------------------------------------------------

ALTER TABLE plaid_items
  DROP CONSTRAINT IF EXISTS plaid_items_access_token_not_empty;

ALTER TABLE plaid_items
  ADD CONSTRAINT plaid_items_access_token_not_empty
  CHECK (access_token IS NOT NULL AND access_token <> '');
