import type { AnalyticsBinding, AnalyticsValue } from '@xpert-ai/contracts'
import type { ArtifactVersionContext } from './version-context'

/** A published dataset declaration, available only to trusted server-side orchestration. */
export interface ArtifactAnalyticsBinding {
  /**
   * Binding resolved exclusively from the fixed version. Its id is the stable dataset key used by grants.
   * Preserve its source, provider, operation and native payload; never substitute a mutable query.
   * Do not expose this object to Agent/UI clients: it can contain private native query declarations.
   */
  binding: AnalyticsBinding
  /** Optional domain label; the host uses binding.output.datasetId when omitted. Not an identity or permission. */
  title?: string
}

/**
 * Optional analytics extension of an existing Artifact Type registration, not a separately registered provider.
 * Parses published declarations without querying data, discovering sources or requiring a Workbench renderer.
 * The host owns grants, safe descriptions, source-sharing checks and Analytics execution under the current actor.
 * Omission means this type does not support Agent analysis; it never falls back to presentation query hooks.
 */
export interface ArtifactTypeAnalytics {
  /** Return unique binding ids from context.content only; [] means this version has no analyzable datasets. */
  resolveBindings(
    context: ArtifactVersionContext
  ): Promise<readonly ArtifactAnalyticsBinding[]> | readonly ArtifactAnalyticsBinding[]
  /**
   * Optional domain control validation/mapping for the selected dataset (e.g. published dashboard control defaults).
   * Reject unknown or disallowed inputs before applying defaults and selecting the binding's controls.
   * Return scalar values keyed by controlId; never execute data or change the binding/source/actor.
   * When omitted, input is passed unchanged. Analytics still validates declared parameters, types and allowlists.
   */
  normalizeControls?(
    context: ArtifactVersionContext,
    datasetKey: string,
    controls: Record<string, AnalyticsValue>
  ): Promise<Record<string, AnalyticsValue>> | Record<string, AnalyticsValue>
}
