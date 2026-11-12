import type { AnalyticalDataset, AnalyticsField, AnalyticsParameter, AnalyticsValue } from './analytics-query.model'

/**
 * Explicit consent to disclose bounded query results to every member of the receiving group.
 * The source manager proposes this scope and the group owner independently accepts it.
 * Each query still uses the requesting human's upstream data permissions, never the source author's credentials.
 * Omit the policy entirely for view-only access; an empty dataset list is not a wildcard grant.
 */
export interface ResourceAnalysisPolicy {
  /**
   * bindings permits declared parameter values and field projection over published binding results.
   * explore additionally permits query filters, grouping, aggregation and sorting within the same approved datasets.
   * Neither mode permits arbitrary SQL, new tables/models, source browsing or writes.
   */
  mode: 'bindings' | 'explore'
  /** Nonempty allowlist of datasets in the pinned published resource; keys must be unique. */
  datasets: Array<{
    /** Published AnalyticsBinding.id, matching the provider's dataset key; not a label or output datasetId. */
    key: string
    /** Nonempty, unique AnalyticsField.id allowlist used by projection, filters and aggregation. */
    fields: string[]
    /** Immutable AND predicates on allowed fields, applied before aggregation and disclosure to the Agent. */
    filters: ResourceAnalysisFilter[]
  }>
  /**
   * Allows returning dataset rows without further aggregation. These may already be aggregated by the binding.
   * false requires an aggregate query; bindings mode therefore requires true.
   */
  allowDetails: boolean
  /** Maximum output rows per query (1–100), after filtering/aggregation; not a source-scan or per-turn budget. */
  maxRows: number
}

/**
 * One typed predicate on a declared dataset field. Predicate arrays combine with AND; in matches any listed value.
 * Uses AnalyticsValue wire types: int64/decimal values are exact strings, not floating-point numbers.
 * Null participates in eq/ne/in comparisons; ordered comparisons with null do not match.
 */
export interface ResourceAnalysisFilter {
  /** AnalyticsField.id within the approved field allowlist, never a SQL expression. */
  field: string
  /** Closed comparison vocabulary; additions require matching schema and execution support. */
  operator: 'eq' | 'ne' | 'in' | 'gt' | 'gte' | 'lt' | 'lte'
  /** Exactly one scalar except for in, which accepts a nonempty list; values must match the field's logical type. */
  values: AnalyticsValue[]
}

/**
 * Normalized request for resource_query, scoped externally by the accepted group reference ID.
 * Read ResourceAnalysisDescription first; keys and fields must come from that authorized description.
 * The shared schema supplies empty collections for omitted wire fields. The server then validates the live policy.
 * Extend schema, authorization checks and execution together when adding a query operation.
 */
export interface ResourceAnalysisQuery {
  /** Approved published binding key, matching ResourceAnalysisDataset.key. */
  datasetKey: string
  /** Declared parameter values keyed by AnalyticsParameter.controlId; source identities/payloads cannot be supplied. */
  controls: Record<string, AnalyticsValue>
  /** Detail projection; [] selects all approved fields. Aggregate output instead consists of groupBy and aggregate keys. */
  select: string[]
  /** Additional AND predicates in explore mode; cannot replace or relax the policy's fixed filters. */
  filters: ResourceAnalysisFilter[]
  /** Approved field IDs for grouping; requires at least one aggregate. [] aggregates the whole filtered dataset. */
  groupBy: string[]
  /** Explore-only aggregates; incomplete/truncated input is rejected rather than reported as an exact aggregate. */
  aggregates: Array<{
    /** Omit for count (row count); sum/min/max require an approved numeric field. */
    field?: string
    /** New output field ID, unique among aggregate/grouping keys and distinct from existing dataset field IDs. */
    key: string
    /** Supported aggregate vocabulary; count counts rows, while numeric aggregates ignore null values. */
    operation: 'count' | 'sum' | 'min' | 'max'
  }>
  /** Explore-only sort, evaluated after projection/aggregation and before the output row limit. */
  orderBy: Array<{
    /** Output field ID: a projected field, grouping field or aggregate key. */
    field: string
    /** Ordered entries are applied in sequence, allowing deterministic multi-column sorting. */
    direction: 'asc' | 'desc'
  }>
  /** Omission uses the grant's maxRows; explicit limits must be positive and may not exceed that budget. */
  limit?: number
}

/**
 * Public metadata for one analyzable dataset in a fixed resource version, without rows or native query declarations.
 * Authoring inspection can describe the resource's fields; group inspection exposes only the accepted field scope.
 */
export interface ResourceAnalysisDataset {
  /** Stable key within this published resource, equal to its AnalyticsBinding.id; do not derive it from title. */
  key: string
  /** Display text only; it need not be unique and cannot be used for authorization or query routing. */
  title: string
  /** Typed dataset fields; use their IDs and logical types when constructing queries. */
  fields: AnalyticsField[]
  /** Declared control inputs; group descriptions may omit defaults and allowed-value lists to avoid disclosure. */
  parameters: AnalyticsParameter[]
  /**
   * Authoring-only eligibility hint for the inspecting actor. Missing means unchecked; false may include unavailable support.
   * This is not permission for a recipient to query; issuing and using the grant both revalidate their own authority.
   */
  canShare?: boolean
}

/** resource_describe response for a currently authorized group reference; contains no business rows or credentials. */
export interface ResourceAnalysisDescription {
  /** Accepted reference ID to use for the subsequent query; not the source Artifact or grant ID. */
  referenceId: string
  /** Resource title for display/citation only. */
  title: string
  /** Pinned published version's display sequence, not a mutable latest-version pointer. */
  versionNumber: number
  /** Effective, explicitly accepted scope; clients must not widen it when constructing requests. */
  policy: ResourceAnalysisPolicy
  /** Only approved datasets and fields; absence of another dataset must not trigger source-catalog discovery. */
  datasets: ResourceAnalysisDataset[]
}

/**
 * Authorized query output and provenance for group-visible answers.
 * Consumers must inspect dataset.completeness and freshness before claiming totals or current source state.
 * Evidence identifies an executed result; it is not a reusable authorization or a complete replayable query.
 */
export interface ResourceAnalysisResult {
  /** Result after policy projection, fixed/request filters, permitted analysis and the output row limit. */
  dataset: AnalyticalDataset
  /** Host-produced provenance for citations and traceability, without source credentials or native query payloads. */
  evidence: {
    /** Accepted group reference used for this execution. */
    referenceId: string
    /** Original source Artifact that supplied the fixed resource definition. */
    artifactId: string
    /** Published version actually queried; never substitute the resource's current latest version. */
    versionId: string
    /** Audience authorized to receive this result; not permission to forward it to another group. */
    groupId: string
    /** Approved published binding key that was queried. */
    datasetKey: string
    /** Dataset freshness.executedAt as an ISO 8601 timestamp, not the time the chat answer was rendered. */
    queriedAt: string
    /** Control values supplied in the request; provider defaults may not be expanded into this map. */
    controls: Record<string, AnalyticsValue>
    /** Combined fixed grant restrictions and request predicates, with AND semantics. */
    filters: ResourceAnalysisFilter[]
  }
}
