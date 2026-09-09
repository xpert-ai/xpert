import type {
  KnowledgeWikiJobStatus,
  KnowledgeWikiPageListItem,
  KnowledgeWikiPageListParams,
  KnowledgeWikiPageType
} from './knowledge-wiki.model'

export type KnowledgeWikiTaxonomyQuery = Pick<KnowledgeWikiPageListParams, 'search' | 'pageType' | 'pageGroup'>

export type KnowledgeWikiFolder = {
  id: string
  parentId: string | null
  name: string
  description: string
  position: number
  version: number
  pageCount: number
}
export type KnowledgeWikiFolderInput = Pick<KnowledgeWikiFolder, 'name' | 'description' | 'parentId' | 'position'>
export type KnowledgeWikiPlacement = {
  folderId: string | null
  source: 'automatic' | 'manual'
  version: number
}
export type KnowledgeWikiTaxonomy = {
  enabled: boolean
  revision: number
  folders: KnowledgeWikiFolder[]
  unclassifiedCount: number
  total: number
}
export type KnowledgeWikiClassificationOutput = { folderId: string | null; reason: string }
export type KnowledgeWikiPageClassificationInput = {
  mode?: 'page'
  runId: string
  pageId: string
  pageVersionId: string
  taxonomyRevision: number
  placementVersion: number
  applyAutomatically: boolean
  /** Older automatic jobs without a trigger were queued by publication. */
  trigger?: 'publication' | 'backfill'
  result?: KnowledgeWikiClassificationOutput
  outcome?: 'applied' | 'suggested' | 'unclassified' | 'stale'
}
export type KnowledgeWikiTaxonomyOutput = {
  folders: Array<{ name: string; description: string; pageIds: string[] }>
  unclassifiedPageIds: string[]
}
export type KnowledgeWikiPendingPublication = {
  pageId: string
  pageVersionId: string
  runId: string
  billingPrincipalId: string
}
export type KnowledgeWikiTaxonomyClassificationInput = {
  mode: 'taxonomy'
  /** Publications arriving while this taxonomy is being generated. Drained atomically on completion. */
  pendingPublications?: KnowledgeWikiPendingPublication[]
  runId: string
  taxonomyRevision: number
  pages: Array<{ pageId: string; pageVersionId: string; placementVersion: number }>
  appliedTaxonomyRevision?: number
  results?: Array<{
    pageId: string
    result: KnowledgeWikiClassificationOutput
    outcome: 'applied' | 'unclassified' | 'stale'
  }>
}
export type KnowledgeWikiClassificationInput =
  | KnowledgeWikiPageClassificationInput
  | KnowledgeWikiTaxonomyClassificationInput
export type KnowledgeWikiClassificationStatus = { activeJobs: number }
export type KnowledgeWikiClassificationItem = {
  jobId: string
  runId: string
  pageId: string
  title: string
  status: KnowledgeWikiJobStatus
  result?: KnowledgeWikiClassificationOutput
  outcome?: KnowledgeWikiPageClassificationInput['outcome']
  error?: string
  requiresAdditionalChargeConfirmation: boolean
}
export type KnowledgeWikiGraphParams = {
  focusPageId?: string
  depth?: number
  take?: number
  pageType?: KnowledgeWikiPageType
  includeIndex?: boolean
}
export type KnowledgeWikiGraphNode = KnowledgeWikiPageListItem & { sourceCount: number }
export type KnowledgeWikiGraphEdge = {
  id: string
  source: string
  target: string
  label?: string | null
  sectionAnchor?: string | null
}
export type KnowledgeWikiGraph = {
  nodes: KnowledgeWikiGraphNode[]
  edges: KnowledgeWikiGraphEdge[]
  truncated: boolean
}
