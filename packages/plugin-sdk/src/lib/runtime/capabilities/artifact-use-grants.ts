import { createRuntimeCapability } from '../../core/runtime-capability'
import type { ArtifactUseGrantSummary, ResourceAnalysisDataset, ResourceAnalysisPolicy } from '@xpert-ai/contracts'

/** Offset pagination for source grant management; advance using the returned nextOffset, not a locally guessed cursor. */
export interface ArtifactGrantPage {
  /** Zero-based start position; the runtime validates the supported range. */
  offset: number
  /** Requested page size (1–100); a full page may require one further request to determine the end. */
  limit: number
}
/** Source-management display metadata for a grant; it is not a group reference or proof of current access. */
export interface ArtifactGrantDetails extends ArtifactUseGrantSummary {
  /** Pinned version's display title; empty when its metadata is unavailable. */
  title: string
  /** Pinned version's display sequence; 0 denotes unavailable metadata, not a usable version ID. */
  versionNumber: number
}
/**
 * Source grant-management capability for external plugins' human authoring flows, such as a resource sharing View.
 * The host resolves the authenticated human on every call; possession of the capability or plugin installation is not authority.
 * Embedded Views use the bounded host authoring command rather than receiving login credentials or escalating a group session.
 * Group acceptance/removal belongs to the receiving group's API and is intentionally not provided here.
 */
export interface ArtifactUseGrantsApi {
  /**
   * Inspect one published version's declared datasets and current source-sharing eligibility without executing data queries.
   * Requires source management access. Returned canShare hints are advisory; offer rechecks the requested scope.
   */
  analysisOptions(input: { artifactId: string; versionId: string }): Promise<ResourceAnalysisDataset[]>
  /**
   * List groups the current human belongs to with a bound, non-archived usage Project, after checking source management.
   * items[].id is the group ID and projectId is its usage Project. Candidates are not preauthorized offers; offer revalidates.
   * nextOffset is null at the detected end of the list.
   */
  targets(
    input: ArtifactGrantPage & { artifactId: string }
  ): Promise<{ items: Array<{ id: string; title: string; projectId: string }>; nextOffset: number | null }>
  /** List this source Artifact's issued grants, including terminal/expired entries; nextOffset null ends pagination. */
  issued(
    input: ArtifactGrantPage & { artifactId: string }
  ): Promise<{ items: ArtifactGrantDetails[]; nextOffset: number | null }>
  /**
   * Create an offered grant for a fixed published version; it becomes usable only after group-owner acceptance.
   * Both Projects and actor scope are resolved by the host. Existing grants are not silently replaced or broadened.
   */
  offer(input: {
    /** Source Artifact managed by the current human. */
    artifactId: string
    /** Exact published version belonging to artifactId; never a draft or latest-version selector. */
    versionId: string
    /** Receiving group in the same organization with a different usage Project from the source. */
    targetGroupId: string
    /** Future ISO 8601 timestamp with timezone/offset; this runtime API does not accept a relative day count. */
    expiresAt: string
    /** Proposed dataset analysis scope; omission creates a view-only offer and never grants upstream credentials. */
    analysis?: ResourceAnalysisPolicy
  }): Promise<ArtifactUseGrantSummary>
  /**
   * Revoke an offered/active grant belonging to artifactId using its latest grant revision, not a reference revision.
   * A stale revision fails; refresh state before deciding to retry. Closure blocks future access but cannot recall disclosed data.
   */
  revoke(input: { artifactId: string; grantId: string; expectedRevision: number }): Promise<ArtifactUseGrantSummary>
}
/** Stable plugin/host registry key; resolve via runtime capabilities rather than dispatching host-internal CQRS classes. */
export const ArtifactUseGrantsRuntimeCapability = createRuntimeCapability<ArtifactUseGrantsApi>(
  'platform.artifact-use-grants',
  {
    description:
      'Human authoring Views issue and revoke fixed-version group grants; group credentials cannot manage source grants.'
  }
)
