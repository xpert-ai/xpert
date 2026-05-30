export type FileAssetPurpose = 'chat_attachment' | 'workspace' | 'knowledge'

export type FileParseMode = 'auto' | 'fast' | 'deep' | 'none'

export type FileAssetStatus = 'uploaded' | 'scanning' | 'parsing' | 'ready' | 'partial' | 'failed'

export type FileCapability =
    | 'preview'
    | 'search'
    | 'read'
    | 'table_query'
    | 'vision'
    | 'ocr'
    | 'workspace'
    | 'page_images'

// Anchored artifacts/chunks let agent answers cite durable document positions
// instead of brittle character offsets.
export type FileArtifactKind =
    | 'summary'
    | 'text'
    | 'page_text'
    | 'page_image'
    | 'table'
    | 'sheet'
    | 'slide'
    | 'image_metadata'
    | 'ocr_text'
    | 'code_tree'
    | 'file_manifest'

export type FileAnchor = {
    page?: number
    sheet?: string
    slide?: number
    path?: string
    rowStart?: number
    rowEnd?: number
    chunk?: number
    label?: string
}

export type ParsedFileArtifact = {
    kind: FileArtifactKind
    content?: string
    mimeType?: string
    metadata?: Record<string, unknown>
    anchor?: FileAnchor
}

export type ParsedFileResult = {
    artifacts: ParsedFileArtifact[]
    capabilities: FileCapability[]
    summary?: string
    metadata?: Record<string, unknown>
    status?: Extract<FileAssetStatus, 'ready' | 'partial'>
}

export type FileParseDerivedOutput = {
    directory: string
    parseRunId: string
    storageProvider?: string
}

export type FileParseSource = {
    filePath: string
    originalName?: string
    mimeType?: string
    size?: number
    derivedOutput?: FileParseDerivedOutput
}

export type FileUploadUnderstandingOptions = {
    purpose?: FileAssetPurpose
    parseMode?: FileParseMode
    conversationId?: string
    threadId?: string
    projectId?: string
    xpertId?: string
    workspacePath?: string
    metadata?: Record<string, unknown>
}

/**
 * Upload response consumed by ChatKit. `id` and `fileId` are FileAsset ids for
 * agent tools; `storageFileId` is the object-storage bridge for compatibility.
 */
export type AgentFile = {
    id: string
    fileId: string
    storageFileId: string
    objectKey?: string
    url?: string
    fileUrl?: string
    thumbUrl?: string
    originalName?: string
    size?: number
    mimeType?: string
    status: FileAssetStatus
    parseStatus: FileAssetStatus
    purpose: FileAssetPurpose
    parseMode: FileParseMode
    capabilities: FileCapability[]
    summary?: string
    workspacePath?: string
}
