import type { AnalyticsDefinitionAuthoring } from './analytics-authoring'
import type {
  AnalyticsSourceRef,
  AnalyticsConfigurationEntry,
  AnalyticsBinding,
  AnalyticsProviderDescriptor,
  AnalyticsQueryRequest,
  AnalyticsSourceSummary,
  AnalyticalDataset,
  AnalyticsValue,
  JSONValue,
  AnalyticsDiscoveryRequest,
  AnalyticsDiscoveryResult
} from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../../core/runtime-capability'
import type { DataSourceActor } from '../datasource/workbench'

/** Host-created execution scope. Providers must not accept replacements from payload or controls. */
export interface AnalyticsProviderContext {
  /** Current authenticated actor, not the source owner or Assistant creator. */
  actor: DataSourceActor
  source: AnalyticsSourceRef
  /** Server-only source options; treat as sensitive and never copy into bindings or datasets. */
  options: Record<string, JSONValue>
  /** Forward to source I/O and stop work on cancellation; a host timeout alone cannot stop ignored I/O. */
  signal: AbortSignal
  /** Maximum returned rows; report any source truncation explicitly in completeness. */
  maxRows: number
  /** Remaining budget at provider entry, in milliseconds; use deadlineAt for subsequent/nested work. */
  timeoutMs: number
  /** Assigned before provider invocation so source execution and audit records can correlate. */
  executionId: string
  /** Absolute Unix time in milliseconds; child queries must not extend this deadline. */
  deadlineAt: number
  /** Provider IDs through the current call; forward to child queries for cycle/depth checks. */
  ancestry: readonly string[]
}

/** Native-column result before host projection; cells already use canonical AnalyticsValue encodings. */
export interface AnalyticsProviderResult {
  /** Native row keys and optional exact semantic selectors; declare columns even for zero rows. */
  columns: Array<{ key: string; semanticRef?: string }>
  /** Keys match columns[].key; the host maps them to Binding.output.fields[].id without coercion. */
  rows: Array<Record<string, AnalyticsValue>>
  /** Describe the actual result scope/counts; successful transport does not imply a complete result. */
  completeness: AnalyticalDataset['completeness']
  /** Time of the actual source fetch; distinct from normalization time and business-data freshness. */
  sourceFetchedAt: string
  /** Optional source snapshot/watermark time; omit rather than inventing one. */
  dataAsOf?: string
  /** Opaque source or definition revision, carried into Dataset provenance. */
  sourceVersion?: string
  /** Source-system execution ID, distinct from context.executionId. */
  upstreamExecutionId?: string
  /** Reference to audit evidence, not embedded logs or credentials. */
  auditRef?: string
}

/**
 * Plugin extension point for SQL, ontology, file or other query formats.
 * Implement native payload validation, source permissions and read-only execution here;
 * the host provides scoped lookup, parameter checks, execution limits and result normalization.
 */
export interface AnalyticsQueryProvider {
  readonly descriptor: AnalyticsProviderDescriptor
  readonly configuration?: AnalyticsConfigurationEntry
  readonly authoring?: AnalyticsDefinitionAuthoring
  /** Validate and normalize immutable configuration at publication. */
  validateConfiguration?(
    options: Record<string, JSONValue>,
    actor: DataSourceActor
  ): Promise<Record<string, JSONValue>> | Record<string, JSONValue>
  /** Optional read-only metadata discovery; apply the same scope, cancellation and deadline as queries. */
  discover?(request: JSONValue, context: AnalyticsProviderContext): Promise<AnalyticsDiscoveryResult>
  /** Parameters are resolved by name; binding.payload remains opaque to the host and needs provider validation. */
  execute(
    binding: AnalyticsBinding,
    parameters: Record<string, AnalyticsValue>,
    context: AnalyticsProviderContext
  ): Promise<AnalyticsProviderResult>
}

/** Trusted parent constraints for composed queries; forward the parent context, never client JSON. */
export interface AnalyticsQueryExecution {
  signal: AbortSignal
  /** Parent's absolute Unix deadline in milliseconds, not a fresh timeout for each child. */
  deadlineAt: number
  /** Parent ancestry including its current provider; the runtime appends the child provider ID. */
  ancestry: readonly string[]
}

/** Host capability for in-process consumers; every actor must match the current authenticated context. */
export interface AnalyticsRuntimeApi {
  /** List scoped source/provider metadata without returning connection options. */
  list(actor: DataSourceActor): Promise<AnalyticsSourceSummary[]>
  /** Discover through a registered provider; discovery never substitutes for query authorization. */
  discover(actor: DataSourceActor, request: AnalyticsDiscoveryRequest): Promise<AnalyticsDiscoveryResult>
  /** Execute and normalize fresh data; composed calls must propagate parent constraints via execution. */
  query(
    actor: DataSourceActor,
    request: AnalyticsQueryRequest,
    execution?: AnalyticsQueryExecution
  ): Promise<AnalyticalDataset>
}
export const AnalyticsRuntimeCapability = createRuntimeCapability<AnalyticsRuntimeApi>('platform.analytics', {
  description: 'Execute scoped read-only provider queries and validate their dataset contracts.'
})

/** Trusted host resource adapter; plugins never provide resource ACLs. */
export interface AnalyticsSourceResolver {
  readonly kind: AnalyticsSourceRef['kind']
  list(actor: DataSourceActor): Promise<AnalyticsSourceSummary[]>
  resolve(actor: DataSourceActor, source: AnalyticsSourceRef): Promise<AnalyticsResolvedSource>
}
export interface AnalyticsResolvedSource {
  source: AnalyticsSourceRef
  /** Resource-owned provider identities, not caller-supplied routing. */
  providerIds: string[]
  options: Record<string, JSONValue>
  revalidate(): Promise<void>
}
