import type {
  AnalyticalDataset,
  AnalyticsBindingV2,
  AnalyticsDiscoveryRequestV2,
  AnalyticsDiscoveryResult,
  AnalyticsProviderDescriptorV2,
  AnalyticsQueryRequestV2,
  AnalyticsSourceSummaryV2,
  AnalyticsValue,
  AnalyticsVersionedSourceRef,
  JSONValue
} from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../../core/runtime-capability'
import type { DataSourceActor } from '../datasource/workbench'
import type { AnalyticsProviderContext, AnalyticsProviderResult, AnalyticsQueryExecution } from './analytics-provider'

export interface AnalyticsProviderContextV2 extends Omit<AnalyticsProviderContext, 'dataSourceId'> {
  source: AnalyticsVersionedSourceRef
}
/** A separate extension point; existing AnalyticsQueryProvider implementations keep their v1 signatures. */
export interface AnalyticsQueryProviderV2 {
  readonly descriptor: AnalyticsProviderDescriptorV2 & { sourceKinds: AnalyticsVersionedSourceRef['kind'][] }
  discover?(request: JSONValue, context: AnalyticsProviderContextV2): Promise<AnalyticsDiscoveryResult>
  execute(
    binding: AnalyticsBindingV2,
    parameters: Record<string, AnalyticsValue>,
    context: AnalyticsProviderContextV2
  ): Promise<AnalyticsProviderResult>
}
/** Trusted host resource adapter. Authorize the exact version and current actor before returning options. */
export interface AnalyticsSourceResolver {
  readonly kind: AnalyticsVersionedSourceRef['kind']
  list(actor: DataSourceActor): Promise<AnalyticsSourceSummaryV2[]>
  resolve(actor: DataSourceActor, source: AnalyticsVersionedSourceRef): Promise<AnalyticsResolvedSource>
}
export interface AnalyticsResolvedSource {
  source: AnalyticsVersionedSourceRef
  /** Persisted resource ownership, not caller-supplied provider identity. */
  providerId: string
  /** Private configuration from the authorized immutable version; never serialize to public source lists. */
  options: Record<string, JSONValue>
  /** Recheck authorization, version integrity and resource status after execution. Fail closed on revocation. */
  revalidate(): Promise<void>
}
export interface AnalyticsRuntimeApiV2 {
  list(actor: DataSourceActor): Promise<AnalyticsSourceSummaryV2[]>
  discover(actor: DataSourceActor, input: AnalyticsDiscoveryRequestV2): Promise<AnalyticsDiscoveryResult>
  query(
    actor: DataSourceActor,
    input: AnalyticsQueryRequestV2,
    execution?: AnalyticsQueryExecution
  ): Promise<AnalyticalDataset>
}
export const AnalyticsRuntimeCapabilityV2 = createRuntimeCapability<AnalyticsRuntimeApiV2>('platform.analytics.v2', {
  description: 'Execute v1 bindings and explicitly versioned v2 analytics sources without rewriting stored documents.'
})
