// Invariants: Send packets must not duplicate graph history. Read the current step's
// already-loaded channels through LangGraph's task-local reader, never via getState().
// This adapter depends on __pregel_read; compiled-graph checkpoint tests cover it.
// Unmarked inputs remain valid for checkpoints created before this format existed.
import type { ToolCall } from '@langchain/core/messages/tool'
import type { RunnableConfig } from '@langchain/core/runnables'
import { t } from 'i18next'
import { z } from 'zod/v3'

const agentToolInputSchema = z.object({
    __xpertToolInput: z.literal('state_channels_v1'),
    stateChannels: z.array(z.string()),
    toolCall: z.object({
        name: z.string(),
        args: z.record(z.unknown()),
        id: z.string().optional(),
        type: z.literal('tool_call').optional()
    })
})

type AgentToolInput = z.output<typeof agentToolInputSchema>

export function createAgentToolInput(toolCall: ToolCall, state: object): AgentToolInput {
    return { __xpertToolInput: 'state_channels_v1', stateChannels: Object.keys(state), toolCall }
}

export function resolveAgentToolInput(input: unknown, config: RunnableConfig): unknown {
    if (!input || typeof input !== 'object' || !('__xpertToolInput' in input)) {
        return input
    }

    const packet = agentToolInputSchema.parse(input)
    const read: unknown = config.configurable?.__pregel_read
    if (typeof read !== 'function') {
        throw new Error(t('server-ai:Error.ThreadStateNotFound'))
    }
    // false keeps sibling writes out of this step's state, including after an interrupt.
    const state: unknown = read(packet.stateChannels, false)
    if (
        !state ||
        typeof state !== 'object' ||
        Array.isArray(state) ||
        packet.stateChannels.some((channel) => !Object.prototype.hasOwnProperty.call(state, channel))
    ) {
        throw new Error(t('server-ai:Error.ThreadStateNotFound'))
    }
    return { ...state, toolCall: packet.toolCall }
}
