import type {
  ProjectPipelineEvidenceRef,
  ProjectPipelineJsonValue,
  ProjectPipelineSubjectVersion,
  ProjectPipelineWorkContext,
  ProjectPipelineOperationInput,
  ProjectPipelineOperationReceipt,
  ProjectPipelineCompletionReceipt,
  ProjectPipelinePolicyReceipt,
  ProjectPipelineAssistantInput,
  ProjectPipelineResourceClaim,
  ProjectPipelineResourceReservation,
  ProjectPipelineRuntimeInput,
  XpertProjectViewSelection
} from '@xpert-ai/contracts'
import type { ProjectPipelineContext } from './capability'
import type { AgentInvocationResult } from '../agent/runtime/types'
export type { ProjectPipelineOperationReceipt } from '@xpert-ai/contracts'

/** Runtime adapters are registered separately from catalog declarations and resolved in the actor scope. */
export interface ProjectPipelineSubjectResolver {
  resolve(context: ProjectPipelineContext, objectKey: string): Promise<ProjectPipelineSubjectVersion>
  checkCurrent(context: ProjectPipelineContext, version: ProjectPipelineSubjectVersion): Promise<boolean>
  /** Read-only business entry for a saved subject. Reauthorize its Project and actor; never return a URL. */
  resolveEntry?(
    context: ProjectPipelineContext,
    objectKey: string
  ): Promise<XpertProjectViewSelection & { xpertId: string }>
}

export interface ProjectPipelineEvidenceResolver {
  /** Reauthorize exact object and version; a stored reference is not a bearer credential. */
  read(context: ProjectPipelineContext, reference: ProjectPipelineEvidenceRef): Promise<ProjectPipelineJsonValue>
}
export interface ProjectPipelineValueSchema {
  /** Parse typed evidence content. The host converts failures to a safe diagnostic code. */
  parse(value: unknown): ProjectPipelineJsonValue
}

export interface ProjectPipelineOperationContext extends ProjectPipelineContext {
  work: ProjectPipelineWorkContext
  idempotencyKey: string
  inputs: { [port: string]: ProjectPipelineOperationInput }
  parameters: { [key: string]: ProjectPipelineJsonValue }
  subjects: ProjectPipelineSubjectVersion[]
  /** Host-populated durable occupancy. Never an OS sandbox or a bearer permission. */
  resources?: ProjectPipelineResourceReservation
}

export interface ProjectPipelineResourceResolver {
  /** Read-only authorization/canonicalization of real identities. No allocation or external writes here.
   * Hash the canonical identity consistently across aliases/Projects/tenants; never trust a template lock key.
   * The executor must recheck its exact resource identity and enforce filesystem/process isolation itself. */
  resolve(context: ProjectPipelineOperationContext): Promise<ProjectPipelineResourceClaim[]>
}

export interface ProjectPipelineNodeHandler {
  /** The host persists the intent before execute. Domain writes must check the version/generation too. */
  execute(context: ProjectPipelineOperationContext): Promise<ProjectPipelineOperationReceipt>
  /** An unknown effect is inspected with the same idempotency key; it is not automatically replayed. */
  inspect(context: ProjectPipelineOperationContext, receiptKey?: string): Promise<ProjectPipelineOperationReceipt>
  cancel?(context: ProjectPipelineOperationContext, receiptKey: string): Promise<ProjectPipelineOperationReceipt>
}

/** The host binds the authorized published Assistant, Project and stable runtime IDs. */
export interface ProjectPipelineAssistantContext extends ProjectPipelineOperationContext {
  executor: {
    xpertId: string
    workspaceId: string
    publishedVersion: string
    executionId: string
    conversationId: string
  }
}
export interface ProjectPipelineAssistantOperation {
  /** Bounded domain prompt/context only; no actor, Project, model or executor overrides. */
  prepare(context: ProjectPipelineAssistantContext): Promise<ProjectPipelineAssistantInput>
  /** Read the domain outputs after the native Runtime confirms success. Must be idempotent. */
  collect(context: ProjectPipelineAssistantContext): Promise<Record<string, ProjectPipelineEvidenceRef>>
}

export interface ProjectPipelineRuntimeContext extends ProjectPipelineOperationContext {
  executor: { bindingId: string; provider: string; revision: string; reference: string; invocationId: string }
}
export interface ProjectPipelineRuntimeOperation {
  /** Bounded domain input only; the host selects and pins identity, target and invocation ID. */
  prepare(context: ProjectPipelineRuntimeContext): Promise<ProjectPipelineRuntimeInput>
  /** Persist typed domain evidence only after the Runtime reports success. Must be idempotent. */
  collect(
    context: ProjectPipelineRuntimeContext,
    result: AgentInvocationResult
  ): Promise<Record<string, ProjectPipelineEvidenceRef>>
}

export interface ProjectPipelineCompletionEvaluator {
  evaluate(
    context: ProjectPipelineOperationContext,
    receipt: ProjectPipelineOperationReceipt
  ): Promise<ProjectPipelineCompletionReceipt>
}

export interface ProjectPipelinePolicyEvaluator {
  /** Pure evaluation: reevaluation after a lost worker must not perform a business write. */
  evaluate(context: ProjectPipelineOperationContext): Promise<ProjectPipelinePolicyReceipt>
  /** Required for human gates. Reauthorize the candidate selector and validate this exact decision. */
  authorizeDecision?(
    context: ProjectPipelineOperationContext,
    input: {
      candidateSelectionKey: string
      outcome: string
      evidence: ProjectPipelineEvidenceRef[]
    }
  ): Promise<boolean>
}
