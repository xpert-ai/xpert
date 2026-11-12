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

/** Compares published source rules with the scoped active version. A managed release cannot be overwritten as a baseline. */
export interface EvolutionBaselineInspection {
  targetId: string
  canManage: boolean
  status: 'missing' | 'current' | 'update_available' | 'blocked' | 'managed_release'
  preview: EvolutionBaselinePreview
  /** Existing pointer and version, or null if no baseline is active; contentJson may be unavailable independently. */
  current: { pointer: ActiveCapabilityPointer; version: CapabilityVersion; contentJson: string | null } | null
}

/** Tenant, organization and target of the baseline operation; identifiers alone do not grant access. */
export interface EvolutionBaselineIdentity {
  tenantId: string
  organizationId: string
  targetId: string
}

/** Conditional baseline publication bound to the reviewed source and the observed pointer revision. */
export interface EvolutionBaselinePublishRequest extends EvolutionBaselineIdentity {
  mode: 'initialize' | 'update'
  /** Pointer revision at inspection; zero denotes an absent pointer for initialization. */
  expectedRevision: number
  /** Content hash of the reviewed source preview, distinct from the pointer revision. */
  expectedHash: string
  reason: string
}

/** Plugin-facing contract for inspecting and conditionally publishing a scoped baseline. */
export interface EvolutionBaselineRuntimeApi {
  /** Returns source readiness and current version information without changing the pointer. */
  inspect(input: EvolutionBaselineIdentity): Promise<EvolutionBaselineInspection>
  /** Publishes the reviewed baseline under the requested preconditions; must preserve a release-managed pointer. */
  publish(input: EvolutionBaselinePublishRequest): Promise<ActiveCapabilityPointer>
}

/** Provider-defined read access to source rules and to a particular baseline artifact. */
export interface EvolutionBaselineReader {
  /** Describes the current source content and whether it is ready to export. */
  previewBaseline(request: ExportEvolutionBaselineRequest): Promise<EvolutionBaselinePreview>
  /** Returns the JSON content of the specified artifact, independent of changes to current source rules. */
  readBaseline(request: ExportEvolutionBaselineRequest, artifact: EvolutionArtifactRef): Promise<string>
}
