// Invariants: only an exact execution/run receipt authorizes tool finalization.
// A settled tool proves exit, not business success; historical missing times remain unknown.
// Callers retain the thread fence and child-completion checks in the same transaction.
import type { TMessageContentComponent, TMessageComponentStep, TExecutionWorkReceipt } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { EntityManager, In, IsNull } from 'typeorm'
import { z } from 'zod'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { ExecutionControl } from '../execution-control/execution-control.entity'
import { validateExecutionControl } from '../execution-control/execution-control.store'
import type { ChatConversationThread } from './conversation-thread.entity'

const toolComponent = z
    .object({
        id: z.string(),
        type: z.literal('component'),
        executionId: z.string(),
        runId: z.string(),
        data: z
            .object({
                category: z.literal('Tool'),
                status: z.enum(['running', 'success', 'fail']),
                error: z.string().optional(),
                end_date: z.union([z.string(), z.date()]).nullish()
            })
            .passthrough()
    })
    .passthrough()

type ToolComponent = TMessageContentComponent<Pick<Partial<TMessageComponentStep>, 'status' | 'error' | 'end_date'>> & {
    executionId: string
    runId: string
}
function isToolComponent(value: unknown): value is ToolComponent {
    return toolComponent.safeParse(value).success
}

export function interruptedToolContent(
    content: ChatMessage['content'],
    receipts: TExecutionWorkReceipt[]
): ChatMessage['content'] {
    if (!Array.isArray(content)) return content
    const settled = new Map(
        receipts.filter((work) => work.settled).map((work) => [JSON.stringify([work.executionId, work.id]), work])
    )
    let changed = false
    const next = content.map((item) => {
        if (!isToolComponent(item)) return item
        const receipt = settled.get(JSON.stringify([item.executionId, item.runId]))
        if (!receipt) return item
        const terminal = item.data.status !== 'running'
        const end = item.data.end_date
        const hasEnd = (typeof end === 'string' || end instanceof Date) && Number.isFinite(new Date(end).getTime())
        if (terminal && (hasEnd || !receipt.settledAt)) return item
        changed = true
        return {
            ...item,
            data: {
                ...item.data,
                ...(!terminal
                    ? {
                          status: 'fail' as const,
                          error:
                              item.data.error ??
                              t('server-ai:Error.ToolFinalResultMissing', {
                                  defaultValue:
                                      'Tool execution ended without a final result. Completed output was preserved.'
                              })
                      }
                    : {}),
                ...(!hasEnd && receipt.settledAt ? { end_date: receipt.settledAt } : {})
            }
        }
    })
    return changed ? next : content
}

/** Called only after fenced orphan/termination checks, in the same thread transaction. */
export async function finalizeInterruptedToolMessages(
    manager: EntityManager,
    thread: ChatConversationThread,
    executionId: string
) {
    const scope = { tenantId: thread.tenantId, organizationId: thread.organizationId ?? IsNull() }
    const root = await manager.findOneBy(ExecutionControl, {
        ...scope,
        threadId: thread.threadId,
        executionId,
        rootExecutionId: executionId
    })
    if (!root) return
    validateExecutionControl(root)
    const messages = await manager.find(ChatMessage, {
        where: { ...scope, executionId: In([...new Set([executionId, ...root.work.map((work) => work.executionId)])]) },
        lock: { mode: 'pessimistic_write' }
    })
    for (const message of messages) {
        const content = interruptedToolContent(message.content, root.work)
        if (content !== message.content)
            await manager.update(
                ChatMessage,
                {
                    ...scope,
                    id: message.id,
                    executionId: message.executionId
                },
                { content }
            )
    }
}
