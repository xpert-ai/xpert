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
    status?: string | null
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
    }
}
