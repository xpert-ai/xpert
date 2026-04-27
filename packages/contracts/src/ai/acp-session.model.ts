import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'

export type TRuntimeKind = 'native_agent' | 'acp_session' | 'workflow'
export type THarnessType = 'remote_xpert_acp'
export type TAcpTargetKind = 'remote_xpert_acp'
export type TAcpTransport = 'http'
export type TAcpSessionMode = 'oneshot' | 'persistent'
export type TAcpPermissionProfile = 'read_only' | 'workspace_write' | 'full_exec'
export type TAcpRuntimePhase = 'queued' | 'setup' | 'running' | 'waiting_input' | 'completed' | 'failed' | 'canceled'
export type TAcpSessionStatus =
  | 'pending'
  | 'queued'
  | 'ready'
  | 'running'
  | 'success'
  | 'error'
  | 'timeout'
  | 'canceled'
  | 'closed'

export type TAcpSessionEventType =
  | 'session_created'
  | 'session_loaded'
  | 'session_queued'
  | 'session_ready'
  | 'session_started'
  | 'session_completed'
  | 'session_failed'
  | 'session_canceled'
  | 'session_closed'
  | 'turn_created'
  | 'turn_started'
  | 'turn_completed'
  | 'turn_failed'
  | 'turn_canceled'
  | 'config_error'
  | 'terminal_output'
  | 'text_delta'
  | 'tool_call'
  | 'tool_call_update'
  | 'status_update'
  | 'artifact_created'
  | 'observation_packet'

export type TAcpArtifactKind =
  | 'stdout'
  | 'stderr'
  | 'diff'
  | 'patch'
  | 'file_snapshot'
  | 'tool_summary'
  | 'summary'

export type TAcpTargetCapabilities = {
  supportsModes?: TAcpSessionMode[]
  supportsStreaming?: boolean
  supportsToolCall?: boolean
  supportsArtifacts?: boolean
  controls?: string[]
  configOptions?: string[]
  [key: string]: unknown
}

export type TAcpCodeContext = {
  xpertId?: string | null
  projectId?: string | null
  sourceConversationId?: string | null
  resumeThreadId?: string | null
  repoConnectionId?: string | null
  repoId?: string | null
  repoName?: string | null
  repoOwner?: string | null
  repoSlug?: string | null
  branchName?: string | null
  baseBranchName?: string | null
  workspaceLabel?: string | null
  workspacePath?: string | null
  codingAgentName?: string | null
  providerDisplayName?: string | null
  taskKind?: string | null
  taskIntent?: string | null
}

export type TAcpBusinessPrincipal = {
  tenantId: string
  organizationId: string
  userId: string
}

export interface IAcpTarget extends IBasePerTenantAndOrganizationEntityModel {
  label: string
  kind: TAcpTargetKind
  transport: TAcpTransport
  commandOrEndpoint?: string | null
  authRef?: string | null
  defaultMode: TAcpSessionMode
  permissionProfile: TAcpPermissionProfile
  timeoutSeconds?: number | null
  enabled: boolean
  capabilities?: TAcpTargetCapabilities | null
  metadata?: Record<string, unknown> | null
  description?: string | null
}

export type TAcpSessionMetadata = TAcpCodeContext & {
  businessPrincipal?: TAcpBusinessPrincipal | null
  tenantId?: string | null
  organizationId?: string | null
  userId?: string | null
  ownerUserId?: string | null
  effectiveUserId?: string | null
  sandboxEnvironmentId?: string | null
  sandboxProvider?: string | null
  sandboxWorkForType?: 'environment' | 'project' | 'user'
  sandboxWorkForId?: string | null
  backendId?: string | null
  backendSessionId?: string | null
  clientSessionId?: string | null
  commandPreview?: string | null
  activeRequestId?: string | null
  lastRequestId?: string | null
  lastTurnStatus?: TAcpSessionStatus | null
  lastError?: string | null
  targetRef?: string | null
  targetKind?: TAcpTargetKind | null
  transport?: TAcpTransport | null
  turnIndex?: number | null
  targetPaths?: string[] | null
  queueState?:
    | {
        status: 'queued'
        position: number
        queuedAt?: string | null
        note?: string | null
      }
    | null
  phase?: TAcpRuntimePhase | null
  lastHeadline?: string | null
  lastObservationAt?: string | null
  lastObservationSequence?: number | null
  lastConsumedObservationSequence?: number | null
  lastReportedObservationSequence?: number | null
  lastProjectedSequence?: number | null
  lastProjectedTextSequence?: number | null
  lastProjectedHeadline?: string | null
  lastMilestoneAt?: string | null
  lastUpstreamHandoff?: string | null
}

export type TAcpObservationArtifactRef = {
  kind?: TAcpArtifactKind | null
  title?: string | null
  path?: string | null
}

export type TAcpObservationPacket = {
  sessionId: string
  executionId?: string | null
  conversationId?: string | null
  threadId?: string | null
  sequenceRange?: [number, number]
  phase: TAcpRuntimePhase
  headline: string
  toolName?: string | null
  toolStatus?: string | null
  repoId?: TAcpCodeContext['repoId']
  repoName?: TAcpCodeContext['repoName']
  branchName?: TAcpCodeContext['branchName']
  environmentId?: string | null
  workspacePath?: TAcpCodeContext['workspacePath']
  codingAgentName?: TAcpCodeContext['codingAgentName']
  providerDisplayName?: TAcpCodeContext['providerDisplayName']
  requiresAttention?: boolean
  decisionHint?: string | null
  finalSummary?: string | null
  error?: string | null
  artifactRefs?: TAcpObservationArtifactRef[]
}

export interface IAcpSession extends IBasePerTenantAndOrganizationEntityModel {
  title?: string | null
  runtimeKind: Extract<TRuntimeKind, 'acp_session'>
  harnessType: THarnessType
  targetRef?: string | null
  targetKind?: TAcpTargetKind | null
  transport?: TAcpTransport | null
  mode: TAcpSessionMode
  permissionProfile: TAcpPermissionProfile
  status: TAcpSessionStatus
  prompt?: string | null
  summary?: string | null
  error?: string | null
  timeoutMs?: number | null
  startedAt?: Date | null
  completedAt?: Date | null
  canceledAt?: Date | null
  lastActivityAt?: Date | null
  lastExitCode?: number | null
  environmentId?: string | null
  executionId?: string | null
  activeExecutionId?: string | null
  lastExecutionId?: string | null
  parentExecutionId?: string | null
  xpertId?: string | null
  threadId?: string | null
  conversationId?: string | null
  clientSessionId?: string | null
  backendSessionId?: string | null
  workingDirectory?: string | null
  metadata?: TAcpSessionMetadata | null
}

export interface IAcpSessionEvent extends IBasePerTenantAndOrganizationEntityModel {
  sessionId: string
  executionId?: string | null
  sequence: number
  type: TAcpSessionEventType
  payload?: Record<string, unknown> | null
  redactedPayload?: Record<string, unknown> | null
}

export interface IAcpArtifact extends IBasePerTenantAndOrganizationEntityModel {
  sessionId: string
  executionId?: string | null
  eventId?: string | null
  kind: TAcpArtifactKind
  title?: string | null
  mimeType?: string | null
  content?: string | null
  path?: string | null
  metadata?: Record<string, unknown> | null
}
