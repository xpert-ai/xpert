import type { TChatCheckpointReference } from './chat.model'

/** Server-owned boundaries. An input retry may repeat completed actions; latest is not an automatic resume grant. */
export type TChatExecutionRecovery = {
  version: 1
  graphRevision: string
  input?: TChatCheckpointReference
  latest: TChatCheckpointReference
}

export type TChatRecoveryErrorCode =
  | 'conversation_graph_changed'
  | 'conversation_recovery_unavailable'
  | 'conversation_branch_selection_changed'

export type TChatRecoveryError = {
  code: TChatRecoveryErrorCode
  message: string
}

export type TMessageEditAdmission = {
  version: 1
  state: 'pending' | 'admitted'
  workingThreadId: string
  workingThreadRevision: number
}

/** Internal diagnostic result. ChatKit receives only TChatThreadCapabilities. */
export type TChatThreadRecovery = {
  threadId: string
  executionId?: string
  canRetry: boolean
  reason?: TChatRecoveryErrorCode
  originalError?: string
  sourceThreadId?: string
}

/** Chat clients consume availability only; diagnostic details stay server-side. */
export type TChatThreadCapabilities = {
  canRetry: boolean
}
