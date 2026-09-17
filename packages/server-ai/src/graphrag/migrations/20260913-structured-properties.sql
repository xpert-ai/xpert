-- Additive, repeatable migration for source-owned structured graph properties.
BEGIN;
ALTER TABLE knowledge_graph_entity_contribution ADD COLUMN IF NOT EXISTS properties jsonb NULL;
ALTER TABLE knowledge_graph_relation_contribution ADD COLUMN IF NOT EXISTS properties jsonb NULL;
COMMIT;
