-- Repair projections created before missing confidence was preserved as NULL.
-- Only current structured publications that contain no explicit confidence qualify.
-- Model/manual evidence and publications with explicit zero confidence are untouched.
BEGIN;
UPDATE knowledge_graph_mention AS mention
SET confidence = NULL
FROM knowledge_document AS document, knowledge_graph_index_job AS job
WHERE mention."documentId" = document.id
  AND mention."knowledgebaseId" = document."knowledgebaseId"
  AND job.id::text = document.metadata #>> '{graphSource,publicationJobId}'
  AND job."documentId" = document.id
  AND job."sourceContentHash" = document."contentHash"
  AND job."sourcePublicationEpoch" = document."publicationEpoch"
  AND mention.revision = job.revision
  AND document.metadata #>> '{graphSource,mode}' = 'structured'
  AND job."extractionSnapshot" #>> '{publication,mode}' = 'structured'
  AND NOT jsonb_path_exists(job."extractionSnapshot", '$.**.confidence')
  AND mention.confidence = 0;
COMMIT;
