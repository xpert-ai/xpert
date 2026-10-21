import type { AnalyticsSourceRef } from './analytics-source.model'
import type { JSONValue } from './core.model'

/** JSON-safe scalar shared by cells and controls; nested objects/arrays are not dataset cells. */
export type AnalyticsValue = string | number | boolean | null
/** int64/decimal use exact strings; date uses YYYY-MM-DD; timestamp includes a timezone. */
export type AnalyticsLogicalType = 'string' | 'boolean' | 'int64' | 'float64' | 'decimal' | 'date' | 'timestamp'

/** Maps one provider column to a stable, typed field consumed by renderers. */
export interface AnalyticsField {
  /** Dataset row key and chart-binding identifier; never derived from the display label. */
  id: string
  /** Exact provider column key used when semanticRef is absent. */
  sourceField: string
  label: string
  logicalType: AnalyticsLogicalType
  /** Allows null cells, not missing row keys. */
  nullable: boolean
  /** Declared business role; does not implicitly aggregate or convert values. */
  role: 'dimension' | 'measure' | 'time' | 'identifier'
  /** Exact provider semantic identifier; takes precedence over sourceField and must match one column. */
  semanticRef?: string
  /** Authored unit such as CNY; metadata only, with no automatic scaling or conversion. */
  unit?: string
}

/** Output projection shared by native SQL, ontology, file and other provider implementations. */
export interface AnalyticsOutputContract {
  /** Renderer-facing identifier, independent of native table/resource names. */
  datasetId: string
  fields: AnalyticsField[]
  /** Composite key of field IDs, unique within returned rows; [] leaves grain unspecified. */
  grain: string[]
}

/** Maps a UI control to a validated provider parameter without rewriting the native payload. */
export interface AnalyticsParameter {
  /** Key passed to the provider's resolved parameters object. */
  name: string
  /** Key read from request.controls; multiple parameters may consume the same control. */
  controlId: string
  /** Scalar parameter type; date is a valid YYYY-MM-DD string. */
  type: 'string' | 'number' | 'boolean' | 'date'
  /** Rejects missing/null values after defaults; unresolved optional parameters become null. */
  required: boolean
  /** Used only when the control key is absent; an explicit null does not select this default. */
  defaultValue?: AnalyticsValue
  /** Optional allowlist for non-null values; does not grant access to source data. */
  allowedValues?: AnalyticsValue[]
}

/**
 * Serializable query declaration. The host owns scope/limits; the provider owns native syntax.
 * Renderers consume the normalized Dataset, never execute payload or handle source credentials.
 */
export interface AnalyticsBinding {
  /** Binding identity used for lookup and result provenance. */
  id: string
  /** Exact governed resource; access is rechecked for the current actor on each execution. */
  source: AnalyticsSourceRef
  /** Registered provider descriptor ID, not a display name or database engine switch. */
  providerId: string
  /** Must match a read-only operation advertised by the provider. */
  operation: string
  /** Provider-owned operation version; incompatible payload semantics require a new version. */
  contractVersion: number
  /** Provider-defined JSON, e.g. a native query or resource reference; exclude credentials and actor scope. */
  payload: JSONValue
  parameters: AnalyticsParameter[]
  output: AnalyticsOutputContract
}

/** Public query input; tenant, organization and user identity come from trusted host context. */
export interface AnalyticsQueryRequest {
  binding: AnalyticsBinding
  /** Values keyed by controlId; undeclared keys are rejected and absent keys resolve through defaults. */
  controls: Record<string, AnalyticsValue>
}

/** Canonical, provider-independent result; consumers must inspect completeness before presenting totals. */
export interface AnalyticalDataset {
  schema: 'xpert.analytics.dataset'
  datasetId: string
  /** Preserved even when rows is empty, so renderers can retain bindings and labels. */
  fields: AnalyticsField[]
  /** Keys are AnalyticsField.id, not native column names; precise numbers remain strings. */
  rows: Array<Record<string, AnalyticsValue>>
  /** Declared output grain, validated for uniqueness when nonempty. */
  grain: string[]
  completeness: {
    /** Number of rows in this response; must equal rows.length. */
    returnedRows: number
    /** Optional source count, qualified by totalAccuracy; absence never means zero. */
    totalRows?: number
    totalAccuracy: 'exact' | 'estimated' | 'unknown'
    /** What the response represents; page/sample/top_n must not be presented as the complete query. */
    scope: 'full_query_result' | 'page' | 'sample' | 'top_n'
    /** Omitted rows due to a limit; cannot be true with full_query_result. */
    truncated: boolean
  }
  freshness: {
    /** Host timestamp when the result was normalized, not the source's business-data timestamp. */
    executedAt: string
    /** Provider timestamp for fetching source data; must not be replaced with page render time. */
    sourceFetchedAt: string
    /** Optional source-reported snapshot/watermark time; omit when unknown. */
    dataAsOf?: string
  }
  provenance: {
    /** Host-generated execution identity, distinct from the reusable Binding ID. */
    executionId: string
    bindingId: string
    providerId: string
    /** Opaque source/definition revision; not an authorization token or cache permission. */
    sourceVersion?: string
    /** Source-system execution identity, when the provider delegates execution. */
    upstreamExecutionId?: string
    /** Reference to governed audit evidence; do not embed secrets or full logs here. */
    auditRef?: string
  }
}

/** Public discovery metadata. Advertising a capability does not authorize its execution. */
export interface AnalyticsProviderDescriptor {
  /** Stable registration ID used by Binding.providerId. */
  id: string
  name: string
  /** Exact platform DataSource.type identifiers supported by this provider. */
  dataSourceTypes?: string[]
  sourceKinds: AnalyticsSourceRef['kind'][]
  /** Supported operation/version pairs; providers must enforce read-only behavior at the source. */
  operations: Array<{ name: string; contractVersion: number; readOnly: true }>
  /** Declares a provider-wide collaboration constraint; does not grant source or file access. */
  sharing?: { mode: 'viewer_permissions' | 'owner_only'; reasonCode?: string }
}

/** Discoverable source and available providers for the current actor; contains no connection options. */
export interface AnalyticsSourceSummary {
  source: AnalyticsSourceRef
  name: string
  providers: AnalyticsProviderDescriptor[]
}

/** Read-only catalog navigation; continuation data is provider-owned and never grants authorization. */
export interface AnalyticsDiscoveryRequest {
  source: AnalyticsSourceRef
  providerId: string
  /** Initial provider request or a returned inspectRequest/nextRequest, forwarded without interpretation. */
  request: JSONValue
}

/** Bounded discovery page plus the native query contract needed by an Agent or query builder. */
export interface AnalyticsDiscoveryResult {
  items: Array<{
    /** Provider-local resource identity; need not be a platform entity UUID. */
    id: string
    name: string
    /** Explicit navigation distinction; consumers must not infer it from names or metadata. */
    kind: 'collection' | 'dataset'
    description?: string
    /** Request for inspecting this item using the same source/provider; not a token or executable query. */
    inspectRequest?: JSONValue
    /** Provider-owned metadata, e.g. authored field descriptions, units or ontology definitions. */
    metadata: JSONValue
  }>
  /** Request for the next discovery page; omission means no continuation is offered. */
  nextRequest?: JSONValue
  /** Describes Binding.payload; actual queries still require provider validation and authorization. */
  queryContract: {
    operation: string
    contractVersion: number
    payloadSchema: JSONValue
    /** Native syntax and business-semantic guidance; does not replace payloadSchema validation. */
    instructions: string
  }
}
