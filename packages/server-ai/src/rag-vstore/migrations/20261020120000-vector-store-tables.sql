/* xpert-migration
{
  "dependsOn": ["core.platform.20261020000500-validate-adoption"],
  "mode": "transactional"
}
*/
CREATE TABLE IF NOT EXISTS copilot_store_vectors (
  prefix text NOT NULL, key text NOT NULL, field_name text NOT NULL, embedding vector,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP, updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (prefix, key, field_name),
  FOREIGN KEY (prefix, key) REFERENCES copilot_store(prefix, key) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS copilot_knowledge_collection (
  uuid uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, name varchar, cmetadata jsonb
);
CREATE INDEX IF NOT EXISTS idx_copilot_knowledge_collection_name ON copilot_knowledge_collection(name);
CREATE TABLE IF NOT EXISTS copilot_knowledge_vector (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, content text, metadata jsonb, vector vector
);
ALTER TABLE copilot_knowledge_vector ADD COLUMN IF NOT EXISTS collection_id uuid;
CREATE TABLE IF NOT EXISTS knowledge_document_collection (
  uuid uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, name varchar, cmetadata jsonb
);
CREATE INDEX IF NOT EXISTS idx_knowledge_document_collection_name ON knowledge_document_collection(name);
CREATE TABLE IF NOT EXISTS knowledge_document_vector (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, content text, metadata jsonb, vector vector
);
ALTER TABLE knowledge_document_vector ADD COLUMN IF NOT EXISTS collection_id uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='copilot_knowledge_vector'::regclass
    AND conname='copilot_knowledge_vector_collection_id_fkey') THEN
    ALTER TABLE copilot_knowledge_vector ADD CONSTRAINT copilot_knowledge_vector_collection_id_fkey
      FOREIGN KEY (collection_id) REFERENCES copilot_knowledge_collection(uuid) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='knowledge_document_vector'::regclass
    AND conname='knowledge_document_vector_collection_id_fkey') THEN
    ALTER TABLE knowledge_document_vector ADD CONSTRAINT knowledge_document_vector_collection_id_fkey
      FOREIGN KEY (collection_id) REFERENCES knowledge_document_collection(uuid) ON DELETE CASCADE;
  END IF;
END $$;
