import type {
  AnalyticsBinding,
  AnalyticsDiscoveryRequest,
  AnalyticsProviderDescriptor,
  AnalyticsQueryRequest
} from './analytics-query.model'

/** References are identities, never credentials, actor scope or mutable "latest" pointers. */
export type AnalyticsSourceRef =
  | { kind: 'data-source'; dataSourceId: string }
  | { kind: 'definition'; definitionId: string; versionId: string }
  | { kind: 'artifact'; artifactId: string; versionId: string }

export type AnalyticsVersionedSourceRef = Exclude<AnalyticsSourceRef, { kind: 'data-source' }>

/** Additive envelope. AnalyticsBinding remains the v1 wire and plugin contract. */
export interface AnalyticsBindingV2 extends Omit<AnalyticsBinding, 'schemaVersion' | 'dataSourceId'> {
  schemaVersion: 2
  source: AnalyticsSourceRef
}
export type SupportedAnalyticsBinding = AnalyticsBinding | AnalyticsBindingV2
export interface AnalyticsQueryRequestV2 extends Omit<AnalyticsQueryRequest, 'binding'> {
  binding: SupportedAnalyticsBinding
}
export interface AnalyticsDiscoveryRequestV2 extends Omit<AnalyticsDiscoveryRequest, 'dataSourceId'> {
  source: AnalyticsSourceRef
}
export interface AnalyticsProviderDescriptorV2 extends Omit<
  AnalyticsProviderDescriptor,
  'dataSourceTypes' | 'connectionType'
> {
  sourceKinds: AnalyticsSourceRef['kind'][]
}
export interface AnalyticsSourceSummaryV2 {
  source: AnalyticsSourceRef
  name: string
  providers: AnalyticsProviderDescriptorV2[]
}
