// Only expand execution roots from messages already authorized by the conversation API.
// Keep tenant/organization and root-thread scope on every level, including branch history.
import {
    isRuntimeAgentExecution,
    STATE_VARIABLE_TITLE_CHANNEL,
    type IChatMessage,
    type TChatAgentRunSummary
} from '@xpert-ai/contracts'
import { readAgentRunSnapshot } from '../chat-message/agent-run-snapshot'
import { toAgentRunSummary } from './agent-run-summary'
import { Injectable } from '@nestjs/common'
import { In, Raw } from 'typeorm'
import { XpertAgentExecutionService } from '../xpert-agent-execution/agent-execution.service'

export { toAgentRunSummary } from './agent-run-summary'

type CopiedHistoryMessage = Pick<IChatMessage, 'historicalAgentRuns'> & { agentRuns?: TChatAgentRunSummary[] }

type HistoryMessage = Pick<IChatMessage, 'id'> &
    Partial<Pick<IChatMessage, 'role' | 'executionId' | 'createdInThreadId'>>

@Injectable()
export class ConversationAgentRunsService {
    constructor(private readonly executions: XpertAgentExecutionService) {}

    async filterCopiedHistory(messages: CopiedHistoryMessage[]) {
        const copies = messages.flatMap((message) =>
            message.agentRuns?.length && Array.isArray(message.historicalAgentRuns)
                ? [{ message, runs: message.historicalAgentRuns }]
                : []
        )
        // Unversioned copies can lack a channel. Only look up IDs already present in the authorized snapshot.
        const unclassified = copies.flatMap(({ runs }) =>
            runs.filter((run) => !run.isRoot && !run.presentation).map((run) => run.id)
        )
        const ids = [...new Set(unclassified)]
        if (!ids.length) return
        const { items } = await this.executions.findAllInOrganizationOrTenant({
            where: [
                { id: In(ids), metadata: Raw((column) => `(${column}->>'presentation') = 'runtime'`) },
                {
                    id: In(ids),
                    channelName: STATE_VARIABLE_TITLE_CHANNEL,
                    metadata: Raw((column) => `(${column}->>'presentation') IS NULL`)
                }
            ],
            select: ['id'],
            withDeleted: true
        })
        const omitted = new Set(items.map((row) => row.id))
        for (const { message, runs } of copies) message.agentRuns = readAgentRunSnapshot(runs, omitted)
    }

    async forMessages(
        messages: HistoryMessage[],
        allowedThreadIds: string[]
    ): Promise<Map<string, TChatAgentRunSummary[]>> {
        const rootIds = [
            ...new Set(
                messages
                    .filter((message) => message.role === 'ai' || message.role === 'assistant')
                    .map((message) => message.executionId)
                    .filter((id): id is string => Boolean(id))
            )
        ]
        const result = new Map<string, TChatAgentRunSummary[]>()
        if (!rootIds.length || !allowedThreadIds.length) return result

        const roots = await this.executions.findAllInOrganizationOrTenant({
            where: { id: In(rootIds), threadId: In(allowedThreadIds) },
            select: ['id', 'threadId', 'status', 'elapsedTime', 'createdAt', 'updatedAt']
        })
        const owner = new Map(roots.items.map((root) => [root.id, root.id]))
        const threadByRoot = new Map(roots.items.map((root) => [root.id, root.threadId]))
        const threads = [...new Set(roots.items.map((root) => root.threadId).filter(Boolean))]
        if (!threads.length) return result
        let frontier = roots.items.map((root) => root.id)
        // Keep root timing even when there are no child runs; it is also copied into branch history.
        const runsByRoot = new Map<string, TChatAgentRunSummary[]>(
            roots.items.map((root) => [root.id, [{ ...toAgentRunSummary(root), isRoot: true }]])
        )
        while (frontier.length) {
            const children = await this.executions.findAllInOrganizationOrTenant({
                where: { parentId: In(frontier), threadId: In(threads) },
                relations: ['xpert'],
                select: {
                    id: true,
                    parentId: true,
                    threadId: true,
                    type: true,
                    category: true,
                    channelName: true,
                    agentKey: true,
                    xpertId: true,
                    title: true,
                    metadata: true,
                    status: true,
                    elapsedTime: true,
                    inputs: true,
                    error: true,
                    createdAt: true,
                    updatedAt: true,
                    // Older executions have no avatar snapshot. Only load this
                    // display field from the already-authorized execution's expert.
                    xpert: { id: true, avatar: true }
                },
                order: { createdAt: 'ASC', id: 'ASC' }
            })
            frontier = []
            for (const child of children.items) {
                const rootId = owner.get(child.parentId)
                if (!rootId || owner.has(child.id) || child.threadId !== threadByRoot.get(rootId)) continue
                owner.set(child.id, rootId)
                frontier.push(child.id)
                if (child.category !== 'agent' && child.category !== 'xpert') continue
                if (child.type === 'middleware') continue
                // Older title executions predate the presentation flag.
                if (isRuntimeAgentExecution(child)) continue
                if (!child.metadata?.presentation && child.channelName === STATE_VARIABLE_TITLE_CHANNEL) continue
                const runs = runsByRoot.get(rootId) ?? []
                runs.push(toAgentRunSummary(child))
                runsByRoot.set(rootId, runs)
            }
        }
        for (const message of messages) {
            if (message.createdInThreadId && message.createdInThreadId !== threadByRoot.get(message.executionId))
                continue
            const runs = runsByRoot.get(message.executionId)
            if ((message.role === 'ai' || message.role === 'assistant') && runs?.length) result.set(message.id, runs)
        }
        return result
    }
}
