/** Preserve document order when one logical chunk is split for embedding. */
export function sortChunksByDocumentOrder<T extends { metadata?: unknown }>(chunks: T[]): T[] {
    return chunks
        .map((chunk, index) => ({
            chunk,
            index,
            ...readChunkOrder(chunk.metadata)
        }))
        .sort((left, right) => {
            if (left.chunkIndex !== undefined && right.chunkIndex !== undefined) {
                return (
                    left.chunkIndex - right.chunkIndex ||
                    (left.splitIndex ?? -1) - (right.splitIndex ?? -1) ||
                    left.index - right.index
                )
            }
            if (left.chunkIndex !== undefined || right.chunkIndex !== undefined) {
                return left.chunkIndex !== undefined ? -1 : 1
            }
            return left.index - right.index
        })
        .map(({ chunk }) => chunk)
}

/** Normalize persisted JSON and preview metadata at the shared sorting boundary. */
function readChunkOrder(metadata: unknown): { chunkIndex?: number; splitIndex?: number } {
    if (!metadata || typeof metadata !== 'object') return {}
    return {
        chunkIndex: 'chunkIndex' in metadata ? finiteNumber(metadata.chunkIndex) : undefined,
        splitIndex: 'embeddingSplitIndex' in metadata ? finiteNumber(metadata.embeddingSplitIndex) : undefined
    }
}

function finiteNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
