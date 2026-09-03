import { Document, DocumentInterface } from '@langchain/core/documents'
import { IKnowledgeDocumentChunk, VectorTypeEnum } from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import { getPythonErrorMessage } from '@xpert-ai/server-common'
import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common'
import { ChunkMetadata } from '@xpert-ai/plugin-sdk'
import { Raw } from 'typeorm'
import { t } from 'i18next'
import { KnowledgeDocumentChunkService } from '../../knowledge-document/chunk/chunk.service'
import { KnowledgebaseService } from '../knowledgebase.service'
import { compileKnowledgeFilterToMilvus, compileKnowledgeFilterToPostgres } from '../filter'
import { withKnowledgeDocumentMetadata } from './document'
import { KnowledgeCandidateRetriever, KnowledgeRetrievalBatch, KnowledgeRetrievalRequest } from './types'

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
        const vectorStore = await this.knowledgebaseService.getActiveVectorStore(kb.id, true, request.modelContext)
        const vectorTopK = k ?? kb.recall?.topK ?? 10
        const diagnostics = prepared.diagnostics
        this.logger.debug(
            `SimilaritySearch question='${query}' kb='${kb.name}' in ai provider='${kb.copilotModel?.copilot?.modelProvider?.providerName}' and model='${vectorStore.embeddingModel}'`
        )
        let items: [DocumentInterface, number][]
        const vectorStartedAt = Date.now()
        if (environment.vectorStore === VectorTypeEnum.PGVECTOR) {
            const compiled = prepared.effective
                ? compileKnowledgeFilterToPostgres(prepared.effective, prepared.registry)
                : { sql: 'TRUE', parameters: [] }
            const result = await vectorStore.structuredSimilaritySearchWithScore(query, vectorTopK, {
                postgres: {
                    ...compiled,
                    knowledgebaseId: kb.id
                }
            })
            items = result.items
            diagnostics.candidateDocumentCount = result.candidateDocumentCount
            diagnostics.candidateChunkCount = result.candidateChunkCount
        } else if (environment.vectorStore === VectorTypeEnum.MILVUS) {
            const compiled = prepared.effective
                ? compileKnowledgeFilterToMilvus(prepared.effective, prepared.registry)
                : { expression: '', values: {} }
            const relationalCompiled = prepared.effective
                ? compileKnowledgeFilterToPostgres(prepared.effective, prepared.registry)
                : { sql: 'TRUE', parameters: [] }
            const mandatory = 'enabled == true and filterAttributes["document"]["disabled"] == false'
            const [result, candidates] = await Promise.all([
                vectorStore.structuredSimilaritySearchWithScore(query, vectorTopK, {
                    milvus: {
                        expression: compiled.expression ? `${mandatory} and (${compiled.expression})` : mandatory,
                        values: compiled.values
                    }
                }),
                this.knowledgebaseService.countStructuredFilterCandidates(kb.id, relationalCompiled)
            ])
            items = result.items
            diagnostics.candidateDocumentCount = candidates.candidateDocumentCount
            diagnostics.candidateChunkCount = candidates.candidateChunkCount
        } else if (prepared.effective) {
            throw new BadRequestException(
                `Vector store '${environment.vectorStore}' does not support knowledge filter v2.`
            )
        } else {
            items = await vectorStore.similaritySearchWithScore(query, vectorTopK)
        }
        diagnostics.vectorLatency = Date.now() - vectorStartedAt
        const chunkMap = new Map<string, Document<ChunkMetadata>>()
        const vectorRankByChunkId = new Map<string, number>()
        const candidateRankByChunkId = new Map<string, number>()
        const parentChunkIds = new Set<string>()
        const chunkIds: string[] = []
        items.forEach(([doc, score], index) => {
            doc.metadata.score = 1 - score
            chunkMap.set(doc.metadata.chunkId, doc as Document<ChunkMetadata>)
            const rank = index + 1
            const currentRank = vectorRankByChunkId.get(doc.metadata.chunkId)
            if (currentRank === undefined || rank < currentRank) {
                vectorRankByChunkId.set(doc.metadata.chunkId, rank)
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
                    if (!doc || rank === undefined) return false
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
        if (kb.rerankModelId && documents.length > 0) {
            try {
                const rerankedDocs = await vectorStore.rerank(documents, query, {
                    topN: Math.min(documents.length, k ?? kb.recall?.topK)
                })
                const reranked = rerankedDocs.map(({ index, relevanceScore }) =>
                    withKnowledgeDocumentMetadata(documents[index], { relevanceScore })
                )
                diagnostics.hitCount = reranked.length
                diagnostics.retryableWithoutDynamic = reranked.length === 0 && !!prepared.sources.dynamic
                return {
                    source: this.source,
                    candidates: reranked.map((document, index) => ({ document, rank: index + 1 })),
                    diagnostics
                }
            } catch (error) {
                throw new InternalServerErrorException(getPythonErrorMessage(error))
            }
        }

        diagnostics.hitCount = documents.length
        diagnostics.retryableWithoutDynamic = documents.length === 0 && !!prepared.sources.dynamic
        return { source: this.source, candidates, diagnostics }
    }
}
