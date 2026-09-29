export const PPTX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

const ALLOWED_EXACT_MIME_TYPES = new Set([
    'application/json',
    'application/octet-stream',
    'application/pdf',
    'application/zip',
    PPTX_MIME_TYPE,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/html',
    'text/markdown',
    'text/plain'
])

/** Shared by artifact validation and private file delivery; SVG must not render inline. */
export function isSupportedArtifactMimeType(mimeType: string): boolean {
    return mimeType !== 'image/svg+xml' && (ALLOWED_EXACT_MIME_TYPES.has(mimeType) || mimeType.startsWith('image/'))
}

/** Preserve the original type in card metadata, but serve unsupported types as downloads. */
export function getArtifactArchiveMimeType(mimeType: string): string {
    const normalized = mimeType.trim().toLowerCase()
    return isSupportedArtifactMimeType(normalized) ? normalized : 'application/octet-stream'
}
