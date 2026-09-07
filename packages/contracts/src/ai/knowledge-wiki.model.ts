import type { IDocChunkMetadata } from './knowledge-doc-chunk.model'

export const KNOWLEDGE_WIKI_SCHEMA_VERSION = 1

export type KnowledgeWikiExtractionGranularity = 'focused' | 'standard' | 'exhaustive'

export type KnowledgebaseWikiConfig = {
  enabled: boolean
  extractionGranularity: KnowledgeWikiExtractionGranularity
  contentGenerationRequirements?: string
  extractionFocus?: string
}

export type ResolvedKnowledgebaseWikiConfig = KnowledgebaseWikiConfig & {
  contentGenerationRequirements: string
  extractionFocus: string
}

export const KNOWLEDGE_WIKI_MAX_CUSTOM_INSTRUCTION_LENGTH = 4000

export const DEFAULT_KNOWLEDGEBASE_WIKI_CONFIG = {
  enabled: false,
  extractionGranularity: 'standard',
  contentGenerationRequirements: '',
  extractionFocus: ''
} as const satisfies ResolvedKnowledgebaseWikiConfig

export function normalizeKnowledgebaseWikiConfig(
  config?: Partial<KnowledgebaseWikiConfig> | null
): ResolvedKnowledgebaseWikiConfig {
  return {
    enabled: config?.enabled ?? DEFAULT_KNOWLEDGEBASE_WIKI_CONFIG.enabled,
    extractionGranularity: config?.extractionGranularity ?? DEFAULT_KNOWLEDGEBASE_WIKI_CONFIG.extractionGranularity,
    contentGenerationRequirements:
      config?.contentGenerationRequirements ?? DEFAULT_KNOWLEDGEBASE_WIKI_CONFIG.contentGenerationRequirements,
    extractionFocus: config?.extractionFocus ?? DEFAULT_KNOWLEDGEBASE_WIKI_CONFIG.extractionFocus
  }
}

export type KnowledgeWikiStatus = 'disabled' | 'indexing' | 'ready' | 'failed' | 'rebuild_required'

export type KnowledgeWikiAvailability = 'unavailable' | 'ready' | 'degraded'

export type KnowledgeWikiPageType = 'summary' | 'entity' | 'concept' | 'index'

export type KnowledgeWikiMappedPageType = Exclude<KnowledgeWikiPageType, 'index'>

export type KnowledgeWikiPageStatus = 'building' | 'ready' | 'stale' | 'failed' | 'archived'

export type KnowledgeWikiProjectionStatus = 'pending' | 'ready' | 'failed' | 'disabled'

export type KnowledgeWikiJobType = 'source_map' | 'page_reduce' | 'retract' | 'rebuild' | 'finalize'

export type KnowledgeWikiJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'stale' | 'cancelled'

export type KnowledgeWikiInvocationStatus =
  | 'prepared'
  | 'running'
  | 'reconciling'
  | 'succeeded'
  | 'failed'
  | 'indeterminate'

export type KnowledgeWikiRecoveryAction = {
  jobId: string
  invocationId: string
  reconciliationStatus: 'not_available' | 'pending' | 'recovered' | 'not_executed' | 'indeterminate'
  canRetry: boolean
  requiresAdditionalChargeConfirmation: boolean
  inputCurrent: boolean
  recommendedAction: 'wait' | 'retry_job' | 'full_rebuild'
}

export type KnowledgeWikiReaderStatus = {
  canManage: false
  enabled: boolean
  status: KnowledgeWikiStatus
  availability: KnowledgeWikiAvailability
  readyPageCount: number
  requiresManagement: boolean
  errorCode?: string | null
}

export type KnowledgeWikiJobCounts = {
  queued: number
  running: number
  failed: number
}

export type KnowledgeWikiPageCounts = {
  ready: number
  stale: number
  failed: number
  archived: number
  projectionFailed: number
}

export type KnowledgeWikiManagementStatus = Omit<KnowledgeWikiReaderStatus, 'canManage'> & {
  canManage: true
  activeRevision?: number | null
  stagedRevision?: number | null
  activeConfigFingerprint?: string | null
  targetConfigFingerprint?: string | null
  rebuildRequiredReason?: 'generator_upgrade' | null
  generationJobs: KnowledgeWikiJobCounts
  pages: KnowledgeWikiPageCounts
  indeterminateInvocationCount: number
  billingRecoveryCount: number
  cleanupPendingCount: number
  cleanupFailedCount: number
  recoveryActions: KnowledgeWikiRecoveryAction[]
}

export type KnowledgeWikiStatusResponse = KnowledgeWikiReaderStatus | KnowledgeWikiManagementStatus

export const KNOWLEDGE_WIKI_DOCUMENT_STATUS_BATCH_SIZE = 100

export type KnowledgeWikiDocumentStatusResponse = {
  /** Sources of currently published, usable Wiki pages, not merely completed parsing jobs. */
  indexedDocumentIds: string[]
  documents?: KnowledgeWikiDocumentProgress[]
}

export type KnowledgeWikiDocumentProgressState =
  | 'not_started'
  | 'queued'
  | 'generating'
  | 'indexing'
  | 'publishing'
  | 'ready'
  | 'failed'
  | 'outdated'
  | 'no_content'

export type KnowledgeWikiDocumentStageState = 'pending' | 'running' | 'complete' | 'failed' | 'skipped'

export type KnowledgeWikiDocumentProgress = {
  documentId: string
  state: KnowledgeWikiDocumentProgressState
  stages: {
    generation: KnowledgeWikiDocumentStageState
    indexing: KnowledgeWikiDocumentStageState
    publication: KnowledgeWikiDocumentStageState
  }
  /** A full rebuild publishes as a batch; another source can block publication. */
  waitingForBatch?: boolean
  error?: string
  errorCode?: string
  retry?: { jobId: string; requiresAdditionalChargeConfirmation: boolean }
  canView: boolean
}

export type KnowledgeWikiPageContributionPayload = {
  schemaVersion: typeof KNOWLEDGE_WIKI_SCHEMA_VERSION
  pageType: KnowledgeWikiMappedPageType
  canonicalName: string
  aliases: string[]
  summary: string
  facts: Array<{
    text: string
    sourceChunkIds: string[]
  }>
  suggestedLinks: Array<{
    targetType: KnowledgeWikiPageType
    targetCanonicalName: string
    label?: string
  }>
}

export const KNOWLEDGE_WIKI_MAX_ALIASES = 20
export const KNOWLEDGE_WIKI_MAX_FACTS = 100
export const KNOWLEDGE_WIKI_MAX_SUGGESTED_LINKS = 50
export const KNOWLEDGE_WIKI_MAX_SOURCE_CHUNKS_PER_FACT = 50
export const KNOWLEDGE_WIKI_MAX_CANONICAL_NAME_LENGTH = 512
export const KNOWLEDGE_WIKI_MAX_SUMMARY_LENGTH = 8000
export const KNOWLEDGE_WIKI_MAX_FACT_LENGTH = 4000

function isBoundedString(value: unknown, maxLength: number, allowEmpty = false): value is string {
  return typeof value === 'string' && value.length <= maxLength && (allowEmpty || value.trim().length > 0)
}

function isBoundedStringArray(value: unknown, maxItems: number, maxItemLength: number): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every((item) => isBoundedString(item, maxItemLength))
}

function isKnowledgeWikiFact(value: unknown): value is KnowledgeWikiPageContributionPayload['facts'][number] {
  return (
    !!value &&
    typeof value === 'object' &&
    'text' in value &&
    isBoundedString(value.text, KNOWLEDGE_WIKI_MAX_FACT_LENGTH) &&
    'sourceChunkIds' in value &&
    isBoundedStringArray(
      value.sourceChunkIds,
      KNOWLEDGE_WIKI_MAX_SOURCE_CHUNKS_PER_FACT,
      KNOWLEDGE_WIKI_MAX_CANONICAL_NAME_LENGTH
    ) &&
    value.sourceChunkIds.length > 0
  )
}

function isKnowledgeWikiSuggestedLink(
  value: unknown
): value is KnowledgeWikiPageContributionPayload['suggestedLinks'][number] {
  return (
    !!value &&
    typeof value === 'object' &&
    'targetType' in value &&
    isWikiPageType(value.targetType) &&
    'targetCanonicalName' in value &&
    isBoundedString(value.targetCanonicalName, KNOWLEDGE_WIKI_MAX_CANONICAL_NAME_LENGTH) &&
    (!('label' in value) ||
      value.label === undefined ||
      isBoundedString(value.label, KNOWLEDGE_WIKI_MAX_CANONICAL_NAME_LENGTH))
  )
}

export function isKnowledgeWikiPageContributionPayload(value: unknown): value is KnowledgeWikiPageContributionPayload {
  return (
    !!value &&
    typeof value === 'object' &&
    'schemaVersion' in value &&
    value.schemaVersion === KNOWLEDGE_WIKI_SCHEMA_VERSION &&
    'pageType' in value &&
    (value.pageType === 'summary' || value.pageType === 'entity' || value.pageType === 'concept') &&
    'canonicalName' in value &&
    isBoundedString(value.canonicalName, KNOWLEDGE_WIKI_MAX_CANONICAL_NAME_LENGTH) &&
    'aliases' in value &&
    isBoundedStringArray(value.aliases, KNOWLEDGE_WIKI_MAX_ALIASES, KNOWLEDGE_WIKI_MAX_CANONICAL_NAME_LENGTH) &&
    'summary' in value &&
    isBoundedString(value.summary, KNOWLEDGE_WIKI_MAX_SUMMARY_LENGTH) &&
    'facts' in value &&
    Array.isArray(value.facts) &&
    value.facts.length <= KNOWLEDGE_WIKI_MAX_FACTS &&
    value.facts.every(isKnowledgeWikiFact) &&
    'suggestedLinks' in value &&
    Array.isArray(value.suggestedLinks) &&
    value.suggestedLinks.length <= KNOWLEDGE_WIKI_MAX_SUGGESTED_LINKS &&
    value.suggestedLinks.every(isKnowledgeWikiSuggestedLink)
  )
}

export type KnowledgeWikiPageListParams = {
  search?: string
  pageType?: KnowledgeWikiPageType
  status?: KnowledgeWikiPageStatus
  skip?: number
  take?: number
}

export type KnowledgeWikiPageListItem = {
  id: string
  pageKey: string
  pageType: KnowledgeWikiPageType
  canonicalName: string
  title: string
  slug: string
  summary: string
  aliases: string[]
  status: KnowledgeWikiPageStatus
  projectionStatus: KnowledgeWikiProjectionStatus
  updatedAt?: Date
}

export type KnowledgeWikiPageListResult = {
  items: KnowledgeWikiPageListItem[]
  total: number
}

export type KnowledgeWikiPageEvidence = {
  id: string
  sourceDocumentId: string
  sourceChunkId: string
  quote: string
  ordinal: number
  sectionAnchor?: string | null
  sourceAvailable: boolean
}

export type KnowledgeWikiPageLink = {
  pageId: string
  pageType: KnowledgeWikiPageType
  title: string
  slug: string
  sectionAnchor?: string | null
  label?: string | null
}

export type KnowledgeWikiPageDetail = KnowledgeWikiPageListItem & {
  markdown: string
  revision: number
  links: KnowledgeWikiPageLink[]
  backlinks: KnowledgeWikiPageLink[]
  evidence: KnowledgeWikiPageEvidence[]
}

export interface IKnowledgeWikiChunkMetadata extends IDocChunkMetadata {
  contentKind: 'wiki'
  wikiPageId: string
  wikiPageVersionId: string
  wikiPageKey: string
  wikiPageType: KnowledgeWikiPageType
  wikiRevision: number
  sectionAnchor: string
  projectionStatus: KnowledgeWikiProjectionStatus
}

function isWikiPageType(value: unknown): value is KnowledgeWikiPageType {
  return value === 'summary' || value === 'entity' || value === 'concept' || value === 'index'
}

function isWikiProjectionStatus(value: unknown): value is KnowledgeWikiProjectionStatus {
  return value === 'pending' || value === 'ready' || value === 'failed' || value === 'disabled'
}

export function isKnowledgeWikiChunkMetadata(value: unknown): value is IKnowledgeWikiChunkMetadata {
  return (
    !!value &&
    typeof value === 'object' &&
    'chunkId' in value &&
    typeof value.chunkId === 'string' &&
    'contentKind' in value &&
    value.contentKind === 'wiki' &&
    'wikiPageId' in value &&
    typeof value.wikiPageId === 'string' &&
    'wikiPageVersionId' in value &&
    typeof value.wikiPageVersionId === 'string' &&
    'wikiPageKey' in value &&
    typeof value.wikiPageKey === 'string' &&
    'wikiPageType' in value &&
    isWikiPageType(value.wikiPageType) &&
    'wikiRevision' in value &&
    typeof value.wikiRevision === 'number' &&
    Number.isInteger(value.wikiRevision) &&
    value.wikiRevision >= 0 &&
    'sectionAnchor' in value &&
    typeof value.sectionAnchor === 'string' &&
    'projectionStatus' in value &&
    isWikiProjectionStatus(value.projectionStatus)
  )
}

export const KNOWLEDGE_WIKI_DEFAULT_PAGE_SIZE = 50
export const KNOWLEDGE_WIKI_MAX_PAGE_SIZE = 100
export const KNOWLEDGE_WIKI_MAX_SEARCH_LENGTH = 200

export const KNOWLEDGE_WIKI_FAILED_CONTENT_RETENTION_DAYS = 7
export const KNOWLEDGE_WIKI_OPERATION_RETENTION_DAYS = 30
export const KNOWLEDGE_WIKI_DELETION_RECEIPT_RETENTION_DAYS = 90
export const KNOWLEDGE_WIKI_STALE_VECTOR_CLEANUP_SLO_HOURS = 24
