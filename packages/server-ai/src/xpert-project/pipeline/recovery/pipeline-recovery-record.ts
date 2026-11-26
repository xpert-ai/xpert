import { z } from 'zod/v3'
import { projectPipelineCompletionReceiptSchema, projectPipelineOperationReceiptSchema } from '@xpert-ai/contracts'
import type { EntityManager } from 'typeorm'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import { ProjectPipelineEventEntity, ProjectPipelineOperationEntity } from '../persistence/pipeline.entity'
import { pipelineDigest, pipelineIdentity } from '../persistence/pipeline-identity'

export const recoveryKeys = ['reconcile-result', 'retry-once'] as const
export const recoveryRecordSchema = z
    .object({
        mode: z.enum(recoveryKeys),
        actorId: z.string().uuid(),
        bindingDigest: z.string().regex(/^[a-f0-9]{64}$/),
        attempt: z.number().int().positive(),
        previousReceipt: projectPipelineOperationReceiptSchema,
        previousCompletion: projectPipelineCompletionReceiptSchema.nullable(),
        requestedAt: z.string().datetime()
    })
    .strict()
export type PipelineRecoveryRecord = z.output<typeof recoveryRecordSchema>
export const recoveryVersion = (row: ProjectPipelineOperationEntity) =>
    pipelineDigest({
        id: row.id,
        attempt: row.attempt,
        snapshotDigest: row.snapshotDigest,
        context: {
            ...row.context,
            actor: { ...row.context.actor },
            work: { ...row.context.work },
            resources: undefined
        }
    })
export const recoveryEventId = (c: ProjectPipelineContext, operationId: string, mode: string) =>
    pipelineIdentity(c, 'manual-pipeline-recovery', operationId, mode)

/** A manual retry grants only the successor of its exact failed operation. Never a reusable quota. */
export async function hasManualRetry(
    manager: EntityManager,
    c: ProjectPipelineContext,
    nodeId: string,
    attempts: number
) {
    const row = await manager.findOne(ProjectPipelineOperationEntity, {
        where: { ...projectionScope(c), nodeInstanceId: nodeId, attempt: attempts }
    })
    if (!row || row.state !== 'failed' || row.receipt?.status !== 'failed' || !row.terminalObservedAt) return false
    const event = await manager.findOneBy(ProjectPipelineEventEntity, {
        ...projectionScope(c),
        id: recoveryEventId(c, row.id, 'retry-once')
    })
    if (!event) return false
    const value = recoveryRecordSchema.parse(event.payload.recovery)
    return (
        event.instanceId === row.instanceId &&
        event.payload.roundId === row.roundId &&
        event.payload.operationId === row.id &&
        value.mode === 'retry-once' &&
        value.attempt === attempts + 1 &&
        value.bindingDigest === recoveryVersion(row)
    )
}
