// Older hosts checkpointed a returned native cancellation as "cancelling".
// Confirm the exact interrupt only after the root and its attached work have ended.
import type { DataSource } from 'typeorm'
import { z } from 'zod/v3'
import type { ExecutionTaskControl } from '@xpert-ai/server-core'
import { isBuiltinInlineGraph } from './invocation-control-evidence'
import type { AgentInvocationEntity } from './invocation.entity'

const cancelledInterrupt = z.object({
    value: z.object({
        type: z.literal('agent_invocation'),
        invocationId: z.string(),
        status: z.literal('cancelling')
    })
})
const pageSize = 32

function matchesInterrupt(payload: Buffer, invocationId: string): boolean {
    try {
        const decoded: unknown = JSON.parse(payload.toString('utf8'))
        const interrupts = Array.isArray(decoded) ? decoded : [decoded]
        return interrupts.some((item) => {
            const parsed = cancelledInterrupt.safeParse(item)
            return parsed.success && parsed.data.value.invocationId === invocationId
        })
    } catch {
        return false
    }
}

export async function hasReturnedInlineCancellation(
    database: DataSource,
    record: AgentInvocationEntity,
    task: ExecutionTaskControl
): Promise<boolean> {
    const { invocation } = record
    const evidence = invocation.controlEvidence
    if (
        !isBuiltinInlineGraph(record) ||
        invocation.id !== record.id ||
        invocation.status !== 'cancelling' ||
        invocation.control ||
        evidence?.source !== 'unavailable' ||
        evidence.reason !== 'unsupported' ||
        evidence.subject.kind !== 'invocation' ||
        evidence.subject.id !== record.id ||
        task.resourceId !== record.id ||
        !invocation.scope.parentExecutionId ||
        !task.claim
    )
        return false

    // Checkpoint writes are bytea on PostgreSQL 15. Read bounded batches until an exact
    // match or exhaustion, skipping malformed historical JSON.
    let afterId: string | null = null
    for (;;) {
        const rows: Array<{ id: string; value: Buffer }> = await database.query(
            `
            SELECT w.id, w.value FROM execution_control c
            JOIN execution_task_control child ON child."parentId"=$3 AND child.kind='execution'
                AND child."currentExecutionId"=$2::text AND child."resourceId"=$2::text AND child.state='completed'
                AND child."rootId"=$6 AND child."tenantId"=c."tenantId" AND child."organizationId" IS NOT DISTINCT FROM c."organizationId"
            JOIN copilot_checkpoint_writes w ON w.thread_id=c."threadId" AND w."tenantId"=c."tenantId"
                AND w."organizationId" IS NOT DISTINCT FROM c."organizationId"
            WHERE c."executionId"=$1 AND c."rootExecutionId"=$1 AND c."graphEnded" AND c.desired='terminated'
                AND c."tenantId"=$4 AND c."organizationId" IS NOT DISTINCT FROM $5
                AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(c.work) r WHERE (r->>'settled') IS DISTINCT FROM 'true')
                AND w.checkpoint_ns='' AND w.channel='__interrupt__' AND w.type='json'
                AND w."createdAt">=$7 AND position(convert_to($2::text,'UTF8') in w.value)>0
                AND ($8::uuid IS NULL OR w.id > $8)
            ORDER BY w.id LIMIT $9`,
            [
                invocation.scope.parentExecutionId,
                record.id,
                task.id,
                task.tenantId,
                task.organizationId,
                task.rootId,
                record.updatedAt,
                afterId,
                pageSize
            ]
        )
        if (rows.some((row) => matchesInterrupt(row.value, record.id))) return true
        if (rows.length < pageSize) return false
        afterId = rows[rows.length - 1].id
    }
}
