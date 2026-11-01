// Invariants: Send task paths index the same checkpoint's __pregel_tasks channel.
// Resolve the persisted tool-call ID before looking through agent message history.
// Legacy tasks without identity may resolve only one unanswered call, never guess.
import { isAIMessage, isBaseMessage, isToolMessage, type BaseMessage } from '@langchain/core/messages'
import type { ToolCall } from '@langchain/core/messages/tool'
import type { Checkpoint } from '@langchain/langgraph-checkpoint'
import type { PregelTaskDescription } from '@langchain/langgraph/dist/pregel/types'
import { t } from 'i18next'
import { z } from 'zod/v3'

const channelSchema = z.object({ messages: z.array(z.custom<BaseMessage>(isBaseMessage)) })
const sendSchema = z.object({ node: z.string(), args: z.unknown() })
// LangGraph 0.4.x Topic checkpoints store [seen, pending Send packets].
const tasksChannelSchema = z.tuple([z.array(z.unknown()), z.array(sendSchema)])
const toolInputSchema = z.object({ toolCall: z.object({ id: z.string().min(1), name: z.string() }) })

type ToolCallOrigin = { channelName: string; message: BaseMessage; toolCall: ToolCall }

function unresolved(task: PregelTaskDescription): Error {
    return new Error(
        t('server-ai:Error.ToolApprovalCallUnresolved', {
            defaultValue: 'Cannot uniquely resolve the original tool call for task {{taskId}} ({{toolName}}).',
            taskId: task.id,
            toolName: task.name
        })
    )
}

export function findToolCallOrigin(
    values: object,
    task: PregelTaskDescription,
    checkpoint?: Pick<Checkpoint, 'channel_values'>
): ToolCallOrigin | undefined {
    let toolCallId: string | undefined
    if (checkpoint && task.path?.[0] === '__pregel_push' && task.path.length === 2) {
        const index = task.path[1]
        const channel = tasksChannelSchema.safeParse(checkpoint.channel_values.__pregel_tasks)
        if (!Number.isInteger(index) || typeof index !== 'number' || index < 0 || !channel.success) {
            throw unresolved(task)
        }
        const packet = channel.data[1][index]
        if (!packet || packet.node !== task.name) throw unresolved(task)
        const input = toolInputSchema.safeParse(packet.args)
        if (input.success) {
            if (input.data.toolCall.name !== task.name) throw unresolved(task)
            toolCallId = input.data.toolCall.id
        } else if (packet.args && typeof packet.args === 'object' && 'toolCall' in packet.args) {
            throw unresolved(task)
        }
    }

    const candidates: ToolCallOrigin[] = []
    for (const [channelName, value] of Object.entries(values)) {
        if (!channelName.startsWith('agent_')) continue
        const channel = channelSchema.safeParse(value)
        if (!channel.success) continue
        const answered = new Set<string>()
        for (let index = channel.data.messages.length - 1; index >= 0; index--) {
            const message = channel.data.messages[index]
            if (isToolMessage(message)) answered.add(message.tool_call_id)
            if (!isAIMessage(message)) continue
            const matching = (message.tool_calls ?? []).filter((call) =>
                toolCallId
                    ? call.id === toolCallId && call.name === task.name
                    : call.name === task.name && (!call.id || !answered.has(call.id))
            )
            candidates.push(...matching.map((toolCall) => ({ channelName, message, toolCall })))
            // An identity can locate an older AI message. Without one, only the
            // latest assistant turn in each channel is a valid legacy candidate.
            if (!toolCallId || matching.length) break
        }
    }
    if (candidates.length > 1 || (toolCallId && !candidates.length)) throw unresolved(task)
    return candidates[0]
}
