export const KNOWLEDGE_FILTER_VERSION = 2 as const
export const KNOWLEDGE_FILTER_MAX_DEPTH = 3
export const KNOWLEDGE_FILTER_MAX_CONDITIONS = 20
export const KNOWLEDGE_FILTER_MAX_SET_VALUES = 100
export const KNOWLEDGE_FILTER_MAX_STRING_LENGTH = 512

export type KnowledgeFilterOperator =
  | 'eq'
  | 'neq'
  | 'in'
  | 'notIn'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'under'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'exists'
  | 'containsAny'
  | 'containsAll'
  | 'isEmpty'
  | 'jsonContains'

type KnowledgeFilterJSONPrimitive = null | string | number | boolean
type KnowledgeFilterJSONObjectLevel1 = Record<string, KnowledgeFilterJSONPrimitive | KnowledgeFilterJSONPrimitive[]>

/** A finite JSON shape keeps ORM DeepPartial types bounded while covering filter literals and JSON containment. */
export type KnowledgeFilterJSONValue =
  | KnowledgeFilterJSONPrimitive
  | KnowledgeFilterJSONPrimitive[]
  | KnowledgeFilterJSONObjectLevel1
  | KnowledgeFilterJSONObjectLevel1[]
  | Record<
      string,
      | KnowledgeFilterJSONPrimitive
      | KnowledgeFilterJSONPrimitive[]
      | KnowledgeFilterJSONObjectLevel1
      | KnowledgeFilterJSONObjectLevel1[]
    >

export type KnowledgeFilterLiteralValue = {
  kind: 'literal'
  value: KnowledgeFilterJSONValue
}

export type KnowledgeFilterVariableValue = {
  kind: 'variable'
  selector: string
}

export type KnowledgeFilterValue = KnowledgeFilterLiteralValue | KnowledgeFilterVariableValue

export type KnowledgeFilterCondition = {
  kind: 'condition'
  field: string
  operator: KnowledgeFilterOperator
  value?: KnowledgeFilterValue
}

export type KnowledgeFilterGroupLevel1 = {
  kind: 'group'
  operator: 'and' | 'or'
  children: KnowledgeFilterCondition[]
}

export type KnowledgeFilterGroupLevel2 = {
  kind: 'group'
  operator: 'and' | 'or'
  children: Array<KnowledgeFilterCondition | KnowledgeFilterGroupLevel1>
}

export type KnowledgeFilterGroupLevel3 = {
  kind: 'group'
  operator: 'and' | 'or'
  children: Array<KnowledgeFilterCondition | KnowledgeFilterGroupLevel1 | KnowledgeFilterGroupLevel2>
}

/** The fourth level is reserved for the server-owned root that merges validated sources. */
export type KnowledgeFilterGroupLevel4 = {
  kind: 'group'
  operator: 'and' | 'or'
  children: Array<
    KnowledgeFilterCondition | KnowledgeFilterGroupLevel1 | KnowledgeFilterGroupLevel2 | KnowledgeFilterGroupLevel3
  >
}

export type KnowledgeFilterGroup =
  | KnowledgeFilterGroupLevel1
  | KnowledgeFilterGroupLevel2
  | KnowledgeFilterGroupLevel3
  | KnowledgeFilterGroupLevel4

export type KnowledgeFilterNode = KnowledgeFilterCondition | KnowledgeFilterGroup

export type KnowledgeFilterSources = {
  fixed?: KnowledgeFilterNode
  request?: KnowledgeFilterNode
  dynamic?: KnowledgeFilterNode
}

export type KnowledgeFilterStatus = 'not_applied' | 'applied' | 'dynamic_fallback' | 'failed'
export type KnowledgeFilterErrorCode =
  | 'invalid_filter'
  | 'unknown_field'
  | 'invalid_operator'
  | 'invalid_value'
  | 'missing_fixed_variable'
  | 'filter_too_complex'
  | 'graph_search_failed'
  | 'keyword_index_missing'
  | 'keyword_query_failed'
  | 'unsupported_backend'
  | 'unsupported_retrieval_mode'

export type KnowledgeFilterDiagnostics = {
  filterVersion: typeof KNOWLEDGE_FILTER_VERSION
  fixedFilter?: KnowledgeFilterNode
  requestFilter?: KnowledgeFilterNode
  dynamicFilter?: KnowledgeFilterNode
  effectiveFilter?: KnowledgeFilterNode
  filterHash?: string
  filterStatus: KnowledgeFilterStatus
  fallbackReason?: 'invalid_dynamic_filter'
  errorCode?: KnowledgeFilterErrorCode
  candidateDocumentCount?: number
  candidateChunkCount?: number
  hitCount: number
  vectorBackend?: string
  filterLatency?: number
  vectorLatency?: number
  vectorBranchHitCount?: number
  keywordLatency?: number
  keywordCandidateCount?: number
  keywordBranchHitCount?: number
  keywordIndexStatus?: 'ready' | 'missing'
  keywordFailureReason?: string
  graphBranchHitCount?: number
  fusionMode?: 'legacy' | 'weighted_rrf'
  graphGlobalCandidateCount?: number
  graphCandidateScanLimit?: number
  graphCandidateScanRounds?: number
  graphCandidateTruncated?: boolean
  eligibleSeedEntityCount?: number
  eligibleRelationCount?: number
  eligibleMentionCount?: number
  graphCandidateChunkCount?: number
  graphSeedLatency?: number
  graphFilterLatency?: number
  graphExpansionLatency?: number
  graphChunkLatency?: number
  hybridGraphFallbackReason?: string
  retryableWithoutDynamic?: boolean
  errors?: string[]
}

export const KNOWLEDGE_SYSTEM_FILTER_FIELDS = [
  'document.fileName',
  'document.folderPath',
  'document.fileExtension',
  'document.mimeType',
  'document.category',
  'document.sourceType',
  'document.createdAt',
  'document.updatedAt'
] as const

export type KnowledgeSystemFilterField = (typeof KNOWLEDGE_SYSTEM_FILTER_FIELDS)[number]
