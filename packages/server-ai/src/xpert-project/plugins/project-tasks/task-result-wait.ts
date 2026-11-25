// End only a repeated report poll with a host-confirmed wake in this conversation/thread.
// Independent coordination and business decisions remain with the model.
import { AIMessage, isAIMessage, isToolMessage, type BaseMessage } from '@langchain/core/messages'
import { isDeepStrictEqual } from 'node:util'
import { projectTaskDispatchReceiptSchema } from '@xpert-ai/contracts'
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
            invocationId: z.string().uuid().nullish(),
            invocationStatus: z.string().nullish(),
            result: z.unknown().optional()
        })
    )
})

type DelegationCall = NonNullable<AIMessage['tool_calls']>[number]

function dispatchIntent(call: DelegationCall) {
    const { expectedRevision: _revision, ...intent } = call.args
    return intent
}

export function waitForPendingTaskReport(messages: BaseMessage[], response: AIMessage, projectId: string) {
    if (!response.tool_calls?.length) return response
    const pending = new Map<string, { invocationId: string; dispatch?: DelegationCall }>()
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
                if (!fresh.success || message.status === 'error') pending.clear()
                else if (fresh.data.projectId === projectId) {
                    for (const [key, observation] of pending) {
                        if (!key.startsWith(`${fresh.data.id}/`)) continue
                        const execution = fresh.data.executions.find((entry) => key === `${fresh.data.id}/${entry.id}`)
                        if (
                            !execution ||
                            execution.invocationId !== observation.invocationId ||
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
            (message.name !== ProjectToolEnum.ReadResult && message.name !== ProjectToolEnum.DispatchTask) ||
            message.status === 'error' ||
            typeof message.content !== 'string'
        )
            continue
        // A parallel batch has one AI message followed by several tool results in any order.
        let prior = index - 1
        while (prior >= 0 && isToolMessage(messages[prior])) prior--
        const owner = messages[prior]
        if (!owner || !isAIMessage(owner)) continue
        const call = owner.tool_calls?.find(
            (candidate) => candidate.id && candidate.id === message.tool_call_id && candidate.name === message.name
        )
        if (!call) continue
        try {
            const value: unknown = JSON.parse(message.content)
            if (call.name === ProjectToolEnum.DispatchTask) {
                const receipt = projectTaskDispatchReceiptSchema.safeParse(value)
                if (
                    receipt.success &&
                    receipt.data.projectId === projectId &&
                    ['queued', 'running'].includes(receipt.data.status) &&
                    (receipt.data.projectTaskId === call.args.taskId || call.args.reviewAsSubtask === true)
                ) {
                    pending.set(receipt.data.projectTaskId + '/' + receipt.data.taskExecutionId, {
                        invocationId: receipt.data.invocationId,
                        dispatch: call
                    })
                }
                continue
            }
            if (call.args.source === 'prompt') continue
            const key = call.args.taskId + '/' + call.args.executionId
            const observation = pendingSchema.safeParse(value)
            if (
                observation.success &&
                observation.data.projectId === projectId &&
                observation.data.taskId === call.args.taskId &&
                observation.data.executionId === call.args.executionId
            ) {
                const earlier = pending.get(key)
                pending.set(key, {
                    invocationId: observation.data.invocationId,
                    dispatch: earlier?.invocationId === observation.data.invocationId ? earlier.dispatch : undefined
                })
            } else pending.delete(key)
        } catch {
            // Only a structured, correlated host receipt can establish a pending result.
        }
    }
    const repeatsPending = (call: DelegationCall) => {
        if (call.name === ProjectToolEnum.ReadResult)
            return call.args.source !== 'prompt' && pending.has(call.args.taskId + '/' + call.args.executionId)
        if (call.name !== ProjectToolEnum.DispatchTask) return false
        return [...pending.values()].some(
            ({ dispatch }) => dispatch && isDeepStrictEqual(dispatchIntent(dispatch), dispatchIntent(call))
        )
    }
    if (!response.tool_calls.every(repeatsPending)) return response
    return new AIMessage({
        id: response.id,
        content: t('server-ai:ProjectTask.WaitingForResult', {
            defaultValue: 'The delegated task is still running. Coordination will continue when its result arrives.'
        }),
        response_metadata: response.response_metadata,
        usage_metadata: response.usage_metadata
    })
}
