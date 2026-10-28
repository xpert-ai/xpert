// Invariants: Send packets reference the dispatch snapshot, never live state channels.
// LangGraph's task-local read/write hooks keep the snapshot and Sends in the same
// checkpoint step; compiled-graph tests cover that integration and its lifecycle.
// Unmarked inputs remain valid for checkpoints created before this format existed.
import { randomUUID } from 'node:crypto'
import type { ToolCall } from '@langchain/core/messages/tool'
import type { RunnableConfig } from '@langchain/core/runnables'
import { t } from 'i18next'
import { z } from 'zod/v3'
import { AGENT_TOOL_SNAPSHOTS, type AgentToolSnapshot } from './agent-tool-snapshots'

const agentToolInputSchema = z.object({
    __xpertToolInput: z.literal('dispatch_snapshot_v1'),
    snapshotId: z.string(),
    toolCall: z.object({
        name: z.string(),
        args: z.record(z.unknown()),
        id: z.string().optional(),
        type: z.literal('tool_call').optional()
    })
})
const snapshotsSchema = z.array(z.object({ id: z.string(), state: z.record(z.unknown()) }))
type AgentToolInput = z.output<typeof agentToolInputSchema>

export function writeAgentToolSnapshot(state: object, config: RunnableConfig): string {
    const write: unknown = config.configurable?.__pregel_send
    if (typeof write !== 'function') {
        throw new Error(t('server-ai:Error.ThreadStateNotFound'))
    }
    const snapshot: AgentToolSnapshot = { id: randomUUID(), state: { ...state } }
    write([[AGENT_TOOL_SNAPSHOTS, snapshot]])
    return snapshot.id
}

export function createAgentToolInput(toolCall: ToolCall, snapshotId: string): AgentToolInput {
    return { __xpertToolInput: 'dispatch_snapshot_v1', snapshotId, toolCall }
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
    const snapshots = snapshotsSchema.parse(read(AGENT_TOOL_SNAPSHOTS, false))
    const snapshot = snapshots.find(({ id }) => id === packet.snapshotId)
    if (!snapshot) {
        throw new Error(t('server-ai:Error.ThreadStateNotFound'))
    }
    return { ...snapshot.state, toolCall: packet.toolCall }
}
