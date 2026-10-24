-- Apply before enabling durable display projections. No business execution state is stored here.
CREATE TABLE IF NOT EXISTS chat_run_display_snapshot (
    "threadId" varchar(100) NOT NULL REFERENCES chat_conversation_thread("threadId") ON DELETE CASCADE,
    "runId" uuid NOT NULL REFERENCES xpert_agent_execution(id) ON DELETE CASCADE,
    "tenantId" uuid NOT NULL,
    "organizationId" uuid,
    "segmentId" uuid NOT NULL,
    revision integer NOT NULL DEFAULT 0,
    cursor varchar,
    snapshot jsonb,
    "savedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("threadId", "runId")
);
