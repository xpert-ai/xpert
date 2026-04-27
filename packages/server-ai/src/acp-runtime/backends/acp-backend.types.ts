import {
  IAcpSession,
  IAcpTarget,
  TAcpArtifactKind,
  TAcpPermissionProfile,
  TAcpRuntimePhase,
  TAcpSessionMode,
  TAcpTargetKind,
  THarnessType
} from '@xpert-ai/contracts'

export type AcpRuntimePromptMode = 'prompt' | 'steer'
type AcpRuntimeEventMilestone = {
  phase?: TAcpRuntimePhase
  headline?: string
  isMilestone?: boolean
  requiresAttention?: boolean
  final?: boolean
}

export type AcpRuntimeHandle = {
  kind: TAcpTargetKind
  harnessType: THarnessType
  targetRef?: string | null
  backendSessionId?: string | null
  cwd?: string | null
  metadata?: Record<string, unknown> | null
}

export type AcpRuntimeEnsureInput = {
  session: Pick<
    IAcpSession,
    | 'id'
    | 'tenantId'
    | 'organizationId'
    | 'mode'
    | 'permissionProfile'
    | 'environmentId'
    | 'workingDirectory'
    | 'xpertId'
    | 'conversationId'
    | 'threadId'
    | 'clientSessionId'
    | 'backendSessionId'
    | 'metadata'
  >
  target: Pick<
    IAcpTarget,
    | 'id'
    | 'kind'
    | 'transport'
    | 'commandOrEndpoint'
    | 'authRef'
    | 'permissionProfile'
    | 'defaultMode'
    | 'timeoutSeconds'
    | 'capabilities'
    | 'metadata'
  >
}

export type AcpRuntimeTurnInput = {
  session: Pick<
    IAcpSession,
    | 'id'
    | 'tenantId'
    | 'organizationId'
    | 'xpertId'
    | 'conversationId'
    | 'threadId'
    | 'workingDirectory'
    | 'permissionProfile'
    | 'environmentId'
    | 'timeoutMs'
    | 'metadata'
  >
  target: Pick<
    IAcpTarget,
    | 'id'
    | 'kind'
    | 'transport'
    | 'commandOrEndpoint'
    | 'authRef'
    | 'permissionProfile'
    | 'defaultMode'
    | 'timeoutSeconds'
    | 'metadata'
  >
  handle: AcpRuntimeHandle
  executionId: string
  requestId: string
  turnIndex: number
  prompt: string
  promptMode?: AcpRuntimePromptMode
  permissionProfile: TAcpPermissionProfile
  timeoutMs: number
  signal?: AbortSignal
}

export type AcpRuntimeEvent = AcpRuntimeEventMilestone &
  (
  | {
      type: 'text_delta'
      text: string
      stream?: 'output' | 'thought'
      tag?: string
    }
  | {
      type: 'status'
      text: string
      tag?: string
      details?: Record<string, unknown>
    }
  | {
      type: 'tool_call'
      text: string
      toolCallId?: string
      title?: string
      status?: string
      rawInput?: Record<string, unknown> | null
      rawOutput?: unknown
      tag?: string
    }
  | {
      type: 'tool_call_update'
      text: string
      toolCallId?: string
      title?: string
      status?: string
      rawInput?: Record<string, unknown> | null
      rawOutput?: unknown
      tag?: string
    }
  | {
      type: 'artifact'
      kind: TAcpArtifactKind
      title?: string
      mimeType?: string
      content?: string | null
      path?: string | null
      metadata?: Record<string, unknown>
    }
  | {
      type: 'done'
      stopReason?: string
      summary?: string | null
      output?: string | null
      details?: Record<string, unknown>
    }
  | {
      type: 'error'
      message: string
      code?: string
      retryable?: boolean
      details?: Record<string, unknown>
    })

export interface IAcpBackend {
  readonly kind: TAcpTargetKind
  readonly harnessType: THarnessType

  ensureSession(input: AcpRuntimeEnsureInput): Promise<AcpRuntimeHandle>

  runTurn(input: AcpRuntimeTurnInput): AsyncIterable<AcpRuntimeEvent>

  cancel(input: { handle: AcpRuntimeHandle; reason?: string; signal?: AbortSignal }): Promise<void>

  close(input: { handle: AcpRuntimeHandle; reason?: string }): Promise<void>
}

export type ResolvedAcpTarget = Pick<
  IAcpTarget,
  | 'id'
  | 'label'
  | 'kind'
  | 'transport'
  | 'commandOrEndpoint'
  | 'authRef'
  | 'defaultMode'
  | 'permissionProfile'
  | 'timeoutSeconds'
  | 'enabled'
  | 'capabilities'
  | 'metadata'
  | 'description'
> & {
  builtin?: boolean
}

export function resolveTargetHarnessType(kind: TAcpTargetKind): THarnessType {
  return 'remote_xpert_acp'
}

export function normalizeTargetTimeoutMs(target: Pick<ResolvedAcpTarget, 'timeoutSeconds'>, fallbackMs: number): number {
  if (typeof target.timeoutSeconds === 'number' && Number.isFinite(target.timeoutSeconds) && target.timeoutSeconds > 0) {
    return Math.trunc(target.timeoutSeconds * 1000)
  }

  return fallbackMs
}

export function resolveTargetPermissionProfile(
  target: Pick<ResolvedAcpTarget, 'permissionProfile'>,
  requested?: TAcpPermissionProfile | null
): TAcpPermissionProfile {
  return requested ?? target.permissionProfile ?? 'workspace_write'
}

export function resolveTargetMode(target: Pick<ResolvedAcpTarget, 'defaultMode'>, requested?: TAcpSessionMode | null): TAcpSessionMode {
  return requested ?? target.defaultMode ?? 'oneshot'
}
