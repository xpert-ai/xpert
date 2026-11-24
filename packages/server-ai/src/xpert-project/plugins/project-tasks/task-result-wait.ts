// End only a repeated report poll with a host-confirmed wake in this conversation/thread.
// Independent coordination and business decisions remain with the model.
import { AIMessage, isAIMessage, isToolMessage, type BaseMessage } from '@langchain/core/messages'
import { t } from 'i18next'
import { z } from 'zod/v3'
import { ProjectToolEnum } from './constants'

const pendingSchema = z.object({
    projectId: z.string().uuid(),
    taskId: z.string().uuid(),
    executionId: z.string().uuid(),
    invocationId: z.string().uuid(),
    reportStatus: z.literal('pending'),
    canAwaitDelivery: z.literal(true),
    nextAction: z.literal('await_delivery'),
    invocationStatus: z.enum(['queued', 'running'])
})

const taskObservationSchema = z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    executions: z.array(
        z.object({
            id: z.string().uuid(),
            invocationId: z.string().uuid().optional(),
            invocationStatus: z.string().optional(),
            result: z.unknown().optional()
        })
    )
})

export function waitForPendingTaskReport(messages: BaseMessage[], response: AIMessage, projectId: string) {
    if (!response.tool_calls?.length) return response
    const pending = new Map<string, string>()
    for (let index = 0; index < messages.length; index++) {
        const message = messages[index]
        if (message.getType() === 'human') pending.clear()
        if (!isToolMessage(message)) continue
        if (message.status === 'error') pending.clear()
        if (message.name === ProjectToolEnum.GetTask) {
            // Long-context rehydration reads on every turn. Fresh running state retains the wake;
            // a completed result, changed invocation or unavailable observation invalidates it.
            try {
                const fresh = taskObservationSchema.safeParse(
                    typeof message.content === 'string' ? JSON.parse(message.content) : null
                )
                if (!fresh.success || message.status !== 'success') pending.clear()
                else if (fresh.data.projectId === projectId) {
                    for (const [key, invocationId] of pending) {
                        if (!key.startsWith(`${fresh.data.id}/`)) continue
                        const execution = fresh.data.executions.find((entry) => key === `${fresh.data.id}/${entry.id}`)
                        if (
                            !execution ||
                            execution.invocationId !== invocationId ||
                            execution.result != null ||
                            !['queued', 'running'].includes(execution.invocationStatus ?? '')
                        )
                            pending.delete(key)
                    }
                }
            } catch {
                pending.clear()
            }
        }
        if (
            message.name !== ProjectToolEnum.ReadResult ||
            message.status !== 'success' ||
            typeof message.content !== 'string'
        )
            continue
        const callMessage = messages[index - 1]
        if (!callMessage || !isAIMessage(callMessage) || callMessage.tool_calls?.length !== 1) continue
        const call = callMessage.tool_calls[0]
        if (
            call.name !== ProjectToolEnum.ReadResult ||
            call.id !== message.tool_call_id ||
            call.args.source === 'prompt'
        )
            continue
        try {
            const observation = pendingSchema.safeParse(JSON.parse(message.content))
            if (
                observation.success &&
                observation.data.projectId === projectId &&
                observation.data.taskId === call.args.taskId &&
                observation.data.executionId === call.args.executionId
            )
                pending.set(`${call.args.taskId}/${call.args.executionId}`, observation.data.invocationId)
            else pending.delete(`${call.args.taskId}/${call.args.executionId}`)
        } catch {
            /* Unknown or signed payloads never establish a wake. */
        }
    }
    if (
        !response.tool_calls.every(
            (call) =>
                call.name === ProjectToolEnum.ReadResult &&
                call.args.source !== 'prompt' &&
                pending.has(`${call.args.taskId}/${call.args.executionId}`)
        )
    )
        return response
    return new AIMessage({
        id: response.id,
        content: t('server-ai:ProjectTask.WaitingForResult', {
            defaultValue: 'The delegated task is still running. Coordination will continue when its result arrives.'
        }),
        response_metadata: response.response_metadata,
        usage_metadata: response.usage_metadata
    })
}
