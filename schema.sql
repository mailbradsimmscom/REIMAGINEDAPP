-- Drop obsolete boat_id from system_knowledge; documents are for a single boat
ALTER TABLE IF EXISTS system_knowledge
  DROP COLUMN IF EXISTS boat_id;