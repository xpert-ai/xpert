/* xpert-migration
{
  "dependsOn": [
    "core.platform.20261020000500-validate-adoption"
  ],
  "mode": "transactional"
}
*/
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "IDX_knowledge_document_filter_boundary" ON "knowledge_document" ("tenantId", "organizationId", "knowledgebaseId", "disabled");
CREATE INDEX IF NOT EXISTS "IDX_knowledge_document_name_trgm" ON "knowledge_document" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "IDX_knowledge_document_folder_trgm" ON "knowledge_document" USING gin ("folder" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "IDX_knowledge_document_folder_prefix" ON "knowledge_document" ("folder" text_pattern_ops);
CREATE INDEX IF NOT EXISTS "IDX_knowledge_document_type_mime" ON "knowledge_document" ("knowledgebaseId", "type", "mimeType");
CREATE INDEX IF NOT EXISTS "IDX_knowledge_document_category_source" ON "knowledge_document" ("knowledgebaseId", "category", "sourceType");
CREATE INDEX IF NOT EXISTS "IDX_knowledge_document_metadata_gin" ON "knowledge_document" USING gin ("metadata");
CREATE INDEX IF NOT EXISTS "IDX_knowledge_document_chunk_metadata_gin" ON "knowledge_document_chunk" USING gin ("metadata");
