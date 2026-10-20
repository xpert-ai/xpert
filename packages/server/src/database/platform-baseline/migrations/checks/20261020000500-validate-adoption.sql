SELECT 'legacy:runtime-reliable-replies' AS missing WHERE EXISTS (
  SELECT 1 FROM xpert_project_task_execution
  WHERE "dispatchState"='pending' AND "dispatchNextAttemptAt" IS NULL AND "dispatchError" IS NULL
)
UNION ALL
SELECT 'legacy:execution-activity' WHERE EXISTS (
  SELECT 1 FROM agent_invocation_activity_state WHERE closed AND "expiresAt" IS NULL
)
UNION ALL
SELECT 'legacy:task-wait-groups' WHERE EXISTS (
  SELECT 1 FROM agent_invocation_wait WHERE "deadlineAt" IS NULL
)
UNION ALL
SELECT 'legacy:project-task-control' WHERE EXISTS (
  SELECT 1 FROM xpert_project_task WHERE "controlKind"='ordinary' AND "providerKey" IS NOT NULL
)
UNION ALL
SELECT 'legacy:model-execution-dispatch-needs-review' WHERE EXISTS (
  SELECT 1 FROM model_gateway_call WHERE source='execution_grant' AND "dispatchedAt" IS NULL
  -- Admission creates an undispatched call; preflight failure and worker recovery
  -- legitimately leave this marker NULL. Only upstream/settlement evidence is inconsistent.
  AND (status IN ('succeeded', 'settlement_pending') OR "usageFact" IS NOT NULL
    OR "usageDeliveredAt" IS NOT NULL OR "inputTokens" > 0 OR "outputTokens" > 0
    OR "totalTokens" > 0 OR "chargedPoints" > 0 OR "excessPoints" > 0)
)
UNION ALL
SELECT 'legacy:structured-mention-confidence' WHERE EXISTS (
  SELECT 1 FROM knowledge_graph_mention AS mention
  JOIN knowledge_document AS document ON mention."documentId"=document.id
    AND mention."knowledgebaseId"=document."knowledgebaseId"
  JOIN knowledge_graph_index_job AS job ON job.id::text=document.metadata #>> '{graphSource,publicationJobId}'
    AND job."documentId"=document.id AND job."sourceContentHash"=document."contentHash"
    AND job."sourcePublicationEpoch"=document."publicationEpoch" AND mention.revision=job.revision
  WHERE document.metadata #>> '{graphSource,mode}'='structured'
    AND job."extractionSnapshot" #>> '{publication,mode}'='structured'
    AND NOT jsonb_path_exists(job."extractionSnapshot", '$.**.confidence') AND mention.confidence=0
);
