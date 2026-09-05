export type PageImagePreviewFile = {
    /** POSIX file path relative to the current workspace root; never an absolute path. */
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
        workspacePath: readPageImageWorkspacePath(metadata),
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

/** Reject ambiguous or escaping paths at the persisted-metadata boundary. */
function readPageImageWorkspacePath(metadata: Record<string, unknown>): string | undefined {
    const value = metadata.workspacePath
    if (value == null) return undefined
    if (
        typeof value !== 'string' ||
        !value ||
        value !== value.trim() ||
        /[\\\x00-\x1f:]/.test(value) ||
        value.split('/').some((part) => !part || part === '.' || part === '..')
    ) {
        throw new Error('Invalid page image workspacePath: expected a normalized workspace-relative POSIX file path.')
    }
    return value
}
