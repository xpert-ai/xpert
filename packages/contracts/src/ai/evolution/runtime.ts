import { LearningEvent, LearningEventInput } from './learning-event'
import { CapabilityVersion, CapabilityVersionBundle } from './capability-version'
import { EvolutionChannel, EvolutionExecutionMode, EvolutionScope } from './target'

/** Outcome of one target decision, attributable to the execution, version bundle and channel that produced it. */
export interface EvolutionRuntimeObservationInput {
  observationId?: string
  targetId: string
  scope: EvolutionScope
  executionId: string
  bundleId: string
  deploymentId?: string
  subjectKey: string
  channel: EvolutionChannel
  /** Production baseline outcome on the same input. Omit when unknown; false means an observed failure. */
  baselineSuccess?: boolean
  success: boolean
  severeError: boolean
  latencyMs: number
  cost?: number
  correctionRequired?: boolean
  observedAt: string
}

/** Recorded decision outcome; creation time is distinct from the time the outcome was observed. */
export interface EvolutionRuntimeObservation extends EvolutionRuntimeObservationInput {
  observationId: string
  createdAt: string
}

/** Selects versions for one execution in its trusted tenant and resource scope. */
export interface ResolveCapabilityExecutionPlanRequest {
  tenantId: string
  organizationId?: string | null
  scope: EvolutionScope
  targetIds: string[]
  /** Stable cohort identity within a deployment; distinct from the ID of an individual execution. */
  subjectKey: string
  executionId: string
}

/** Version and channel selected for one target; a deployment ID attributes the assignment to a rollout. */
export interface CapabilityExecutionAssignment {
  targetId: string
  channel: EvolutionChannel
  versionId: string
  deploymentId?: string
  /** Present for an explicit test assignment, distinct from ordinary canary allocation. */
  selectionReason?: 'manual_test_override'
  manualTestOverrideId?: string
}

/** Audit record binding a consumed single-use canary assignment to its target and deployment. */
export interface CapabilityExecutionManualTestOverride {
  overrideId: string
  releasePackageId: string
  deploymentId: string
  targetId: string
  consumedAt: string
}

/** Pins the versions for one execution. Only the primary assignments determine the served decision. */
export interface CapabilityExecutionPlan {
  executionId: string
  /** Mode of the overall plan; a particular target's channel is given by its own assignment. */
  executionMode: EvolutionExecutionMode
  subjectKey: string
  /** Version bindings for the primary assignments, including any selected canary versions. */
  bundle: CapabilityVersionBundle
  assignments: CapabilityExecutionAssignment[]
  /** Explicit audit marker; never present for normal deterministic Canary routing. */
  manualTestOverrides?: CapabilityExecutionManualTestOverride[]
  /** Separate bindings for observation only; shadow results must not change the served decision. */
  shadowBundle?: CapabilityVersionBundle
  shadowAssignments?: CapabilityExecutionAssignment[]
  resolvedAt: string
}

/** Plugin-facing contract for scoped evidence, runtime version resolution and observed outcomes. */
export interface EvolutionRuntimeApi {
  /** Records evidence under its idempotency key; accepting evidence does not change the active version. */
  ingestLearningEvent(input: {
    tenantId: string
    organizationId?: string | null
    event: LearningEventInput
  }): Promise<LearningEvent>
  /** Resolves the primary and optional shadow bindings for the specified execution. */
  resolveExecutionPlan(request: ResolveCapabilityExecutionPlanRequest): Promise<CapabilityExecutionPlan>
  /** Returns the recorded bindings by bundle ID, independent of later pointer changes. */
  getCapabilityBundle(input: {
    tenantId: string
    organizationId?: string | null
    bundleId: string
  }): Promise<CapabilityVersionBundle>
  /** Returns the immutable version and artifact reference identified by version ID within the supplied identity. */
  getCapabilityVersion(input: {
    tenantId: string
    organizationId?: string | null
    versionId: string
  }): Promise<CapabilityVersion>
  /** Attributes an observed outcome to the execution and bundle that produced it. */
  recordRuntimeObservation(input: {
    tenantId: string
    organizationId?: string | null
    observation: EvolutionRuntimeObservationInput
  }): Promise<EvolutionRuntimeObservation>
}
