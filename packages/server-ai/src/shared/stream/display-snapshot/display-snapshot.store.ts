// The DB commit grants permission to trim. A segment token fences delayed saves from earlier producers.
import { Injectable } from '@nestjs/common'
import type { TRunDisplaySnapshot } from '@xpert-ai/contracts'
import { DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import { runDisplaySnapshotSchema } from './display-snapshot.schema'
import type { FrozenDisplay } from './display-snapshot.capture'

export interface DisplaySnapshotScope {
    tenantId: string
    organizationId?: string | null
}
export interface DisplaySnapshotWriter extends DisplaySnapshotScope {
    threadId: string
    runId: string
    segmentId: string
    owner: string
    startedAt: string
}

@Injectable()
export class RunDisplaySnapshotStore {
    constructor(private readonly database: DataSource) {}

    async begin(
        scope: DisplaySnapshotScope,
        threadId: string,
        runId: string,
        owner: string
    ): Promise<DisplaySnapshotWriter | null> {
        const segmentId = randomUUID()
        const rows: { segmentId: string }[] = await this.database.query(
            `
            WITH owned_thread AS (
                SELECT t."threadId", t."tenantId", t."organizationId" FROM chat_conversation_thread t
                WHERE t."threadId" = $1 AND t."tenantId" = $3 AND t."organizationId" IS NOT DISTINCT FROM $4::uuid
                  AND t.metadata -> 'chatkitRunLease' ->> 'owner' = $6
                  AND t.metadata -> 'chatkitRunLease' ->> 'executionId' = ($2::uuid)::text
                  AND (t.metadata -> 'chatkitRunLease' ->> 'expiresAt')::timestamptz > CURRENT_TIMESTAMP
                FOR UPDATE
            )
            INSERT INTO chat_run_display_snapshot ("threadId", "runId", "tenantId", "organizationId", "segmentId")
            SELECT t."threadId", $2::uuid, t."tenantId", t."organizationId", $5 FROM owned_thread t
            ON CONFLICT ("threadId", "runId") DO UPDATE SET "segmentId" = EXCLUDED."segmentId",
                revision = 0, cursor = NULL, snapshot = NULL, "savedAt" = CURRENT_TIMESTAMP
            RETURNING "segmentId"`,
            [threadId, runId, scope.tenantId, scope.organizationId ?? null, segmentId, owner]
        )
        return rows.length ? { ...scope, threadId, runId, segmentId, owner, startedAt: new Date().toISOString() } : null
    }

    async save(
        writer: DisplaySnapshotWriter,
        revision: number,
        cursor: string,
        display: FrozenDisplay
    ): Promise<TRunDisplaySnapshot | null> {
        const snapshot: TRunDisplaySnapshot = {
            version: 1,
            threadId: writer.threadId,
            runId: writer.runId,
            segmentId: writer.segmentId,
            revision,
            cursor,
            savedAt: new Date().toISOString(),
            ...display
        }
        const [rows]: [{ revision: number }[], number] = await this.database.query(
            `
            UPDATE chat_run_display_snapshot SET revision = $6, cursor = $7, snapshot = $8::jsonb, "savedAt" = CURRENT_TIMESTAMP
            WHERE "threadId" = $1 AND "runId" = $2::uuid AND "tenantId" = $3 AND "organizationId" IS NOT DISTINCT FROM $4::uuid
              AND "segmentId" = $5 AND revision < $6
              AND (cursor IS NULL OR
                (split_part(cursor, '-', 1)::numeric, split_part(cursor, '-', 2)::numeric) <=
                (split_part($7, '-', 1)::numeric, split_part($7, '-', 2)::numeric))
              AND EXISTS (
                SELECT 1 FROM chat_conversation_thread t WHERE t."threadId" = $1
                  AND (t."runtimeContinuationBlockedAt" IS NULL OR t."runtimeContinuationBlockedAt" < $10::timestamptz)
                  AND t.metadata -> 'chatkitRunLease' ->> 'owner' = $9
                  AND t.metadata -> 'chatkitRunLease' ->> 'executionId' = ($2::uuid)::text
                  AND (t.metadata -> 'chatkitRunLease' ->> 'expiresAt')::timestamptz > CURRENT_TIMESTAMP
              )
            RETURNING revision`,
            [
                writer.threadId,
                writer.runId,
                writer.tenantId,
                writer.organizationId ?? null,
                writer.segmentId,
                revision,
                cursor,
                JSON.stringify(snapshot),
                writer.owner,
                writer.startedAt
            ]
        )
        return rows.length ? snapshot : null
    }

    /** Scope comes from the run authorized by the controller, never from the SSE cursor. */
    async read(scope: DisplaySnapshotScope, threadId: string, runId: string): Promise<TRunDisplaySnapshot | null> {
        const rows: { snapshot: unknown }[] = await this.database.query(
            `
            SELECT snapshot FROM chat_run_display_snapshot WHERE "threadId" = $1 AND "runId" = $2::uuid
              AND "tenantId" = $3 AND "organizationId" IS NOT DISTINCT FROM $4::uuid`,
            [threadId, runId, scope.tenantId, scope.organizationId ?? null]
        )
        const parsed = runDisplaySnapshotSchema.safeParse(rows[0]?.snapshot)
        if (!parsed.success || parsed.data.threadId !== threadId || parsed.data.runId !== runId) return null
        if (
            !parsed.data.messages.some((message) => message.id === parsed.data.activeMessageId) ||
            parsed.data.messages.some((message) => message.executionId !== runId)
        )
            return null
        // Runtime schema requires these fields; this repository disables strictNullChecks in Zod inference.
        return parsed.data as TRunDisplaySnapshot
    }
}
