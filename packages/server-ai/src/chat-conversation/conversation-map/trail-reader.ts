import { In, IsNull, type DataSource, type FindOptionsSelect } from 'typeorm'
import type { IChatMessage } from '@xpert-ai/contracts'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { toAgentRunSummary } from '../../ai/agent-run-summary'
import type { TrailRun } from './trail-execution'

/** The root must belong to the reply's original authorized thread, including inherited history. */
export async function readTrailRuns(
    db: DataSource,
    scope: { tenantId: string; organizationId?: string | null },
    message: IChatMessage,
    threadId: string
): Promise<{ runs: TrailRun[]; truncated: boolean }> {
    if (message.historical) return { runs: message.historicalAgentRuns ?? [], truncated: false }
    if (!message.executionId) return { runs: [], truncated: false }
    const repository = db.getRepository(XpertAgentExecution)
    const where = {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? IsNull(),
        threadId: message.createdInThreadId ?? threadId
    }
    const select: FindOptionsSelect<XpertAgentExecution> = {
        id: true,
        parentId: true,
        threadId: true,
        category: true,
        type: true,
        agentKey: true,
        title: true,
        metadata: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
        elapsedTime: true
    }
    const root = await repository.findOne({ where: { ...where, id: message.executionId }, select })
    if (!root) return { runs: [], truncated: false }
    const rows = [root]
    const seen = new Set([root.id])
    let frontier = [root.id]
    let truncated = false
    while (frontier.length) {
        const children = await repository.find({
            where: { ...where, parentId: In(frontier) },
            select,
            order: { createdAt: 'ASC', id: 'ASC' },
            take: 501 - rows.length
        })
        frontier = []
        for (const child of children) {
            if (seen.has(child.id)) continue
            if (rows.length >= 500) {
                truncated = true
                break
            }
            seen.add(child.id)
            rows.push(child)
            frontier.push(child.id)
        }
        if (truncated) break
    }
    return {
        truncated,
        runs: rows.map((row) => ({
            ...toAgentRunSummary(row),
            isRoot: row.id === root.id,
            completedAt: row.completedAt?.toISOString(),
            elapsedMs:
                row.completedAt && row.createdAt
                    ? Math.max(0, row.completedAt.getTime() - row.createdAt.getTime())
                    : undefined
        }))
    }
}
