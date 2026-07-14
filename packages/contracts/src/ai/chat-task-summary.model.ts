import type {
  ChatTaskSummaryOutput,
  ChatTaskSummaryPlan,
  ChatTaskSummarySource,
  ChatTaskSummaryTodos
} from '@xpert-ai/chatkit-types'
import type { IThreadGoal } from './thread-goal.model'
import type { XpertAgentExecutionStatusEnum } from './xpert-agent-execution.model'

export type TChatTaskSummaryAgent = {
  id: string
  parentId?: string
  level: number
  agentKey?: string
  title: string
  status?: XpertAgentExecutionStatusEnum
  elapsedTime?: number
  error?: string
  messageId?: string
  updatedAt?: string
}

export type TChatTaskSummaryPending = {
  id: string
  kind: 'approval' | 'user_input' | 'follow_up'
  title: string
  description?: string
  messageId?: string
  createdAt?: string
}

export type TChatTaskSummarySection = 'outputs' | 'sources' | 'agents' | 'pending'

export type TChatTaskSummarySectionItem =
  | ChatTaskSummaryOutput
  | ChatTaskSummarySource
  | TChatTaskSummaryAgent
  | TChatTaskSummaryPending

export type TChatTaskSummaryList<T> = {
  items: T[]
  total: number
}

export type TChatTaskSummarySnapshot = {
  version: 1
  conversationId: string
  threadId: string
  task: {
    goal?: IThreadGoal | null
    plan?: ChatTaskSummaryPlan
    todos?: ChatTaskSummaryTodos
  }
  outputs: TChatTaskSummaryList<ChatTaskSummaryOutput>
  sources: TChatTaskSummaryList<ChatTaskSummarySource>
  agents: TChatTaskSummaryList<TChatTaskSummaryAgent>
  pending: TChatTaskSummaryList<TChatTaskSummaryPending>
  updatedAt: string
}

export type TChatTaskSummarySectionPage = {
  section: TChatTaskSummarySection
  items: TChatTaskSummarySectionItem[]
  total: number
  offset: number
  limit: number
}
