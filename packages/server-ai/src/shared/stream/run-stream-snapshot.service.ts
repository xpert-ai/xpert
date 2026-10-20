// A snapshot and its message projection commit together. Only that committed cursor may be trimmed.
// Cursor/epoch ordering fences delayed producers and progress writes never overwrite terminal messages.
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { RunStreamSnapshot } from './run-stream-snapshot.entity'
import { runStreamSnapshotPayloadSchema, type RunStreamSnapshotPayload } from './run-stream-snapshot.schema'

@Injectable()
export class RunStreamSnapshotService {
    constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

    async save(
        scope: { tenantId: string; threadId: string; runId: string; epoch: string; cursor: string },
        payload: RunStreamSnapshotPayload
    ): Promise<boolean> {
        return this.dataSource.transaction(async (manager) => {
            const rows: unknown = await manager.query(
                `
                INSERT INTO run_stream_snapshot (id, "tenantId", "threadId", "runId", epoch, cursor, revision, payload)
                VALUES ($1, $2, $3, $4, $5, $6, 1, $7::jsonb)
                ON CONFLICT ("tenantId", "threadId", "runId") DO UPDATE SET
                  epoch = EXCLUDED.epoch, cursor = EXCLUDED.cursor, payload = EXCLUDED.payload,
                  revision = run_stream_snapshot.revision + 1, "updatedAt" = now()
                WHERE string_to_array(run_stream_snapshot.epoch, '-')::numeric[] <= string_to_array(EXCLUDED.epoch, '-')::numeric[]
                  AND (run_stream_snapshot.epoch <> EXCLUDED.epoch OR run_stream_snapshot.payload ->> 'finished' = 'false')
                  AND (string_to_array(run_stream_snapshot.cursor, '-')::numeric[] < string_to_array(EXCLUDED.cursor, '-')::numeric[]
                    OR (run_stream_snapshot.cursor = EXCLUDED.cursor AND run_stream_snapshot.payload ->> 'finished' = 'false'
                        AND EXCLUDED.payload ->> 'finished' = 'true'))
                RETURNING id`,
                [
                    randomUUID(),
                    scope.tenantId,
                    scope.threadId,
                    scope.runId,
                    scope.epoch,
                    scope.cursor,
                    JSON.stringify(payload)
                ]
            )
            if (!Array.isArray(rows) || !rows.length) return false
            for (const message of payload.messages) {
                // The normal final save owns terminal status and summary extraction.
                await manager.query(
                    `UPDATE chat_message SET content = $1::json, reasoning = $2::json,
                    "references" = $3::json, events = $4::json, "updatedAt" = now()
                    WHERE id = $5 AND "tenantId" = $6 AND "conversationId" = $7
                      AND "executionId" = $8 AND status IN ('thinking', 'reasoning', 'answering', 'running', 'pending')`,
                    [
                        JSON.stringify(message.content),
                        JSON.stringify(message.reasoning ?? null),
                        JSON.stringify(message.references ?? null),
                        JSON.stringify(message.events ?? null),
                        message.id,
                        scope.tenantId,
                        message.conversationId,
                        scope.runId
                    ]
                )
            }
            return true
        })
    }

    async load(tenantId: string, threadId: string, runId: string) {
        const snapshot = await this.dataSource
            .getRepository(RunStreamSnapshot)
            .findOne({ where: { tenantId, threadId, runId } })
        if (!snapshot) return null
        return {
            type: 'run_snapshot' as const,
            threadId,
            runId,
            epoch: snapshot.epoch,
            cursor: snapshot.cursor,
            revision: snapshot.revision,
            ...runStreamSnapshotPayloadSchema.parse(snapshot.payload)
        }
    }
}
