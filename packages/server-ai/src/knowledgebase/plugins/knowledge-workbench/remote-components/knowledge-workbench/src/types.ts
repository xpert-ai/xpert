import type { KnowledgeWorkbenchDocumentStatus } from '../../../knowledge-workbench.service'

// Type-only bridge to the server enum; template literal converts string enum values into JSON payload literals.
export type DocumentStatus = `${KnowledgeWorkbenchDocumentStatus}`

export type KnowledgebaseRow = {
    id: string
    name?: string
    description?: string
    avatar?: unknown
    documentNum?: number
    tokenNum?: number
    chunkNum?: number
    graphEnabled?: boolean
    graphStatus?: string | null
    graphRevision?: number | null
    graphIndexError?: string | null
}

export type DocumentRow = {
    id: string
    knowledgebaseId?: string
    name?: string
    sourceType?: string | null
    type?: string | null
    category?: string | null
    filePath?: string | null
    fileUrl?: string | null
    mimeType?: string | null
    size?: string | number | null
    folder?: string | null
    status?: DocumentStatus | null
    progress?: number | null
    processMsg?: string | null
    tokenNum?: number | null
    chunkNum?: number | null
    disabled?: boolean | null
    updatedAt?: string | null
    createdAt?: string | null
    metadata?: unknown
    isFolder: boolean
}

export type ChunkPreview = {
    id?: string
    chunkId?: string
    documentId?: string
    pageContent?: string
    chunkIndex?: number
    page?: number | string | null
    parentId?: string | null
    metadata?: unknown
}

export type DocumentPreview = {
    document: DocumentRow
    chunks: ChunkPreview[]
    totalChunks: number
    transformedPreview?: ChunkPreview[]
    originalFile?: {
        name?: string
        url?: string
        mimeType?: string | null
        size?: string | number | null
    }
}

export type GraphNode = {
    id: string
    name: string
    type: string
    origin?: string
    visibility?: string
    mentionCount?: number | null
    confidence?: number | null
    symbolSize?: number
    value?: number
}

export type GraphEdge = {
    id: string
    source: string
    target: string
    type: string
    origin?: string
    visibility?: string
    weight?: number | null
    evidenceCount?: number | null
}

export type GraphNodeDetailEntity = GraphNode & {
    aliases?: string[] | null
    description?: string | null
    summary?: string | null
    revision?: number | null
    metadata?: unknown
}

export type GraphRelationDetail = GraphEdge & {
    description?: string | null
    confidence?: number | null
    sourceName?: string
    sourceType?: string
    targetName?: string
    targetType?: string
}

export type GraphEvidenceMention = {
    id?: string
    entityId?: string
    relationId?: string | null
    documentId?: string
    chunkId?: string
    quote?: string | null
    confidence?: number | null
}

export type GraphEvidenceChunk = {
    index: number
    chunkId?: string
    documentId?: string
    knowledgebaseId?: string
    documentName?: string
    fileUrl?: string
    mimeType?: string
    score?: number
    relevanceScore?: number
    page?: number | string | null
    snippet: string
    pageContent: string
    chunkIndex?: number
    metadata?: unknown
    citationLabel?: string
    citationUrl?: string
    citationMarkdown?: string
    evidence: GraphEvidenceMention[]
}

export type GraphNodeDetail = {
    entity: GraphNodeDetailEntity
    relations: GraphRelationDetail[]
    connectedEntities: GraphNodeDetailEntity[]
    chunks: GraphEvidenceChunk[]
    evidenceByChunkId: Record<string, GraphEvidenceMention[]>
    totals: {
        chunks: number
        mentions: number
        entityIds: number
        relations: number
    }
    truncated?: {
        chunks?: boolean
        mentions?: boolean
    }
}

export type GraphSummary = {
    enabled: boolean
    status?: string | null
    revision?: number | null
    error?: string | null
    entityCount?: number
    relationCount?: number
    mentionCount?: number
    queuedJobCount?: number
    runningJobCount?: number
    failedJobCount?: number
    nodes?: GraphNode[]
    edges?: GraphEdge[]
    entityTypes?: string[]
    relationTypes?: string[]
    totalNodes?: number
    totalEdges?: number
    unavailable?: boolean
}

export type ViewData = {
    items?: DocumentRow[]
    total?: number
    summary?: {
        knowledgebases?: KnowledgebaseRow[]
        activeKnowledgebaseId?: string
        breadcrumb?: Array<{ id: string; name?: string }>
        selectedDocument?: DocumentPreview
        graph?: GraphSummary
        graphNodeDetail?: GraphNodeDetail
    }
}
