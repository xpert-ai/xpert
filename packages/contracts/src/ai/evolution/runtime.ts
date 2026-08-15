import { LearningEvent, LearningEventInput } from './learning-event'
import { CapabilityVersion, CapabilityVersionBundle } from './capability-version'
import { EvolutionChannel, EvolutionExecutionMode, EvolutionScope } from './target'

export interface EvolutionRuntimeObservationInput {
  observationId?: string
  targetId: string
  scope: EvolutionScope
  executionId: string
  bundleId: string
  deploymentId?: string
  subjectKey: string
  channel: EvolutionChannel
  success: boolean
  severeError: boolean
  latencyMs: number
  cost?: number
  correctionRequired?: boolean
  observedAt: string
}

export interface EvolutionRuntimeObservation extends EvolutionRuntimeObservationInput {
  observationId: string
  createdAt: string
}

export interface ResolveCapabilityExecutionPlanRequest {
  tenantId: string
  organizationId?: string | null
  scope: EvolutionScope
  targetIds: string[]
  subjectKey: string
  executionId: string
}

export interface CapabilityExecutionAssignment {
  targetId: string
  channel: EvolutionChannel
  versionId: string
  deploymentId?: string
  selectionReason?: 'manual_test_override'
  manualTestOverrideId?: string
}

export interface CapabilityExecutionManualTestOverride {
  overrideId: string
  releasePackageId: string
  deploymentId: string
  targetId: string
  consumedAt: string
}

export interface CapabilityExecutionPlan {
  executionId: string
  executionMode: EvolutionExecutionMode
  subjectKey: string
  bundle: CapabilityVersionBundle
  assignments: CapabilityExecutionAssignment[]
  /** Explicit audit marker; never present for normal deterministic Canary routing. */
  manualTestOverrides?: CapabilityExecutionManualTestOverride[]
  shadowBundle?: CapabilityVersionBundle
  shadowAssignments?: CapabilityExecutionAssignment[]
  resolvedAt: string
}

export interface EvolutionRuntimeApi {
  ingestLearningEvent(input: {
    tenantId: string
    organizationId?: string | null
    event: LearningEventInput
  }): Promise<LearningEvent>
  resolveExecutionPlan(request: ResolveCapabilityExecutionPlanRequest): Promise<CapabilityExecutionPlan>
  getCapabilityBundle(input: {
    tenantId: string
    organizationId?: string | null
    bundleId: string
  }): Promise<CapabilityVersionBundle>
  getCapabilityVersion(input: {
    tenantId: string
    organizationId?: string | null
    versionId: string
  }): Promise<CapabilityVersion>
  recordRuntimeObservation(input: {
    tenantId: string
    organizationId?: string | null
    observation: EvolutionRuntimeObservationInput
  }): Promise<EvolutionRuntimeObservation>
}
