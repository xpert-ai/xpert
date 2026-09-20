import type { ActiveCapabilityPointer, CapabilityVersion } from './capability-version'
import type { ExportEvolutionBaselineRequest } from './candidate'
import type { EvolutionArtifactRef } from './target'

/** A provider-owned, read-only snapshot of the currently published source rules. */
export interface EvolutionBaselinePreview {
  hash: string
  contentJson: string
  ready: boolean
  issues: string[]
}

export interface EvolutionBaselineInspection {
  targetId: string
  canManage: boolean
  status: 'missing' | 'current' | 'update_available' | 'blocked' | 'managed_release'
  preview: EvolutionBaselinePreview
  current: { pointer: ActiveCapabilityPointer; version: CapabilityVersion; contentJson: string | null } | null
}

export interface EvolutionBaselineIdentity {
  tenantId: string
  organizationId: string
  targetId: string
}

export interface EvolutionBaselinePublishRequest extends EvolutionBaselineIdentity {
  mode: 'initialize' | 'update'
  expectedRevision: number
  expectedHash: string
  reason: string
}

export interface EvolutionBaselineRuntimeApi {
  inspect(input: EvolutionBaselineIdentity): Promise<EvolutionBaselineInspection>
  publish(input: EvolutionBaselinePublishRequest): Promise<ActiveCapabilityPointer>
}

export interface EvolutionBaselineReader {
  previewBaseline(request: ExportEvolutionBaselineRequest): Promise<EvolutionBaselinePreview>
  readBaseline(request: ExportEvolutionBaselineRequest, artifact: EvolutionArtifactRef): Promise<string>
}
