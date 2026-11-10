import { sortChunksByDocumentOrder } from '../document-chunk-order'
import { questionVectorIds } from '../questions/question-vectors'
import { questionSourceHash } from '../questions/question-generation'
import { IKnowledgeDocument, IKnowledgeDocumentChunk, KnowledgeDocumentLastIncrementalSync } from '@xpert-ai/contracts'
import { In } from 'typeorm'
import type { KnowledgeDocumentStore } from '../../knowledgebase/embedding/vector-store'
import { KnowledgeDocumentChunkService } from './chunk.service'
import { computeKnowledgeDocumentChunkHash, computeKnowledgeDocumentContentHash } from '../document-hash'
import { TDocChunkMetadata } from '../types'
import { getChunkMetadata, getChunkLogicalId } from './chunk-identity'

type IncrementalChunkOperation = 'unchanged' | 'changed' | 'added'

type IncrementalChunkMatch = {
    operation: IncrementalChunkOperation
    incoming: IKnowledgeDocumentChunk<TDocChunkMetadata>
    chunk: IKnowledgeDocumentChunk<TDocChunkMetadata>
    previous?: IKnowledgeDocumentChunk<TDocChunkMetadata>
}

export type IncrementalChunkSyncResult = {
    chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[]
    embeddingChunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[]
    removedChunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[]
    contentHash: string
    contentChanged: boolean
    statistics: Omit<KnowledgeDocumentLastIncrementalSync, 'mode' | 'embeddingTokens' | 'processedAt'>
}

function getChunkMatchType(chunk: Pick<IKnowledgeDocumentChunk<TDocChunkMetadata>, 'metadata'>) {
    const metadata = getChunkMetadata(chunk)
    return `${metadata.mediaType ?? 'text'}:${metadata.type ?? ''}:${metadata.source ?? ''}`
}

function getFiniteNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function popFirstAvailable(
    map: Map<string, IKnowledgeDocumentChunk<TDocChunkMetadata>[]>,
    key: string,
    usedIds: Set<string>
) {
    const matches = map.get(key)
    if (!matches?.length) {
        return null
    }

    while (matches.length) {
        const match = matches.shift()
        if (match?.id && !usedIds.has(match.id)) {
            return match
        }
    }

    return null
}

export class IncrementalChunkSync {
    constructor(private readonly chunkService: KnowledgeDocumentChunkService) {}

    /**
     * Cover chunks of a document. record tokens of each chunk.
     */
    async coverChunks(document: IKnowledgeDocument, vectorStore: KnowledgeDocumentStore) {
        await this.chunkService.deleteByDocumentId(document.id)
        return await this.chunkService.upsertBulk(
            document.chunks.map((_) => {
                return {
                    ..._,
                    documentId: document.id,
                    knowledgebaseId: document.knowledgebaseId
                } as IKnowledgeDocumentChunk
            })
        )
    }

    async syncChunksIncrementally(
        document: IKnowledgeDocument,
        vectorStore: KnowledgeDocumentStore
    ): Promise<IncrementalChunkSyncResult> {
        const incomingChunks = this.prepareIncomingChunks(document.chunks ?? [])
        const contentHash = computeKnowledgeDocumentContentHash(incomingChunks)
        const { items: existingChunks } = await this.chunkService.findAll({
            where: { documentId: document.id },
            relations: ['parent'],
            order: { createdAt: 'ASC' }
        })

        // Chunk rows are saved before vectors. Only a matching published hash proves those rows were indexed.
        const recoverInterruptedSync =
            existingChunks.length > 0 &&
            (!document.contentHash ||
                computeKnowledgeDocumentContentHash(sortChunksByDocumentOrder(existingChunks)) !== document.contentHash)
        if (!recoverInterruptedSync && document.contentHash && document.contentHash === contentHash) {
            return {
                chunks: existingChunks as IKnowledgeDocumentChunk<TDocChunkMetadata>[],
                embeddingChunks: [],
                removedChunks: [],
                contentHash,
                contentChanged: false,
                statistics: {
                    total: incomingChunks.length,
                    skipped: incomingChunks.length,
                    added: 0,
                    updated: 0,
                    deleted: 0
                }
            }
        }

        const matches = this.matchIncrementalChunks(
            incomingChunks,
            existingChunks as IKnowledgeDocumentChunk<TDocChunkMetadata>[]
        )
        const skippedCount = recoverInterruptedSync
            ? 0
            : matches.filter((match) => match.operation === 'unchanged').length
        const addedCount = matches.filter((match) => match.operation === 'added').length
        const updatedCount = matches.filter(
            (match) => match.operation === 'changed' || (recoverInterruptedSync && match.operation === 'unchanged')
        ).length
        const chunksToPersist = matches.map((match) => ({
            ...match.chunk,
            documentId: document.id,
            knowledgebaseId: document.knowledgebaseId
        }))
        const changedIds = matches
            .filter((match) => (match.operation === 'changed' || recoverInterruptedSync) && match.chunk.id)
            .map((match) => match.chunk.id)
            .filter((id): id is string => !!id)
        const usedIds = new Set(matches.map((match) => match.previous?.id).filter((id): id is string => !!id))
        const removedChunks = existingChunks.filter(
            (chunk) => chunk.id && !usedIds.has(chunk.id)
        ) as IKnowledgeDocumentChunk<TDocChunkMetadata>[]
        const removedIds = removedChunks.map((chunk) => chunk.id).filter((id): id is string => !!id)

        await vectorStore.deleteChunks([
            ...removedIds,
            ...changedIds,
            ...questionVectorIds([
                ...removedChunks,
                ...matches
                    .filter(
                        (match) =>
                            match.operation === 'changed' &&
                            questionSourceHash(match.previous) !== questionSourceHash(match.chunk)
                    )
                    .map((match) => match.previous)
            ])
        ])

        const savedChunks = (await this.chunkService.upsertBulk(
            chunksToPersist
        )) as IKnowledgeDocumentChunk<TDocChunkMetadata>[]
        if (removedIds.length) {
            await this.chunkService.delete({ id: In(removedIds) })
        }

        const changedChunkIds = new Set(
            matches
                .filter((match) => recoverInterruptedSync || match.operation !== 'unchanged')
                .map((match) => getChunkLogicalId(match.chunk))
                .filter((id): id is string => !!id)
        )
        const changedRowIds = new Set(
            matches
                .filter((match) => recoverInterruptedSync || match.operation !== 'unchanged')
                .map((match) => match.chunk.id)
                .filter((id): id is string => !!id)
        )
        const embeddingChunks = this.chunkService.findAllEmbeddingNodes(savedChunks).filter((chunk) => {
            const logicalId = getChunkLogicalId(chunk)
            return (logicalId && changedChunkIds.has(logicalId)) || (chunk.id && changedRowIds.has(chunk.id))
        }) as IKnowledgeDocumentChunk<TDocChunkMetadata>[]

        return {
            chunks: savedChunks,
            embeddingChunks,
            removedChunks,
            contentHash,
            contentChanged: true,
            statistics: {
                total: savedChunks.length,
                skipped: skippedCount,
                added: addedCount,
                updated: updatedCount,
                deleted: removedChunks.length
            }
        }
    }

    private prepareIncomingChunks(chunks: IKnowledgeDocumentChunk[]): IKnowledgeDocumentChunk<TDocChunkMetadata>[] {
        return chunks.map((chunk, index) => {
            const metadata = {
                ...(chunk.metadata ?? {}),
                // Persist a stable sequence for display, retrieval payloads, and incremental comparisons.
                chunkId: chunk.metadata?.chunkId || chunk.id || `chunk-${index}`,
                chunkIndex: getFiniteNumber(chunk.metadata?.chunkIndex) ?? index
            } as TDocChunkMetadata
            delete metadata.questionGeneration
            delete metadata.questionGenerationId
            delete metadata.questionSourceChunkId
            delete metadata.generatedQuestionId
            const prepared = {
                ...chunk,
                metadata
            } as IKnowledgeDocumentChunk<TDocChunkMetadata>
            prepared.contentHash = computeKnowledgeDocumentChunkHash(prepared)
            return prepared
        })
    }

    private matchIncrementalChunks(
        incomingChunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[],
        existingChunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[]
    ): IncrementalChunkMatch[] {
        const exactMatches = new Map<string, IKnowledgeDocumentChunk<TDocChunkMetadata>[]>()
        const positionMatches = new Map<string, IKnowledgeDocumentChunk<TDocChunkMetadata>[]>()
        const incomingContentHashByChunkId = new Map<string, string>()
        const incomingParentIndexByChunkId = new Map<string, number | null>()
        const resolvedChunkIdByIncomingId = new Map<string, string>()
        const usedIds = new Set<string>()

        for (const chunk of incomingChunks) {
            const logicalId = getChunkLogicalId(chunk)
            if (logicalId && chunk.contentHash) {
                incomingContentHashByChunkId.set(logicalId, chunk.contentHash)
                incomingParentIndexByChunkId.set(logicalId, getChunkMetadata(chunk).chunkIndex ?? null)
            }
        }

        for (const chunk of existingChunks) {
            const exactKey = this.buildExactChunkMatchKey(chunk, (parentId) => {
                const parent = chunk.parent
                const parentLogicalId = parent ? getChunkLogicalId(parent) : null
                return parentLogicalId === parentId ? (parent?.contentHash ?? null) : null
            })
            const positionKey = this.buildPositionChunkMatchKey(chunk, (parentId) => {
                const parent = chunk.parent
                const parentLogicalId = parent ? getChunkLogicalId(parent) : null
                return parentLogicalId === parentId ? (getChunkMetadata(parent).chunkIndex ?? null) : null
            })
            this.pushChunkMatch(exactMatches, exactKey, chunk)
            this.pushChunkMatch(positionMatches, positionKey, chunk)
        }

        const matches = incomingChunks.map((incoming) => {
            const exactKey = this.buildExactChunkMatchKey(
                incoming,
                (parentId) => incomingContentHashByChunkId.get(parentId) ?? null
            )
            const exactMatch = popFirstAvailable(exactMatches, exactKey, usedIds)
            if (exactMatch?.id) {
                usedIds.add(exactMatch.id)
                const matchedChunk = this.mergeIncomingChunkWithExisting(incoming, exactMatch)
                const incomingLogicalId = getChunkLogicalId(incoming)
                const matchedLogicalId = getChunkLogicalId(matchedChunk)
                if (incomingLogicalId && matchedLogicalId) {
                    resolvedChunkIdByIncomingId.set(incomingLogicalId, matchedLogicalId)
                }
                return {
                    operation: 'unchanged' as const,
                    incoming,
                    chunk: matchedChunk,
                    previous: exactMatch
                }
            }

            const positionKey = this.buildPositionChunkMatchKey(
                incoming,
                (parentId) => incomingParentIndexByChunkId.get(parentId) ?? null
            )
            const positionMatch = popFirstAvailable(positionMatches, positionKey, usedIds)
            if (positionMatch?.id) {
                usedIds.add(positionMatch.id)
                const matchedChunk = this.mergeIncomingChunkWithExisting(incoming, positionMatch)
                const incomingLogicalId = getChunkLogicalId(incoming)
                const matchedLogicalId = getChunkLogicalId(matchedChunk)
                if (incomingLogicalId && matchedLogicalId) {
                    resolvedChunkIdByIncomingId.set(incomingLogicalId, matchedLogicalId)
                }
                return {
                    operation: 'changed' as const,
                    incoming,
                    chunk: matchedChunk,
                    previous: positionMatch
                }
            }

            const incomingLogicalId = getChunkLogicalId(incoming)
            if (incomingLogicalId) {
                resolvedChunkIdByIncomingId.set(incomingLogicalId, incomingLogicalId)
            }
            return {
                operation: 'added' as const,
                incoming,
                chunk: incoming
            }
        })

        return matches.map((match) => ({
            ...match,
            chunk: this.remapChunkParentId(match.chunk, resolvedChunkIdByIncomingId)
        }))
    }

    private pushChunkMatch(
        map: Map<string, IKnowledgeDocumentChunk<TDocChunkMetadata>[]>,
        key: string,
        chunk: IKnowledgeDocumentChunk<TDocChunkMetadata>
    ) {
        const matches = map.get(key) ?? []
        matches.push(chunk)
        map.set(key, matches)
    }

    private buildExactChunkMatchKey(
        chunk: IKnowledgeDocumentChunk<TDocChunkMetadata>,
        resolveParentContentHash: (parentId: string) => string | null
    ) {
        const metadata = getChunkMetadata(chunk)
        const parentHash = metadata.parentId ? resolveParentContentHash(metadata.parentId) : null
        return [chunk.contentHash ?? '', getChunkMatchType(chunk), parentHash ?? ''].join('\u0000')
    }

    private buildPositionChunkMatchKey(
        chunk: IKnowledgeDocumentChunk<TDocChunkMetadata>,
        resolveParentIndex: (parentId: string) => number | null
    ) {
        const metadata = getChunkMetadata(chunk)
        const parentIndex = metadata.parentId ? resolveParentIndex(metadata.parentId) : null
        return [getChunkMatchType(chunk), parentIndex ?? 'root', metadata.chunkIndex ?? 'unknown'].join('\u0000')
    }

    private mergeIncomingChunkWithExisting(
        incoming: IKnowledgeDocumentChunk<TDocChunkMetadata>,
        existing: IKnowledgeDocumentChunk<TDocChunkMetadata>
    ): IKnowledgeDocumentChunk<TDocChunkMetadata> {
        const incomingMetadata = getChunkMetadata(incoming)
        const existingLogicalId = getChunkLogicalId(existing)
        return {
            ...incoming,
            id: existing.id,
            metadata: {
                ...incomingMetadata,
                chunkId: existingLogicalId ?? incomingMetadata.chunkId,
                questionGeneration: existing.metadata?.questionGeneration
            },
            parent: existing.parent
        }
    }

    private remapChunkParentId(
        chunk: IKnowledgeDocumentChunk<TDocChunkMetadata>,
        resolvedChunkIdByIncomingId: Map<string, string>
    ): IKnowledgeDocumentChunk<TDocChunkMetadata> {
        const parentId = getChunkMetadata(chunk).parentId
        if (!parentId) {
            return chunk
        }

        const resolvedParentId = resolvedChunkIdByIncomingId.get(parentId)
        if (!resolvedParentId || resolvedParentId === parentId) {
            return chunk
        }

        return {
            ...chunk,
            metadata: {
                ...getChunkMetadata(chunk),
                parentId: resolvedParentId
            }
        }
    }
}
