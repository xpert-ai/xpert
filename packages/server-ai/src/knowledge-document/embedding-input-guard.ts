import type { Document } from '@langchain/core/documents'
import { countTokensSafe, type ChunkMetadata } from '@xpert-ai/plugin-sdk'

const DEFAULT_EMBEDDING_CONTEXT_SIZE = 8192
const EMBEDDING_INPUT_BUDGET_RATIO = 0.75

/**
 * Splits embedding leaf documents before persistence so no single embedding
 * request can consume the model's entire input context. Text parent nodes are
 * kept intact because only their leaves are embedded by the knowledge store.
 */
export function guardEmbeddingInputDocuments(
    documents: Document<ChunkMetadata>[],
    contextSize?: number
): Document<ChunkMetadata>[] {
    const budget = resolveEmbeddingInputBudget(contextSize)
    const parentIds = new Set(documents.map((document) => String(document.metadata?.parentId ?? '')).filter(Boolean))

    return documents.flatMap((document) => {
        const chunkId = String(document.metadata?.chunkId ?? document.id ?? '')
        const mediaType = String(document.metadata?.mediaType ?? 'text')
        if (mediaType === 'text' && parentIds.has(chunkId)) return [document]
        const searchContent =
            typeof document.metadata?.searchContent === 'string' ? document.metadata.searchContent : undefined
        const embeddingContent = searchContent ?? document.pageContent
        if (conservativeEmbeddingTokenCount(embeddingContent) <= budget) return [document]

        const parts = splitTextToEmbeddingBudget(embeddingContent, budget)
        const logicalId = chunkId || `chunk-${String(document.metadata?.chunkIndex ?? 0)}`
        return parts.map((part, index) => ({
            ...document,
            id: undefined,
            pageContent: searchContent === undefined ? part : document.pageContent,
            metadata: {
                ...document.metadata,
                ...(searchContent === undefined ? {} : { searchContent: part }),
                chunkId: `${logicalId}::embedding-part:${index + 1}`,
                embeddingParentChunkId: logicalId,
                embeddingSplitIndex: index,
                embeddingSplitCount: parts.length
            }
        }))
    })
}

/**
 * Resolves the usable per-chunk input budget while reserving headroom for
 * provider tokenization differences and request framing.
 */
export function resolveEmbeddingInputBudget(contextSize?: number) {
    const resolvedContextSize =
        Number.isFinite(contextSize) && contextSize! > 0 ? Math.floor(contextSize!) : DEFAULT_EMBEDDING_CONTEXT_SIZE
    return Math.max(1, Math.floor(resolvedContextSize * EMBEDDING_INPUT_BUDGET_RATIO))
}

/**
 * Uses the larger of the tokenizer result and Unicode code-point count. The
 * latter is intentionally conservative for provider-specific embedding models.
 */
export function conservativeEmbeddingTokenCount(value: string) {
    return Math.max(countTokensSafe(value), Array.from(value).length)
}

/** Splits text at line boundaries before using the hard character splitter. */
function splitTextToEmbeddingBudget(value: string, budget: number) {
    const segments = value.split(/(?<=\n)/)
    const parts: string[] = []
    let current = ''
    for (const segment of segments) {
        const candidate = current + segment
        if (current && conservativeEmbeddingTokenCount(candidate) > budget) {
            parts.push(current)
            current = ''
        }
        if (conservativeEmbeddingTokenCount(segment) > budget) {
            parts.push(...hardSplitToEmbeddingBudget(segment, budget))
        } else {
            current += segment
        }
    }
    if (current) parts.push(current)
    return parts.filter(Boolean)
}

/** Splits a single oversized segment with a token-budget binary search. */
function hardSplitToEmbeddingBudget(value: string, budget: number) {
    const characters = Array.from(value)
    const parts: string[] = []
    let offset = 0
    while (offset < characters.length) {
        let low = 1
        let high = characters.length - offset
        let accepted = 1
        while (low <= high) {
            const middle = Math.floor((low + high) / 2)
            const candidate = characters.slice(offset, offset + middle).join('')
            if (conservativeEmbeddingTokenCount(candidate) <= budget) {
                accepted = middle
                low = middle + 1
            } else {
                high = middle - 1
            }
        }
        parts.push(characters.slice(offset, offset + accepted).join(''))
        offset += accepted
    }
    return parts
}
