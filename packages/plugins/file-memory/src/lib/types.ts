import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { SearchItem } from '@langchain/langgraph-checkpoint'
import {
  LongTermMemoryTypeEnum,
  MemoryAudienceEnum,
  MemoryRecordStatusEnum,
  MemoryScopeTypeEnum,
  TMemoryAudience,
  TMemoryFileEntry,
  TMemoryFileLayer,
  TMemoryGovernanceAction,
  TMemoryQA,
  TMemoryScope,
  TMemorySource,
  TMemoryUserProfile,
  TXpertMemoryFiles,
  TXpertMemoryRecord
} from '@metad/contracts'

export type MemoryScope = TMemoryScope
export type MemoryAudience = TMemoryAudience

export type MemoryRecordStatus = MemoryRecordStatusEnum | `${MemoryRecordStatusEnum}`
export type MemoryRecordKind = LongTermMemoryTypeEnum
export type MemorySource = TMemorySource | string

export type MemoryLayer = {
  scope: MemoryScope
  audience: MemoryAudience
  ownerUserId?: string | null
  layerLabel: string
}

export type MemoryScopeInput = {
  id?: string | null
  workspaceId?: string | null
}

export type MemoryRecordFrontmatter = {
  id: string
  scopeType: MemoryScopeTypeEnum | `${MemoryScopeTypeEnum}`
  scopeId: string
  audience: MemoryAudience
  ownerUserId?: string
  kind: MemoryRecordKind
  status: MemoryRecordStatus
  title: string
  summary?: string
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
  source: MemorySource
  sourceRef?: string
  tags: string[]
}

export type MemoryRecordHeader = MemoryRecordFrontmatter & {
  layerLabel: string
  filePath: string
}

export type MemoryNormalizedValue = TMemoryQA | TMemoryUserProfile

export type MemoryRecord = TXpertMemoryRecord &
  MemoryRecordFrontmatter & {
    filePath: string
    relativePath: string
    body: string
    content: string
    context?: string
    summary?: string
  }

export type MemorySearchResult = MemoryRecord & {
  score: number
}

export type MemoryGovernanceAction = TMemoryGovernanceAction

export type MemoryUpsertInput = {
  scope: MemoryScope
  audience?: MemoryAudience | null
  ownerUserId?: string | null
  kind: MemoryRecordKind
  memoryId?: string | null
  title?: string | null
  content?: string | null
  context?: string | null
  tags?: string[] | null
  value?: MemoryNormalizedValue | null
  source?: MemorySource | null
  sourceRef?: string | null
  status?: MemoryRecordStatus | null
  createdBy: string
  updatedBy?: string | null
}

export type MemoryListOptions = {
  kinds?: MemoryRecordKind[]
  includeArchived?: boolean
  includeFrozen?: boolean
  audience?: MemoryAudience | 'all'
  userId?: string | null
}

export type MemorySearchOptions = MemoryListOptions & {
  text?: string | null
  limit?: number
}

export type MemoryRecallResult = {
  index: string
  headers: MemoryRecordHeader[]
  selected: MemoryRecord[]
  layers: MemoryLayer[]
}

export type MemoryRecallOptions = {
  query: string
  userId: string
  chatModel?: BaseChatModel | null
  limit?: number
}

export type MemoryFreshnessLevel = 'fresh' | 'aging' | 'stale'

export type MemorySurfaceState = {
  alreadySurfaced: string[]
  totalBytes: number
}

export type MemoryEntrypointBudget = {
  maxLines: number
  maxBytes: number
  truncated: boolean
  lineCount: number
  byteLength: number
}

export type MemoryRecallBudget = {
  maxSelectedTotal: number
  maxSelectedUser: number
  maxSelectedShared: number
  maxFilesPerLayer: number
  maxHeaderLines: number
  maxMemoryLinesPerFile: number
  maxMemoryBytesPerFile: number
  maxRecallBytesPerTurn: number
  maxRecallBytesPerSession: number
}

export type MemoryRuntimeEntrypoint = {
  layer: MemoryLayer
  content: string
  budget: MemoryEntrypointBudget
}

export type MemoryRuntimeDetail = {
  record: MemoryRecord
  content: string
  freshnessLevel: MemoryFreshnessLevel
  freshnessNote?: string | null
  byteLength: number
  skipped?: string | null
}

export type MemoryRuntimeRecallResult = {
  layers: MemoryLayer[]
  index: string
  headers: MemoryRecordHeader[]
  selected: MemoryRecord[]
  entrypoints: MemoryRuntimeEntrypoint[]
  details: MemoryRuntimeDetail[]
  surfaceState: MemorySurfaceState
  budget: MemoryRecallBudget
}

export type MemoryRuntimeRecallOptions = MemoryRecallOptions & {
  recentTools?: readonly string[]
  alreadySurfaced?: ReadonlySet<string>
  surfacedBytes?: number
}

export type MemoryFileEntry = TMemoryFileEntry
export type MemoryFileLayer = TMemoryFileLayer
export type XpertMemoryFiles = TXpertMemoryFiles

export type MemoryFileUpdateInput = {
  scope: MemoryScope
  userId: string
  audience: MemoryAudience
  ownerUserId?: string | null
  path: string
  content: string
  updatedBy: string
}

export interface MemoryLayerResolver {
  resolveScope(xpert: MemoryScopeInput): MemoryScope
  resolveVisibleLayers(scope: MemoryScope, userId: string, audience?: MemoryAudience | 'all'): MemoryLayer[]
  resolveLayerDirectory(tenantId: string, layer: MemoryLayer): string
}

export interface MemoryFileRepository {
  listFiles(tenantId: string, layer: MemoryLayer, kinds?: MemoryRecordKind[]): Promise<string[]>
  readFile(filePath: string): Promise<string>
  writeFile(filePath: string, content: string): Promise<void>
}

export interface MemoryRecallPlanner {
  selectRecallHeaders(
    query: string,
    headers: MemoryRecordHeader[],
    chatModel?: BaseChatModel | null,
    options?: {
      limit?: number
      recentTools?: readonly string[]
      alreadySurfaced?: ReadonlySet<string>
    }
  ): Promise<MemoryRecordHeader[]>
}

export interface MemoryWritePolicy {
  resolveAudience(input: {
    kind: MemoryRecordKind
    title?: string | null
    content?: string | null
    context?: string | null
    tags?: string[] | null
    explicitAudience?: MemoryAudience | null
  }): MemoryAudience
}

export const MEMORY_AUDIENCE_PRIORITY: Record<MemoryAudience, number> = {
  [MemoryAudienceEnum.USER]: 2,
  [MemoryAudienceEnum.SHARED]: 1
}

export type MemoryProvider = {
  resolveScope(xpert: MemoryScopeInput): MemoryScope
  resolveVisibleLayers(scope: MemoryScope, userId: string, audience?: MemoryAudience | 'all'): MemoryLayer[]
  resolveScopeDirectory(tenantId: string, scope: MemoryScope): string
  resolveLayerDirectory(tenantId: string, layer: MemoryLayer): string
  readIndex(
    tenantId: string,
    scope: MemoryScope,
    options?: {
      userId?: string | null
      audience?: MemoryAudience | 'all'
    }
  ): Promise<string>
  scanHeaders(tenantId: string, scope: MemoryScope, options?: MemoryListOptions): Promise<MemoryRecordHeader[]>
  list(tenantId: string, scope: MemoryScope, options?: MemoryListOptions): Promise<MemoryRecord[]>
  get(
    tenantId: string,
    scope: MemoryScope,
    memoryId: string,
    options?: {
      userId?: string | null
      audience?: MemoryAudience | 'all'
      ownerUserId?: string | null
    }
  ): Promise<MemoryRecord | null>
  search(tenantId: string, scope: MemoryScope, options?: MemorySearchOptions): Promise<MemorySearchResult[]>
  buildRecall(tenantId: string, scope: MemoryScope, options: MemoryRecallOptions): Promise<MemoryRecallResult>
  buildRuntimeRecall(
    tenantId: string,
    scope: MemoryScope,
    options: MemoryRuntimeRecallOptions
  ): Promise<MemoryRuntimeRecallResult>
  upsert(tenantId: string, input: MemoryUpsertInput): Promise<MemoryRecord>
  bulkUpsert(tenantId: string, items: MemoryUpsertInput[]): Promise<MemoryRecord[]>
  applyGovernance(
    tenantId: string,
    scope: MemoryScope,
    memoryId: string,
    action: MemoryGovernanceAction,
    updatedBy: string,
    options?: {
      userId?: string | null
      audience?: MemoryAudience | 'all'
      ownerUserId?: string | null
    }
  ): Promise<MemoryRecord | null>
  archiveAll(
    tenantId: string,
    scope: MemoryScope,
    updatedBy: string,
    options?: {
      userId?: string | null
      audience?: MemoryAudience | 'all'
    }
  ): Promise<MemoryRecord[]>
  listFiles(tenantId: string, scope: MemoryScope, userId: string): Promise<XpertMemoryFiles>
  updateFileContent(tenantId: string, input: MemoryFileUpdateInput): Promise<MemoryFileEntry>
  toSearchItem(record: MemoryRecord | MemorySearchResult): SearchItem
  toApiRecord(record: MemoryRecord | MemorySearchResult): MemoryRecord | MemorySearchResult
}
