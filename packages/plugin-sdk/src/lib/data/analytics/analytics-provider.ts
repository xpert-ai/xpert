import type { AnalyticsDefinitionAuthoring } from './analytics-authoring'
import type {
  AnalyticsSourceRef,
  AnalyticsConfigurationEntry,
  AnalyticsBinding,
  AnalyticsField,
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

/** Source-declared metadata, never inferred from names or sampled cells. */
export type AnalyticsResultColumn = { key: string } & Partial<
  Pick<AnalyticsField, 'semanticRef' | 'logicalType' | 'role' | 'nullable' | 'label' | 'unit'>
>

/** Native-column result before host projection; cells already use canonical AnalyticsValue encodings. */
export interface AnalyticsProviderResult {
  /** Declare columns even for zero rows. Optional metadata supports authoring; it never overrides Binding.output. */
  columns: AnalyticsResultColumn[]
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
  /** Only source-verified business approvals; never copy from Binding payload or display metadata. */
  certification?: AnalyticalDataset['provenance']['certification']
}

/**
 * Host-supplied scope for one model setup operation on an authorized connection.
 * Providers use this actor and connection for source access and propagate the signal and deadline to upstream calls.
 */
export interface AnalyticsModelSetupContext {
  /** Include models prepared through application templates when the actor has access to them. */
  includeProvisioned?: boolean
  /** Only the selected connection. Rechecks the acting organization's configuration grant on every read. */
  readConnectionOptions(): Promise<unknown>
  actor: DataSourceActor
  integrationId: string
  signal: AbortSignal
  deadlineAt: number
}

/** Choices an administrator reviews before preparing a model from an application template. */
export interface AnalyticsModelBootstrapSelection {
  workspaceId: string
  dataSourceId: string
  /** Stable ID of a preparation mode declared by the application's bootstrap template. */
  mode: string
  /** Organization members selected to receive read access in this operation. Existing grants are retained. */
  userIds: string[]
}

/**
 * Optional provider extension for preparing a model from the application's versioned bundle.
 * Inspect the selected resources before confirmation. Applying the confirmed plan must support retries
 * and preserve existing resources when their configuration conflicts with the plan.
 */
export interface AnalyticsModelBootstrap {
  workspaces(context: AnalyticsModelSetupContext): Promise<Array<{ id: string; label: string }>>
  sources(context: AnalyticsModelSetupContext, workspaceId: string): Promise<Array<{ id: string; label: string }>>
  /** Describe the proposed changes without writing. The fingerprint identifies the state reviewed by the administrator. */
  inspect(
    context: AnalyticsModelSetupContext,
    bundle: JSONValue,
    selection: AnalyticsModelBootstrapSelection
  ): Promise<{
    state: 'create' | 'resume' | 'reuse' | 'conflict'
    modelLabel: string
    fingerprint: string
    differences: string[]
  }>
  /** Recheck the fingerprint before making changes. Use the host callbacks for scoped access to the prepared model. */
  apply(
    context: AnalyticsModelSetupContext,
    bundle: JSONValue,
    selection: AnalyticsModelBootstrapSelection,
    fingerprint: string,
    access: {
      area(modelKey: string, name: string): Promise<string>
      prepare(resourceId: string, name: string): Promise<{ xpertId: string; businessAreaId: string }>
      grant(resourceId: string, xpertId: string): Promise<void>
    }
  ): Promise<{ id: string; label: string }>
}

/**
 * Provider extension for choosing an authorized model and previewing an application's query recipes.
 * The provider returns a sample and a candidate binding for each recipe. On confirmation the host binds
 * the queries to a published definition version. Implement bootstrap to also offer model preparation.
 */
export interface AnalyticsModelSetup {
  bootstrap?: AnalyticsModelBootstrap
  /** Integration provider ID the host uses to find compatible connections. */
  integrationProvider: string
  models(context: AnalyticsModelSetupContext): Promise<Array<{ id: string; label: string }>>
  preview(
    context: AnalyticsModelSetupContext,
    modelId: string,
    recipes: Record<string, JSONValue>
  ): Promise<{
    options: Record<string, JSONValue>
    modelLabel: string
    queries: Array<{
      key: string
      binding: Omit<AnalyticsBinding, 'source'>
      rowCount: number
      sample: Array<Record<string, AnalyticsValue>>
    }>
  }>
}

/**
 * Plugin extension point for SQL, ontology, file or other query formats.
 * Providers validate native payloads, enforce source permissions and execute read-only queries.
 * The host handles scoped lookup, parameter checks, execution limits and result normalization.
 */
export interface AnalyticsQueryProvider {
  readonly modelSetup?: AnalyticsModelSetup
  readonly descriptor: AnalyticsProviderDescriptor
  readonly configuration?: AnalyticsConfigurationEntry
  readonly authoring?: AnalyticsDefinitionAuthoring
  /** Independently authorize this exact query, including upstream privileges, and return its current
   * sourceVersion. Called before and after EVERY reuse (including coalesced requests). Omission disables
   * caching. The revision must match execute() and cover the exact result, including its certification.
   * Metadata discovery alone is insufficient. Never return a credential or reusable grant. */
  authorizeResultReuse?(
    binding: AnalyticsBinding,
    parameters: Record<string, AnalyticsValue>,
    context: AnalyticsProviderContext
  ): Promise<{ sourceVersion: string }>
  /** Explicit source authority to disclose this binding's results to a group.
   * Read access alone is insufficient. Unsupported providers must remain view-only. */
  authorizeGroupSharing?(binding: AnalyticsBinding, context: AnalyticsProviderContext): Promise<void>
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
