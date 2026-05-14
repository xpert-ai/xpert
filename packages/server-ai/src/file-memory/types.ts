export const FILE_MEMORY_TYPES = ['user', 'feedback', 'project', 'reference'] as const

export type FileMemoryType = (typeof FILE_MEMORY_TYPES)[number]

export const FILE_MEMORY_STATUSES = ['active', 'archived', 'conflict'] as const

export type FileMemoryStatus = (typeof FILE_MEMORY_STATUSES)[number]

export const FILE_MEMORY_WORKSPACE_PATH = '.xpert/memory'

export const FILE_MEMORY_INDEX_FILENAME = 'MEMORY.md'

export const FILE_MEMORY_DREAM_DIR = '.dream'

export type FileMemoryUsage = {
    recallCount: number
    detailReadCount: number
    explicitWriteCount: number
    writebackCandidateCount: number
    correctionCount: number
    lastRecalledAt?: string
    lastDetailReadAt?: string
    uniqueConversationCount: number
    uniqueQueryCount: number
    usefulnessScore: number
}

export type FileMemoryHeader = {
    memoryId: string
    canonicalRef: string
    relativePath: string
    type: FileMemoryType
    status: FileMemoryStatus
    title: string
    summary: string
    tags?: string[]
    updatedAt?: string
    createdAt?: string
    mtimeMs: number
    usefulnessScore: number
}

export type FileMemoryFrontmatter = {
    id: string
    scopeType: 'xpert'
    scopeId: string
    type: FileMemoryType
    status: FileMemoryStatus
    title: string
    summary: string
    confidence?: number
    usage: FileMemoryUsage
    createdAt?: string
    updatedAt?: string
    createdBy?: string
    updatedBy?: string
    source?: 'explicit' | 'writeback' | 'dream' | 'imported' | 'manual'
    sourceRefs?: string[]
    tags?: string[]
}

export type FileMemoryDocument = {
    frontmatter: FileMemoryFrontmatter
    body: string
}

export type FileMemorySignalType =
    | 'recall_hit'
    | 'detail_read'
    | 'explicit_write'
    | 'writeback_candidate'
    | 'user_correction'
    | 'index_issue'

export type FileMemorySignal = {
    id: string
    type: FileMemorySignalType
    xpertId: string
    memoryId?: string
    relativePath?: string
    conversationId?: string
    queryHash?: string
    sourceRef?: string
    createdAt: string
    weight?: number
    metadata?: Record<string, unknown>
}

export type FileMemoryScorecardTopic = {
    memoryId: string
    relativePath: string
    type: FileMemoryType
    status: FileMemoryStatus
    title: string
    summary: string
    usefulnessScore: number
    signalCounts: Partial<Record<FileMemorySignalType, number>>
    lastSignalAt?: string
}

export type FileMemoryScorecardCandidate = {
    key: string
    score: number
    classification: 'evidence' | 'observe' | 'report' | 'discard'
    signalCount: number
    uniqueConversationCount: number
    uniqueQueryCount: number
    lastSignalAt?: string
    sourceRef?: string
    conversationId?: string
}

export type FileMemoryScorecardIndex = {
    xpertId: string
    updatedAt: string
    topics: FileMemoryScorecardTopic[]
    candidates: FileMemoryScorecardCandidate[]
}

export type FileMemoryIndexIssueType =
    | 'missing-target'
    | 'invalid-target'
    | 'overlong-entry'
    | 'body-like-entry'
    | 'duplicate-target'
    | 'archived-target'

export type FileMemoryIndexIssue = {
    type: FileMemoryIndexIssueType
    message: string
    line: number
    target?: string
}

export type FileMemoryIndexValidationResult = {
    ok: boolean
    issues: FileMemoryIndexIssue[]
}

export type FileMemoryDreamReason = 'manual' | 'scheduled' | 'signal_threshold'

export type FileMemoryDreamRunStatus = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled' | 'skipped'

export type FileMemoryDreamRequest = {
    reason?: FileMemoryDreamReason
}

export type FileMemoryDreamConfig = {
    dreamerXpertId?: string
    dreamerAgentKey?: string
    gate?: Partial<FileMemoryDreamGateConfig>
}

export type FileMemoryDreamGateConfig = {
    enabled: boolean
    minIntervalMinutes: number
    minNewOrUpdatedMemories: number
    minConversationCount: number
}

export type FileMemoryDreamRunSummary = {
    runId: string
    xpertId: string
    tenantId: string
    status: FileMemoryDreamRunStatus
    reason: FileMemoryDreamReason
    requestedAt: string
    startedAt?: string
    finishedAt?: string
    coalesced?: boolean
    error?: string
    changedFileCount?: number
    unresolvedConflictCount?: number
    gate?: FileMemoryDreamGateResult
}

export type FileMemoryDreamChangedFile = {
    path: string
    changeType: 'created' | 'updated' | 'archived'
    reason: string
}

export type FileMemoryDreamRunReport = {
    runId: string
    xpertId: string
    status: FileMemoryDreamRunStatus
    changedFiles: FileMemoryDreamChangedFile[]
    unresolvedConflicts: Array<{
        path?: string
        reason: string
    }>
    dreamDiary: string
}

export type FileMemoryDreamGateResult = {
    passed: boolean
    lastRunId?: string
    lastFinishedAt?: string
    checkedSince?: string
    newOrUpdatedMemoryCount: number
    conversationCount: number
    elapsedMinutes?: number
    config: FileMemoryDreamGateConfig
    reasons: string[]
}

export type FileMemoryDreamRunArtifact = {
    label: string
    path: string
    kind: 'json' | 'markdown' | 'jsonl' | 'directory'
    exists: boolean
}

export type FileMemoryDreamRunDetail = {
    summary: FileMemoryDreamRunSummary
    preflight?: string
    report?: FileMemoryDreamRunReport
    validation?: {
        ok: boolean
        status: 'succeeded' | 'partial' | 'skipped'
        issues: Array<{
            type: string
            message: string
            path?: string
            line?: number
        }>
    }
    artifacts: FileMemoryDreamRunArtifact[]
}
