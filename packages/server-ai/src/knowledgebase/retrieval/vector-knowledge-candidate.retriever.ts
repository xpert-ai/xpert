import { isCurrentQuestionVector } from '../../knowledge-document/questions/question-vectors'
import { Document, DocumentInterface } from '@langchain/core/documents'
import {
    IKnowledgeDocumentChunk,
    KNOWLEDGE_FAQ_MAX_LOGICAL_VECTOR_COUNT,
    KnowledgebaseTypeEnum,
    VectorTypeEnum
} from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common'
import { ChunkMetadata } from '@xpert-ai/plugin-sdk'
import { In, Raw } from 'typeorm'
import { t } from 'i18next'
import { KnowledgeDocumentChunkService } from '../../knowledge-document/chunk/chunk.service'
import { KnowledgebaseService } from '../knowledgebase.service'
import { compileKnowledgeFilterToMilvus, compileKnowledgeFilterToPostgres } from '../filter'
import { withKnowledgeDocumentMetadata } from './document'
import { KnowledgeCandidateRetriever, KnowledgeRetrievalBatch, KnowledgeRetrievalRequest } from './types'
import { milvusContentScopePredicate, postgresContentScopePredicate } from './content-scope'

type VectorSearchResult = {
    items: [DocumentInterface, number][]
    candidateDocumentCount?: number
    candidateChunkCount?: number
}

// Bound work when projections fill the window but there are fewer source chunks than Top K.
const MAX_PROJECTION_SEARCH_EXPANSIONS = 4

@Injectable()
export class VectorKnowledgeCandidateRetriever implements KnowledgeCandidateRetriever {
    readonly source = 'vector' as const
    private readonly logger = new Logger('KnowledgeSearchQueryHandler')

    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly chunkService: KnowledgeDocumentChunkService
    ) {}

    async retrieve(request: KnowledgeRetrievalRequest): Promise<KnowledgeRetrievalBatch> {
        const { knowledgebase: kb, query, k } = request
        const prepared = request.preparedFilter
        const vectorStore = await this.knowledgebaseService.getActiveVectorStore(kb.id, true, request.modelContext, {
            rerankEnabled: false
        })
        const requestedTopK = k ?? kb.recall?.topK ?? 10
        const searchStore = vectorStore.createSearchSession?.(query) ?? vectorStore
        const vectorTopK =
            kb.type === KnowledgebaseTypeEnum.FAQ
                ? requestedTopK * KNOWLEDGE_FAQ_MAX_LOGICAL_VECTOR_COUNT
                : requestedTopK
        const diagnostics = prepared.diagnostics
        this.logger.debug(
            `SimilaritySearch question='${query}' kb='${kb.name}' in ai provider='${kb.copilotModel?.copilot?.modelProvider?.providerName}' and model='${vectorStore.embeddingModel}'`
        )
        const vectorStartedAt = Date.now()
        const search = async (topK: number): Promise<VectorSearchResult> => {
            if (environment.vectorStore === VectorTypeEnum.PGVECTOR) {
                const compiled = prepared.effective
                    ? compileKnowledgeFilterToPostgres(prepared.effective, prepared.registry)
                    : { sql: 'TRUE', parameters: [] }
                return searchStore.structuredSimilaritySearchWithScore(query, topK, {
                    postgres: {
                        ...compiled,
                        sql:
                            request.contentScope && request.contentScope !== 'all'
                                ? `(${compiled.sql}) AND (${postgresContentScopePredicate(request.contentScope)})`
                                : compiled.sql,
                        knowledgebaseId: kb.id
                    }
                })
            }
            if (environment.vectorStore === VectorTypeEnum.MILVUS) {
                const compiled = prepared.effective
                    ? compileKnowledgeFilterToMilvus(prepared.effective, prepared.registry)
                    : { expression: '', values: {} }
                const relationalCompiled = prepared.effective
                    ? compileKnowledgeFilterToPostgres(prepared.effective, prepared.registry)
                    : { sql: 'TRUE', parameters: [] }
                const mandatory = 'enabled == true and filterAttributes["document"]["disabled"] == false'
                const contentPredicate = milvusContentScopePredicate(request.contentScope)
                const expression = [mandatory, compiled.expression, contentPredicate]
                    .filter(Boolean)
                    .map((part, index) => (index === 0 ? part : `(${part})`))
                    .join(' and ')
                const [result, candidates] = await Promise.all([
                    searchStore.structuredSimilaritySearchWithScore(query, topK, {
                        milvus: {
                            expression,
                            values: compiled.values
                        }
                    }),
                    this.knowledgebaseService.countStructuredFilterCandidates(kb.id, {
                        ...relationalCompiled,
                        sql: contentPredicate
                            ? `(${relationalCompiled.sql}) AND (${postgresContentScopePredicate(request.contentScope)})`
                            : relationalCompiled.sql
                    })
                ])
                return {
                    items: result.items,
                    candidateDocumentCount: candidates.candidateDocumentCount,
                    candidateChunkCount: candidates.candidateChunkCount
                }
            }
            if (request.contentScope && request.contentScope !== 'all') {
                throw new BadRequestException(
                    t('server-ai:Error.KnowledgeContentScopeBackendUnsupported', {
                        defaultValue: 'This vector store does not support retrieval content selection.'
                    })
                )
            }
            if (prepared.effective) {
                throw new BadRequestException(
                    `Vector store '${environment.vectorStore}' does not support knowledge filter v2.`
                )
            }
            return { items: await searchStore.similaritySearchWithScore(query, topK) }
        }

        const filterQuestions = async (items: [DocumentInterface, number][]) => {
            const ids = items
                .filter(([doc]) => doc.metadata.questionGenerationId)
                .map(([doc]) => doc.metadata.questionSourceChunkId)
            if (!ids.length) return items
            const { items: sources } = await this.chunkService.findAll({
                where: { knowledgebaseId: kb.id, id: In(ids) }
            })
            const byId = new Map(sources.map((chunk) => [chunk.id, chunk]))
            return items.filter(([doc]) => {
                if (!doc.metadata.questionGenerationId) return true
                const source = byId.get(doc.metadata.questionSourceChunkId)
                return source && source.metadata?.enabled !== false && isCurrentQuestionVector(doc.metadata, source)
            })
        }
        let currentTopK = vectorTopK
        let searchResult = await search(currentTopK)
        let validItems = await filterQuestions(searchResult.items)
        // Multiple question vectors must not crowd other source chunks out of Top K.
        let expansions = 0
        while (
            expansions < MAX_PROJECTION_SEARCH_EXPANSIONS &&
            searchResult.items.length === currentTopK &&
            (kb.type === KnowledgebaseTypeEnum.FAQ ||
                searchResult.items.some(([doc]) => doc.metadata.questionGenerationId)) &&
            countDistinctChunkIds(validItems) < requestedTopK
        ) {
            expansions++
            currentTopK *= 2
            searchResult = await search(currentTopK)
            validItems = await filterQuestions(searchResult.items)
        }
        searchResult.items = validItems
        const score = request.score === undefined ? kb.recall?.score : request.score
        const items =
            score == null ? searchResult.items : searchResult.items.filter(([, distance]) => 1 - distance >= score)
        diagnostics.candidateDocumentCount = searchResult.candidateDocumentCount
        diagnostics.candidateChunkCount = searchResult.candidateChunkCount
        diagnostics.vectorLatency = Date.now() - vectorStartedAt
        const chunkMap = new Map<string, Document<ChunkMetadata>>()
        const vectorRankByChunkId = new Map<string, number>()
        const candidateRankByChunkId = new Map<string, number>()
        const parentChunkIds = new Set<string>()
        const chunkIds: string[] = []
        items.forEach(([doc, score], index) => {
            doc.metadata.score = 1 - score
            const rank = index + 1
            const currentRank = vectorRankByChunkId.get(doc.metadata.chunkId)
            if (currentRank === undefined || rank < currentRank) {
                vectorRankByChunkId.set(doc.metadata.chunkId, rank)
                chunkMap.set(doc.metadata.chunkId, doc as Document<ChunkMetadata>)
            }
            if (doc.metadata.parentId) {
                parentChunkIds.add(doc.metadata.parentId)
            }
        })
        items.forEach(([doc]) => {
            if (!doc.metadata.parentId && !parentChunkIds.has(doc.metadata.chunkId)) {
                chunkIds.push(doc.metadata.chunkId)
            }
        })
        const docs: IKnowledgeDocumentChunk<ChunkMetadata>[] = []
        if (chunkIds.length > 0) {
            const { items: chunks } = await this.chunkService.findAll({
                where: {
                    knowledgebaseId: kb.id,
                    metadata: Raw((alias) => `${alias} ->> 'chunkId' = ANY(:ids)`, {
                        ids: Array.from(chunkIds)
                    })
                },
                relations: ['document'],
                select: {
                    document: {
                        id: true,
                        name: true,
                        sourceType: true,
                        type: true,
                        category: true,
                        fileUrl: true,
                        disabled: true
                    }
                }
            })
            chunks.forEach((chunk) => {
                if (chunk.metadata?.enabled === false || chunk.document?.disabled) return
                const doc = chunkMap.get(chunk.metadata.chunkId)
                if (!doc || !isCurrentQuestionVector(doc.metadata, chunk)) return
                if (doc) {
                    chunk.metadata.score = doc.metadata.score
                    chunk.metadata.tokens = doc.metadata.tokens
                    const rank = vectorRankByChunkId.get(chunk.metadata.chunkId)
                    if (rank !== undefined) {
                        candidateRankByChunkId.set(chunk.metadata.chunkId, rank)
                    }
                }
                docs.push(chunk)
            })
        }
        if (parentChunkIds.size > 0) {
            const { items: chunks } = await this.chunkService.findAll({
                where: {
                    knowledgebaseId: kb.id,
                    metadata: Raw((alias) => `${alias} ->> 'chunkId' = ANY(:ids)`, {
                        ids: Array.from(parentChunkIds)
                    })
                },
                relations: ['children', 'document'],
                select: {
                    document: {
                        id: true,
                        name: true,
                        sourceType: true,
                        type: true,
                        category: true,
                        fileUrl: true,
                        disabled: true
                    }
                }
            })
            chunks.forEach((chunk) => {
                let candidateRank: number | undefined
                chunk.children = chunk.children.filter((child) => {
                    if (child.metadata?.enabled === false) return false
                    const doc = chunkMap.get(child.metadata.chunkId)
                    const rank = vectorRankByChunkId.get(child.metadata.chunkId)
                    if (!doc || rank === undefined || !isCurrentQuestionVector(doc.metadata, child)) return false
                    child.metadata.score = doc.metadata.score
                    child.metadata.tokens = doc.metadata.tokens
                    candidateRank = candidateRank === undefined ? rank : Math.min(candidateRank, rank)
                    if (!chunk.metadata.score || chunk.metadata.score < doc.metadata.score) {
                        chunk.metadata.score = doc.metadata.score
                    }
                    return true
                })
                if (chunk.metadata?.enabled === false || chunk.document?.disabled || !chunk.children.length) return
                if (candidateRank !== undefined) {
                    candidateRankByChunkId.set(chunk.metadata.chunkId, candidateRank)
                }
                docs.push(chunk)
            })
        }

        const documents = docs.map((doc) => withKnowledgeDocumentMetadata(doc))
        const candidates = documents.map((document) => {
            const rank = candidateRankByChunkId.get(document.metadata.chunkId)
            if (rank === undefined) {
                throw new InternalServerErrorException(
                    t('server-ai:Error.KnowledgeCandidateRankMissing', {
                        chunkId: document.metadata.chunkId,
                        defaultValue: `Knowledge candidate rank is missing for chunk: ${document.metadata.chunkId}`
                    })
                )
            }
            return { document, rank }
        })
        // Finalization owns Top K after filtering and optional saved or temporary reranking.
        diagnostics.hitCount = candidates.length
        diagnostics.retryableWithoutDynamic = candidates.length === 0 && !!prepared.sources.dynamic
        return { source: this.source, candidates, diagnostics }
    }
}

function countDistinctChunkIds(items: [DocumentInterface, number][]) {
    return new Set(items.map(([document]) => document.metadata.chunkId)).size
}
