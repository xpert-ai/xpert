import type {
  FollowUpBehavior,
  TChatRequestHuman,
  TXpertChatInterruptPatch,
  TXpertChatResumeDecision,
  TXpertChatResumeRequest,
  TXpertChatState,
  TXpertChatTarget
} from '@xpert-ai/chatkit-types'

export type TXpertFollowUpMode = FollowUpBehavior

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
  }
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
