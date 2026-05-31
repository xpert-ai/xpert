export type PageImagePreviewFile = {
    workspacePath?: string
    url?: string
    fileName?: string
    width?: number
    height?: number
    size?: number
}

export function readPageImageStorageKey(metadata?: Record<string, unknown>) {
    return readStringMetadata(metadata, 'storageKey')
}

export function readPageImageFileName(metadata?: Record<string, unknown>) {
    return readStringMetadata(metadata, 'fileName')
}

export function readPageImageParseRunId(metadata?: Record<string, unknown>) {
    return readStringMetadata(metadata, 'parseRunId')
}

export function readWorkspaceProvider(metadata?: Record<string, unknown>) {
    const workspace = metadata?.workspace
    if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) {
        return undefined
    }
    if (!('provider' in workspace)) {
        return undefined
    }
    const provider = workspace.provider
    return typeof provider === 'string' && provider.trim().length ? provider : undefined
}

export function createPageImagePreviewFile(metadata?: Record<string, unknown>): PageImagePreviewFile | undefined {
    if (!metadata) {
        return undefined
    }

    const file: PageImagePreviewFile = {
        workspacePath: readStringMetadata(metadata, 'workspacePath'),
        url: readStringMetadata(metadata, 'url'),
        fileName: readStringMetadata(metadata, 'fileName'),
        width: readNumberMetadata(metadata, 'width'),
        height: readNumberMetadata(metadata, 'height'),
        size: readNumberMetadata(metadata, 'size')
    }
    return Object.values(file).some((value) => value !== undefined) ? file : undefined
}

function readStringMetadata(metadata: Record<string, unknown> | undefined, key: string) {
    const value = metadata?.[key]
    return typeof value === 'string' && value.trim().length ? value : undefined
}

function readNumberMetadata(metadata: Record<string, unknown> | undefined, key: string) {
    const value = metadata?.[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
