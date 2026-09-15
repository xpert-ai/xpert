import { BadRequestException } from '@nestjs/common'
import { IKnowledgeDocumentChunk } from '@xpert-ai/contracts'
import { countTextTokens, textTokenBoundaries } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { v4 as uuid } from 'uuid'
import { TDocChunkMetadata } from './types'
import { validateMaxChunkTokens } from './parser-validation'

/**
 * Apply the extra token ceiling after character/Markdown splitting, including any added headings.
 * Context parents are not retrieval units. Keep them and their IDs intact; subdivide only leaves.
 * Existing overlap remains in the input chunks; added boundaries partition content without dropping text.
 */
export function limitChunkTokens(
    chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[],
    maxChunkTokens?: number
): IKnowledgeDocumentChunk<TDocChunkMetadata>[] {
    validateMaxChunkTokens(maxChunkTokens)
    if (!maxChunkTokens) return chunks

    const parentIds = new Set(chunks.map((chunk) => chunk.metadata.parentId).filter(Boolean))
    const indexes = new Map<string, number>()
    return chunks.flatMap((chunk) => {
        const metadata = chunk.metadata
        const scope = JSON.stringify([metadata.documentId, metadata.parentId ?? null])
        const nextIndex = () => {
            const index = indexes.get(scope) ?? 0
            indexes.set(scope, index + 1)
            return index
        }
        if (
            metadata.type === 'parent' ||
            parentIds.has(metadata.chunkId) ||
            (metadata.mediaType && metadata.mediaType !== 'text')
        ) {
            nextIndex()
            return [chunk]
        }
        const tokens = countTextTokens(chunk.pageContent)
        if (tokens <= maxChunkTokens) {
            return [{ ...chunk, metadata: { ...metadata, tokens, chunkIndex: nextIndex() } }]
        }

        const parts = splitTextByTokens(chunk.pageContent, maxChunkTokens)
        // Some Markdown splitters prepend headings outside their source range. Retain that coarse
        // provenance; adjust offsets only when the original range maps one-to-one to the content.
        const exactOffsets =
            typeof metadata.startOffset === 'number' &&
            typeof metadata.endOffset === 'number' &&
            metadata.endOffset - metadata.startOffset === chunk.pageContent.length
        return parts.map((part) => ({
            ...chunk,
            id: undefined,
            pageContent: chunk.pageContent.slice(part.start, part.end),
            metadata: {
                ...metadata,
                chunkId: uuid(),
                chunkIndex: nextIndex(),
                tokens: part.tokens,
                ...(exactOffsets
                    ? {
                          startOffset: metadata.startOffset + part.start,
                          endOffset: metadata.startOffset + part.end
                      }
                    : {})
            }
        }))
    })
}

export function splitTextByTokens(text: string, budget: number) {
    const boundaries = textTokenBoundaries(text)
    const parts: { start: number; end: number; tokens: number }[] = []
    let start = 0
    let boundary = 0
    while (start < text.length) {
        while (boundary + 1 < boundaries.length && boundaries[boundary + 1].offset <= start) boundary++
        let candidate = boundary + 1
        while (
            candidate + 1 < boundaries.length &&
            boundaries[candidate + 1].tokens - boundaries[boundary].tokens <= budget
        ) {
            candidate++
        }
        let end = boundaries[candidate].offset
        let tokens = countTextTokens(text.slice(start, end))
        // Re-encoding a slice can change its token count; always verify the emitted text.
        while (tokens > budget && candidate > boundary + 1) {
            end = boundaries[--candidate].offset
            tokens = countTextTokens(text.slice(start, end))
        }
        if (tokens > budget) {
            // A token can straddle Unicode characters. Try every complete prefix of this unit;
            // prefix token counts are not monotonic (for example, a whole CJK word can be one token).
            end = start
            let offset = start
            for (const character of text.slice(start, boundaries[candidate].offset)) {
                offset += character.length
                const count = countTextTokens(text.slice(start, offset))
                if (count <= budget) {
                    end = offset
                    tokens = count
                }
            }
        }
        // Very small limits may not fit even one Unicode character. Never emit oversized or damaged text.
        if (end === start) {
            throw new BadRequestException(
                t('server-ai:Error.ChunkTokenLimitTooSmall', {
                    defaultValue: 'The token limit cannot fit a complete character. Increase the limit and try again.'
                })
            )
        }
        parts.push({ start, end, tokens })
        start = end
    }
    return parts
}
