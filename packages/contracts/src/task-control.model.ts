import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'

/** Host-issued identity; never derive lifecycle ownership from wait/background mode. */
export type TaskControlRef = { version: 2; targetId: string }
export type TaskControlPolicy = 'attached' | 'detached' | 'shared'
export type TaskControlIntent = 'running' | 'paused' | 'terminated'
export type TaskControlKind =
  | 'execution'
  | 'invocation'
  | 'handoff'
  | 'managed-queue'
  | 'desktop-shell'
  | 'sandbox-job'
  | 'sandbox-callback'
  | 'mcp-publication'
  | 'mcp-operation'
export type TaskControlState = 'queued' | 'running' | 'paused' | 'completed' | 'unknown'

/** Durable task identity and control facts, independent of a particular graph attempt. */
export interface IExecutionTaskControl extends IBasePerTenantAndOrganizationEntityModel {
  id: string
  tenantId: string
  rootId: string
  parentId: string | null
  kind: TaskControlKind
  resourceId: string
  policy: TaskControlPolicy
  ancestors: string[]
  threadId: string | null
  currentExecutionId: string | null
  attempts: string[]
  desired: TaskControlIntent
  revision: number
  state: TaskControlState
  claim: string | null
  drainOnPause: boolean
  nextCheckAt: Date
  deliveryToken: string | null
  deliveryUntil: Date | null
  observation: string | null
  outcome: 'succeeded' | 'failed' | null
}

/** Durable outbox entry; scope is copied only from its registered task. */
export interface ITaskControlPublication extends IBasePerTenantAndOrganizationEntityModel {
  tenantId: string
  targetId: string
  transport: TaskControlTransport
  payload: unknown
  result: unknown | null
  diagnostic?: TaskPublicationDiagnostic | null
  nextAttemptAt: Date
  publishedAt: Date | null
}

export type TaskControlTransport = 'handoff' | 'managed-queue' | 'managed-queue-v3'

/** Safe publication evidence; never contains handler errors, payloads or credentials. */
export interface TaskPublicationDiagnostic {
  code:
    | 'schema'
    | 'worker'
    | 'handler'
    | 'protocol'
    | 'scope'
    | 'payload'
    | 'transport'
    | 'legacy_review'
    | 'receipt_recovered'
  retryable: boolean
  recordedAt: string
}

/** The callback returned; uncertain results do not authorize settlement or replay. */
export interface HandoffTaskReceipt {
  version: 1
  kind: 'handoff-receipt'
  workerId: string
  workerClaim: string
  outcome: 'succeeded' | 'failed' | 'uncertain'
  result: unknown
}
