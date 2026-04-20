import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'

export type TRuntimeKind = 'native_agent' | 'acp_session' | 'workflow'
export type THarnessType = 'codex' | 'claude_code'
export type TAcpSessionMode = 'oneshot'
export type TAcpPermissionProfile = 'read_only' | 'workspace_write' | 'full_exec'
export type TAcpSessionStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'success'
  | 'error'
  | 'timeout'
  | 'canceled'

export type TAcpSessionEventType =
  | 'session_created'
  | 'session_queued'
  | 'session_started'
  | 'session_completed'
  | 'session_failed'
  | 'session_canceled'
  | 'config_error'
  | 'terminal_output'
  | 'artifact_created'

export type TAcpArtifactKind =
  | 'stdout'
  | 'stderr'
  | 'diff'
  | 'patch'
  | 'file_snapshot'
  | 'summary'

export type TAcpSessionMetadata = {
  sandboxEnvironmentId?: string | null
  sandboxProvider?: string | null
  sandboxWorkForType?: 'environment' | 'project' | 'user'
  sandboxWorkForId?: string | null
  backendId?: string | null
  commandPreview?: string | null
  targetPaths?: string[] | null
}

export interface IAcpSession extends IBasePerTenantAndOrganizationEntityModel {
  title?: string | null
  runtimeKind: Extract<TRuntimeKind, 'acp_session'>
  harnessType: THarnessType
  mode: TAcpSessionMode
  permissionProfile: TAcpPermissionProfile
  status: TAcpSessionStatus
  prompt: string
  summary?: string | null
  error?: string | null
  timeoutMs?: number | null
  startedAt?: Date | null
  completedAt?: Date | null
  canceledAt?: Date | null
  lastExitCode?: number | null
  environmentId?: string | null
  executionId?: string | null
  parentExecutionId?: string | null
  xpertId?: string | null
  threadId?: string | null
  conversationId?: string | null
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
