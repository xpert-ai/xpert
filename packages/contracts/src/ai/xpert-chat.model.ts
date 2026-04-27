import type { TChatRequestHuman, TInterruptCommand } from '@xpert-ai/chatkit-types'
import { STATE_VARIABLE_HUMAN } from '@xpert-ai/chatkit-types'

export type TXpertFollowUpMode = 'queue' | 'steer'

export type TXpertChatState = {
  [STATE_VARIABLE_HUMAN]?: TChatRequestHuman
} & Record<string, any>

export type TXpertChatResumeDecision = {
  type: 'confirm' | 'reject'
  payload?: unknown
}

export type TXpertChatInterruptPatch = Pick<TInterruptCommand, 'agentKey' | 'toolCalls' | 'update'>

export type TXpertChatTarget = {
  aiMessageId?: string
  executionId?: string
}

export type TXpertChatSource = {
  aiMessageId?: string
  executionId?: string
}

export type TXpertChatSendRequest = {
  action: 'send'
  conversationId?: string
  projectId?: string
  environmentId?: string
  sandboxEnvironmentId?: string
  message: {
    clientMessageId?: string
    input: TChatRequestHuman
    thirdPartyMessage?: Record<string, unknown> | null
  }
  state?: TXpertChatState
}

export type TXpertChatResumeRequest = {
  action: 'resume'
  conversationId: string
  target: TXpertChatTarget
  decision: TXpertChatResumeDecision
  patch?: TXpertChatInterruptPatch
  state?: TXpertChatState
}

export type TXpertChatRetryRequest = {
  action: 'retry'
  conversationId: string
  source: TXpertChatSource
  environmentId?: string
  checkpointId?: string
}

export type TXpertChatFollowUpRequest = {
  action: 'follow_up'
  conversationId: string
  mode: TXpertFollowUpMode
  message: {
    clientMessageId?: string
    input: TChatRequestHuman
  }
  target?: TXpertChatTarget
  state?: TXpertChatState
}

export type TChatRequest =
  | TXpertChatSendRequest
  | TXpertChatResumeRequest
  | TXpertChatRetryRequest
  | TXpertChatFollowUpRequest

export type TXpertAgentChatRunRequest = {
  action: 'run'
  state: TXpertChatState
  agentKey: string
  xpertId: string
  environmentId?: string
}

export type TXpertAgentChatResumeRequest = {
  action: 'resume'
  agentKey: string
  xpertId: string
  target: {
    executionId: string
  }
  decision: TXpertChatResumeDecision
  patch?: TXpertChatInterruptPatch
  environmentId?: string
  state?: TXpertChatState
}

export type TXpertAgentChatFollowUpRequest = {
  action: 'follow_up'
  agentKey: string
  xpertId: string
  mode: TXpertFollowUpMode
  message: {
    clientMessageId?: string
    input: TChatRequestHuman
  }
  target?: {
    executionId?: string
  }
  environmentId?: string
  state?: TXpertChatState
}

export type TXpertAgentChatRequest =
  | TXpertAgentChatRunRequest
  | TXpertAgentChatResumeRequest
  | TXpertAgentChatFollowUpRequest
