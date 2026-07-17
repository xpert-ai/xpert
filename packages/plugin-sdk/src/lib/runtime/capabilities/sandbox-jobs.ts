import type { JSONValue } from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../../core/runtime-capability'
import type { WorkspaceFileScope, WorkspacePortableFileReference } from './workspace-files'

/** Stable machine-readable failures emitted by the Sandbox Jobs capability. */
export const SANDBOX_JOB_ERROR_CODES = [
  'SANDBOX_ACTION_UNAVAILABLE',
  'SANDBOX_ACTION_INVALID',
  'SANDBOX_PROFILE_UNAVAILABLE',
  'SANDBOX_RUNTIME_UNAVAILABLE',
  'SANDBOX_VERSION_MISMATCH',
  'SANDBOX_CAPACITY_UNAVAILABLE',
  'SANDBOX_START_FAILED',
  'BROWSER_LAUNCH_FAILED',
  'EXPORT_TIMEOUT',
  'EXPORT_OOM',
  'EXPORT_INPUT_INVALID',
  'EXPORT_OUTPUT_INVALID',
  'SANDBOX_CANCELLED'
] as const

export type SandboxJobErrorCode = (typeof SANDBOX_JOB_ERROR_CODES)[number]
/** Persisted lifecycle states for a generic isolated background execution. */
export type SandboxJobStatus = 'waiting' | 'starting' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'lost'

/** Portable Workspace Files input materialized under `/workspace/input`. */
export type SandboxJobFileInput = {
  /** Tenant-scoped portable reference; raw bytes never enter queue state. */
  reference: WorkspacePortableFileReference
  /** Safe relative path below `/workspace/input`. */
  targetPath: string
  /** Expected immutable byte length checked during materialization. */
  size: number
  /** Expected immutable lowercase SHA-256; materialized inputs are re-hashed before execution. */
  sha256: string
  /**
   * Input access semantics required by the Action.
   *
   * `materialized` preserves the v1 behavior: Core verifies and copies the
   * complete file into the Job workspace before execution. `read-only-seekable`
   * asks Core to expose the exact Workspace file through a Provider-owned,
   * Job-scoped read-only mapping so media decoders can perform on-demand reads.
   */
  access?: 'materialized' | 'read-only-seekable'
}

/** Declares one output to validate and persist back into Workspace Files. */
export type SandboxJobOutputRequest = {
  path: string
  originalName: string
  mimeType: string
  destination: WorkspaceFileScope & { folder: string }
}

/** Tenant and business ownership recorded for authorization, audit, and cleanup. */
export type SandboxJobScope = {
  tenantId: string
  organizationId?: string | null
  userId?: string | null
  pluginName: string
  businessResourceType: string
  businessResourceId: string
}

/** Action-oriented request accepted from a plugin background handler. */
export type SandboxJobRunInput = {
  /** Optional caller-known UUID used when cancellation must be possible while run() is awaiting completion. */
  jobId?: string
  action: string
  actionVersion: string
  /** Stable tenant-scoped key combining business identity and immutable input checksum. */
  idempotencyKey: string
  scope: SandboxJobScope
  /** Small structured request; file bytes must be supplied through `files`. */
  payload: JSONValue
  files?: SandboxJobFileInput[]
  outputs: SandboxJobOutputRequest[]
  /** Soft execution limit capped by the Runtime Definition's hard deadline. */
  timeoutMs?: number
}

/** Validated output evidence returned as a portable Workspace Files reference. */
export type SandboxJobOutput = {
  path: string
  originalName: string
  mimeType: string
  size: number
  sha256: string
  reference: WorkspacePortableFileReference
  fileUrl?: string
  workspacePath?: string
}

/** Provider-neutral persisted view of a Sandbox Job and its runtime evidence. */
export type SandboxJobSnapshot = {
  id: string
  runtimeProfile: string
  sandboxRuntimeVersion: string
  action: string
  actionVersion: string
  status: SandboxJobStatus
  /** Attempt number; a new failed-job attempt may select a newly healthy Binding. */
  attempt: number
  /** Provider and Binding are persisted so cleanup never depends on current selection. */
  provider?: string | null
  runtimeBindingId?: string | null
  /** Opaque Provider identity used for reattachment and idempotent destruction. */
  runtimeRef?: string | null
  artifactDigest?: string | null
  /** @deprecated Use runtimeRef. Kept for one compatibility cycle. */
  containerRef?: string | null
  outputs: SandboxJobOutput[]
  errorCode?: SandboxJobErrorCode | null
  errorMessage?: string | null
  createdAt?: Date | string | null
  startedAt?: Date | string | null
  finishedAt?: Date | string | null
}

/** Successful `run()` result; failed executions reject with SandboxJobRuntimeError. */
export type SandboxJobRunResult = SandboxJobSnapshot & {
  status: 'succeeded'
}

/** Aggregated readiness of an Action, Runtime Definition, Worker, Binding, and Provider. */
export type SandboxJobActionHealth = {
  pluginName: string
  action: string
  actionVersion: string
  runtimeProfile?: string
  sandboxRuntimeVersion?: string
  provider?: string
  runtimeBindingId?: string
  artifactDigest?: string
  available: boolean
  reason?:
    | 'ACTION_MISSING'
    | 'ACTION_INVALID'
    | 'PROFILE_MISSING'
    | 'VERSION_MISMATCH'
    | 'RUNTIME_UNBOUND'
    | 'PROVIDER_UNAVAILABLE'
    | 'PROFILE_UNHEALTHY'
  message?: string
  manifest?: Record<string, string>
}

/**
 * Plugin-facing API for registered, structured Sandbox Actions.
 *
 * Callers choose only an Action and its version; images, commands, entrypoints,
 * environment variables, and Provider options are resolved and enforced by Core.
 */
export interface SandboxJobsApi {
  /** Starts, reattaches, or reuses a successful execution by tenant-scoped idempotency key. */
  run(input: SandboxJobRunInput): Promise<SandboxJobRunResult>
  /** Cancels the logical Job and terminates its active Runtime when one exists. */
  cancel(input: { jobId: string }): Promise<SandboxJobSnapshot>
  /** Returns the active tenant's persisted Job snapshot, or null when inaccessible or absent. */
  getJob(input: { jobId: string }): Promise<SandboxJobSnapshot | null>
  /** Checks readiness before a product exposes or enqueues a browser-backed operation. */
  getActionHealth(input: { pluginName: string; action: string; actionVersion: string }): Promise<SandboxJobActionHealth>
}

/** Error carrying retry policy and Job identity across plugin queue handlers. */
export class SandboxJobRuntimeError extends Error {
  constructor(
    readonly code: SandboxJobErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly jobId?: string
  ) {
    super(message)
    this.name = 'SandboxJobRuntimeError'
  }
}

/** Narrows an unknown failure to the structured Sandbox Jobs runtime error contract. */
export function isSandboxJobRuntimeError(error: unknown): error is SandboxJobRuntimeError {
  return error instanceof SandboxJobRuntimeError
}

/** Runtime capability key used to resolve SandboxJobsApi from the platform registry. */
export const SandboxJobsRuntimeCapability = createRuntimeCapability<SandboxJobsApi>('platform.sandbox.jobs', {
  description: 'Run registered plugin actions in isolated, short-lived Sandbox Runtime jobs.'
})
