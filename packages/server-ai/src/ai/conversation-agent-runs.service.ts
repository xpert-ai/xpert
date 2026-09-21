// Only expand execution roots from messages already authorized by the conversation API.
// Keep tenant/organization and root-thread scope on every level, including branch history.
import type { IChatMessage, TChatAgentRunSummary } from '@xpert-ai/contracts'
import { avatarForChat } from '../shared/avatar'
import { Injectable } from '@nestjs/common'
import { In } from 'typeorm'
import { XpertAgentExecutionService } from '../xpert-agent-execution/agent-execution.service'
import type { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'

type HistoryMessage = Pick<IChatMessage, 'id'> &
    Partial<Pick<IChatMessage, 'role' | 'executionId' | 'createdInThreadId'>>

@Injectable()
export class ConversationAgentRunsService {
    constructor(private readonly executions: XpertAgentExecutionService) {}

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
            select: ['id', 'threadId']
        })
        const owner = new Map(roots.items.map((root) => [root.id, root.id]))
        const threadByRoot = new Map(roots.items.map((root) => [root.id, root.threadId]))
        const threads = [...new Set(roots.items.map((root) => root.threadId).filter(Boolean))]
        if (!threads.length) return result
        let frontier = roots.items.map((root) => root.id)
        const runsByRoot = new Map<string, TChatAgentRunSummary[]>()
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

export function toAgentRunSummary(
    execution: Partial<XpertAgentExecution> & Pick<XpertAgentExecution, 'id'>
): TChatAgentRunSummary {
    const metadata = execution.metadata
    return {
        id: execution.id,
        parentId: execution.parentId,
        type: execution.type,
        category: execution.category,
        agentKey: execution.agentKey,
        xpertId: execution.xpertId,
        xpertName: metadata?.assistantName,
        avatar: avatarForChat(metadata?.assistantAvatar ?? execution.xpert?.avatar),
        title: execution.title,
        invocationKind: metadata?.invocationKind,
        model: metadata?.model,
        status: execution.status,
        elapsedTime: execution.elapsedTime,
        inputs: execution.inputs,
        error: execution.error,
        createdAt: execution.createdAt?.toISOString(),
        updatedAt: execution.updatedAt?.toISOString()
    }
}
