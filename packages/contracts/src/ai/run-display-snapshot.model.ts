import type { IChatMessage } from './chat-message.model'
import type { TChatAgentRunSummary } from './xpert-agent-execution.model'

/** Display only: no graph state, commands, interrupts or client tool invocations. */
export type TRunDisplayMessage = Pick<
  IChatMessage,
  'id' | 'executionId' | 'conversationId' | 'content' | 'reasoning' | 'events' | 'status' | 'error'
> & { role: 'ai'; agentRuns?: TChatAgentRunSummary[] }

export interface TRunDisplaySnapshot {
  version: 1
  threadId: string
  runId: string
  segmentId: string
  revision: number
  cursor: string
  savedAt: string
  activeMessageId: string
  messages: TRunDisplayMessage[]
}

export interface TRunDisplaySnapshotPayload {
  type: 'stream_snapshot'
  snapshot: TRunDisplaySnapshot
  /** False means the retained tail cannot bridge this snapshot. Do not apply partial deltas. */
  continuous: boolean
}
