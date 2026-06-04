import { Document, DocumentInterface } from '@langchain/core/documents'
import {
    DocumentMetadata,
    IKnowledgebase,
    IKnowledgeDocumentChunk,
    KnowledgeDocumentMetadata,
    KnowledgebaseTypeEnum,
    TKBRetrievalSettings,
    TWFCase
} from '@xpert-ai/contracts'
import { getPythonErrorMessage, isEmpty } from '@xpert-ai/server-common'
import { Inject, InternalServerErrorException, Logger } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { ChunkMetadata, RequestContext } from '@xpert-ai/plugin-sdk'
import { isNil, sortBy } from 'lodash'
import { In, IsNull, Not, Raw } from 'typeorm'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { KnowledgeSearchQuery } from '../knowledge-search.query'
import { KnowledgeRetrievalLogService } from '../../logs'
import { KnowledgeDocumentChunkService } from '../../../knowledge-document/chunk/chunk.service'
import { KnowledgeDocumentService } from '../../../knowledge-document/document.service'
import { buildMetadataCondition } from '../../types'
import { KnowledgeGraphSearchQuery } from '../../../graphrag/queries'
import { TKnowledgeGraphSearchResult } from '../../../graphrag/types'

@QueryHandler(KnowledgeSearchQuery)
export class KnowledgeSearchQueryHandler implements IQueryHandler<KnowledgeSearchQuery> {
    private readonly logger = new Logger(KnowledgeSearchQueryHandler.name)

    @Inject(KnowledgeRetrievalLogService)
    private readonly retrievalLogService: KnowledgeRetrievalLogService

    @Inject(KnowledgeDocumentChunkService)
    private readonly chunkService: KnowledgeDocumentChunkService

    @Inject(KnowledgeDocumentService)
    private readonly documentService: KnowledgeDocumentService

    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly queryBus: QueryBus
    ) {}

    public async execute(command: KnowledgeSearchQuery): Promise<DocumentInterface<DocumentMetadata>[]> {
        const { knowledgebases, query, k, score, filter, retrieval } = command.input
        const tenantId = command.input.tenantId ?? RequestContext.currentTenantId()
        const organizationId = command.input.organizationId ?? RequestContext.getOrganizationId()
        const topK = k ?? 1000

        const result = await this.knowledgebaseService.findAll({
            where: {
                tenantId,
                organizationId,
                id: knowledgebases ? In(knowledgebases) : Not(IsNull())
            }
        })
        const _knowledgebases = result.items

        const documents: DocumentInterface<DocumentMetadata>[] = []
        const kbs = await Promise.all(
            _knowledgebases.map(async (kb) => {
                let docs: DocumentInterface<DocumentMetadata>[] = []
                if (kb.type === KnowledgebaseTypeEnum.External) {
                    const { chunks } = await this.knowledgebaseService.searchExternalKnowledgebase(
                        kb,
                        query,
                        topK,
                        filter
                    )
                    docs = chunks.map(([doc, score]) => this.withDocumentMetadata(new Document(doc), { score }))
                } else {
                    docs = await this.searchInternalKnowledgebase(
                        kb,
                        query,
                        {
                            tenantId,
                            organizationId
                        },
                        k,
                        filter,
                        command.input.filtering_conditions,
                        retrieval
                    )
                }

                // Log the retrieval results
                try {
                    await this.retrievalLogService.create({
                        query,
                        source: command.input.source,
                        knowledgebaseId: kb.id,
                        hitCount: docs.length,
                        requestId: command.input.id
                    })
                } catch (error) {
                    this.logger.error(`Failed to log retrieval results: ${getPythonErrorMessage(error)}`)
                }

                return {
                    kb,
                    docs
                }
            })
        )

        kbs.forEach(({ kb, docs }) => {
            const score = command.input.score ?? kb.recall?.score
            if (isNil(score)) {
                documents.push(...docs)
            } else {
                docs.filter((doc) => doc.metadata.score >= score).forEach((item) => {
                    documents.push(item)
                })
            }
        })

        return sortBy(documents, 'metadata.relevanceScore', 'metadata.score').reverse().slice(0, topK)
    }

    private async searchInternalKnowledgebase(
        kb: IKnowledgebase,
        query: string,
        context: {
            tenantId: string
            organizationId: string
        },
        k?: number,
        filter?: KnowledgeDocumentMetadata,
        filteringConditions?: TWFCase,
        retrieval?: TKBRetrievalSettings
    ): Promise<DocumentInterface<DocumentMetadata>[]> {
        const mode = retrieval?.mode ?? kb.graphRag?.mode ?? 'vector'
        if (mode === 'graph') {
            const result = await this.queryBus.execute<KnowledgeGraphSearchQuery, TKnowledgeGraphSearchResult>(
                new KnowledgeGraphSearchQuery({
                    tenantId: context.tenantId,
                    organizationId: context.organizationId,
                    knowledgebase: kb,
                    query,
                    k,
                    filter,
                    filtering_conditions: filteringConditions,
                    retrieval,
                    graphRag: kb.graphRag
                })
            )
            return result.docs
        }

        const vectorDocs = await this.similaritySearchWithScore(kb, query, k, filter, filteringConditions)
        if (mode !== 'hybrid') {
            return vectorDocs
        }

        const graphResult = await this.queryBus.execute<KnowledgeGraphSearchQuery, TKnowledgeGraphSearchResult>(
            new KnowledgeGraphSearchQuery({
                tenantId: context.tenantId,
                organizationId: context.organizationId,
                knowledgebase: kb,
                query,
                k,
                filter,
                filtering_conditions: filteringConditions,
                retrieval,
                graphRag: kb.graphRag
            })
        )
        if (graphResult.failed) {
            this.logger.warn(`Hybrid GraphRAG failed for knowledgebase '${kb.id}', falling back to vector results`)
            return vectorDocs
        }

        return this.mergeHybridResults(
            kb,
            query,
            vectorDocs,
            graphResult.docs,
            k,
            retrieval?.graphWeight ?? kb.graphRag?.graphWeight ?? 0.35
        )
    }

    private async mergeHybridResults(
        kb: IKnowledgebase,
        query: string,
        vectorDocs: DocumentInterface<DocumentMetadata>[],
        graphDocs: DocumentInterface<DocumentMetadata>[],
        k?: number,
        graphWeight = 0.35
    ) {
        const weight = Math.min(1, Math.max(0, graphWeight))
        const byChunkId = new Map<
            string,
            {
                doc: DocumentInterface<DocumentMetadata>
                vectorScore: number
                graphScore: number
            }
        >()

        const upsert = (doc: DocumentInterface<DocumentMetadata>, source: 'vector' | 'graph') => {
            const chunkId = this.resolveChunkId(doc)
            const current = byChunkId.get(chunkId)
            const vectorScore = source === 'vector' ? this.resolveVectorScore(doc) : (current?.vectorScore ?? 0)
            const graphScore = source === 'graph' ? this.resolveGraphScore(doc) : (current?.graphScore ?? 0)
            byChunkId.set(chunkId, {
                doc: this.withDocumentMetadata({
                    ...(current?.doc ?? doc),
                    ...doc,
                    metadata: {
                        ...(current?.doc.metadata ?? {}),
                        ...(doc.metadata ?? {})
                    }
                }),
                vectorScore,
                graphScore
            })
        }

        vectorDocs.forEach((doc) => upsert(doc, 'vector'))
        graphDocs.forEach((doc) => upsert(doc, 'graph'))

        const merged = [...byChunkId.values()]
            .map(({ doc, vectorScore, graphScore }) => {
                const relevanceScore = vectorScore * (1 - weight) + graphScore * weight
                return this.withDocumentMetadata({
                    ...doc,
                    metadata: {
                        ...(doc.metadata ?? {}),
                        vectorScore,
                        graphScore,
                        score: relevanceScore,
                        relevanceScore
                    }
                })
            })
            .sort((left, right) => (right.metadata.relevanceScore ?? 0) - (left.metadata.relevanceScore ?? 0))

        if (kb.rerankModelId && merged.length > 0) {
            try {
                const vectorStore = await this.knowledgebaseService.getActiveVectorStore(kb.id, true)
                const rerankedDocs = await vectorStore.rerank(merged, query, {
                    topN: Math.min(merged.length, k ?? kb.recall?.topK)
                })
                return rerankedDocs.map(({ index, relevanceScore }) => ({
                    ...merged[index],
                    metadata: {
                        ...merged[index].metadata,
                        relevanceScore
                    }
                }))
            } catch (error) {
                throw new InternalServerErrorException(getPythonErrorMessage(error))
            }
        }

        return merged.slice(0, k ?? kb.recall?.topK)
    }

    private withDocumentMetadata(
        doc: DocumentInterface,
        metadataPatch: Partial<DocumentMetadata> = {}
    ): DocumentInterface<DocumentMetadata> {
        const chunkId = this.resolveChunkId(doc)
        const metadata: DocumentMetadata = {
            ...(doc.metadata ?? {}),
            ...metadataPatch,
            chunkId
        }
        return {
            ...doc,
            metadata
        }
    }

    private resolveChunkId(doc: DocumentInterface) {
        const chunkId = doc.metadata?.chunkId
        if (typeof chunkId === 'string' && chunkId) {
            return chunkId
        }
        if ('id' in doc && typeof doc.id === 'string' && doc.id) {
            return doc.id
        }
        return doc.pageContent
    }

    private resolveVectorScore(doc: DocumentInterface<DocumentMetadata>) {
        if (typeof doc.metadata?.relevanceScore === 'number') {
            return doc.metadata.relevanceScore
        }
        if (typeof doc.metadata?.score === 'number') {
            return doc.metadata.score
        }
        return 0
    }

    private resolveGraphScore(doc: DocumentInterface<DocumentMetadata>) {
        if (typeof doc.metadata?.graphScore === 'number') {
            return doc.metadata.graphScore
        }
        if (typeof doc.metadata?.score === 'number') {
            return doc.metadata.score
        }
        return 0
    }

    private buildMetadataFilterCondition(filter?: KnowledgeDocumentMetadata, filteringConditions?: TWFCase) {
        if (filteringConditions) {
            return buildMetadataCondition(filteringConditions)
        }

        const entries = Object.entries(filter ?? {})
        const params = entries.reduce<Record<string, string>>((acc, [key, value], index) => {
            acc[`metadataKey${index}`] = key
            acc[`metadataValue${index}`] = String(value)
            return acc
        }, {})

        return Raw(
            (alias) =>
                entries
                    .map(
                        (_, index) =>
                            `COALESCE((${alias})::jsonb ->> :metadataKey${index}, '') = :metadataValue${index}`
                    )
                    .join(' AND '),
            params
        )
    }

    private resolvePersistedChunkId(chunk: Pick<IKnowledgeDocumentChunk, 'id' | 'metadata'>) {
        const chunkId = chunk.metadata?.chunkId
        if (typeof chunkId === 'string' && chunkId) {
            return chunkId
        }
        return chunk.id
    }

    private mergeVectorSearchResults(results: [DocumentInterface, number][]) {
        const byChunkId = new Map<string, [DocumentInterface, number]>()
        results.forEach((result) => {
            const [doc, score] = result
            const chunkId = this.resolveChunkId(doc)
            const existing = byChunkId.get(chunkId)
            if (!existing || score < existing[1]) {
                byChunkId.set(chunkId, result)
            }
        })
        return [...byChunkId.values()].sort((left, right) => left[1] - right[1])
    }

    /**
     * Built-in knowledge base vector search
     *
     * @param kb Knowledgebase entity
     * @param query User question
     * @param k Client requested top K
     * @param filter Metadata filter
     * @param filtering_conditions Advanced filtering conditions
     */
    async similaritySearchWithScore(
        kb: IKnowledgebase,
        query: string,
        k?: number,
        filter?: KnowledgeDocumentMetadata,
        filtering_conditions?: TWFCase
    ): Promise<DocumentInterface<DocumentMetadata>[]> {
        const vectorStore = await this.knowledgebaseService.getActiveVectorStore(kb.id, true)
        const vectorTopK = k ?? kb.recall?.topK
        this.logger.debug(
            `SimilaritySearch question='${query}' kb='${kb.name}' in ai provider='${kb.copilotModel?.copilot?.modelProvider?.providerName}' and model='${vectorStore.embeddingModel}'`
        )
        let items: [DocumentInterface, number][]
        // Metadata can live either on imported documents or directly on agent-written chunks.
        if (!isEmpty(filter) || filtering_conditions) {
            const [documents, chunks] = await Promise.all([
                this.documentService.findAll({
                    where: {
                        knowledgebaseId: kb.id,
                        metadata: this.buildMetadataFilterCondition(filter, filtering_conditions)
                    },
                    select: {
                        id: true
                    }
                }),
                this.chunkService.findAll({
                    where: {
                        knowledgebaseId: kb.id,
                        metadata: this.buildMetadataFilterCondition(filter, filtering_conditions)
                    },
                    select: {
                        id: true,
                        metadata: true
                    }
                })
            ])
            if (documents.items.length === 0 && chunks.items.length === 0) {
                return []
            }
            const documentIds = documents.items
                .map((doc) => doc.id)
                .filter((id): id is string => typeof id === 'string' && !!id)
            const chunkIds = chunks.items
                .map((chunk) => this.resolvePersistedChunkId(chunk))
                .filter((id): id is string => typeof id === 'string' && !!id)
            const searches: Promise<[DocumentInterface, number][]>[] = []
            if (documentIds.length) {
                searches.push(
                    vectorStore.similaritySearchWithScore(query, vectorTopK, {
                        documentId: {
                            in: documentIds
                        }
                    })
                )
            }
            if (chunkIds.length) {
                searches.push(
                    vectorStore.similaritySearchWithScore(query, vectorTopK, {
                        chunkId: {
                            in: chunkIds
                        }
                    })
                )
            }
            items = this.mergeVectorSearchResults((await Promise.all(searches)).flat())
        } else {
            items = await vectorStore.similaritySearchWithScore(query, vectorTopK, filter)
        }
        const chunkMap = new Map<string, Document<ChunkMetadata>>()
        // Split into parent and child chunks
        const parentChunkIds = new Set<string>()
        const chunkIds: string[] = []
        // Parent chunks
        items.forEach(([doc, score]) => {
            doc.metadata.score = 1 - score
            chunkMap.set(doc.metadata.chunkId, doc as Document<ChunkMetadata>)
            if (doc.metadata.parentId) {
                parentChunkIds.add(doc.metadata.parentId)
            }
        })
        // Leaf chunks
        items.forEach(([doc, score]) => {
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
                        fileUrl: true
                    }
                }
            })
            chunks.forEach((chunk) => {
                const doc = chunkMap.get(chunk.metadata.chunkId)
                if (doc) {
                    chunk.metadata.score = doc.metadata.score
                    chunk.metadata.tokens = doc.metadata.tokens
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
                        fileUrl: true
                    }
                }
            })
            chunks.forEach((chunk) => {
                chunk.children.forEach((child) => {
                    const doc = chunkMap.get(child.metadata.chunkId)
                    if (doc) {
                        child.metadata.score = doc.metadata.score
                        child.metadata.tokens = doc.metadata.tokens
                        if (!chunk.metadata.score || chunk.metadata.score < doc.metadata.score) {
                            chunk.metadata.score = doc.metadata.score
                        }
                    }
                })
            })
            docs.push(...chunks)
        }

        const documents = docs.map((doc) => this.withDocumentMetadata(doc))
        // Rerank the documents if a rerank model is set
        if (kb.rerankModelId && documents.length > 0) {
            try {
                const rerankedDocs = await vectorStore.rerank(documents, query, {
                    topN: Math.min(documents.length, k ?? kb.recall?.topK)
                })
                return rerankedDocs.map(({ index, relevanceScore }) => {
                    return this.withDocumentMetadata(documents[index], { relevanceScore })
                })
            } catch (error) {
                throw new InternalServerErrorException(getPythonErrorMessage(error))
            }
        }

        return documents
    }
}
