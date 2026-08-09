import { Document, DocumentInterface } from '@langchain/core/documents'
import {
    DocumentMetadata,
    IKnowledgebase,
    IKnowledgeDocumentChunk,
    KnowledgeFilterErrorCode,
    KnowledgeFilterDiagnostics,
    KnowledgeFilterSources,
    KnowledgebaseTypeEnum,
    TKBRetrievalSettings,
    VectorTypeEnum
} from '@xpert-ai/contracts'
import { getErrorMessage, getPythonErrorMessage } from '@xpert-ai/server-common'
import { BadRequestException, Inject, InternalServerErrorException, Logger } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { ChunkMetadata, RequestContext } from '@xpert-ai/plugin-sdk'
import { isNil, sortBy } from 'lodash'
import { In, IsNull, Not, Raw } from 'typeorm'
import { t } from 'i18next'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { KnowledgeSearchQuery, KnowledgeSearchResult } from '../knowledge-search.query'
import { KnowledgeRetrievalLogService } from '../../logs'
import { KnowledgeDocumentChunkService } from '../../../knowledge-document/chunk/chunk.service'
import { KnowledgeGraphSearchQuery } from '../../../graphrag/queries'
import { TKnowledgeGraphSearchResult } from '../../../graphrag/types'
import { environment } from '@xpert-ai/server-config'
import {
    compileKnowledgeFilterToMilvus,
    compileKnowledgeFilterToPostgres,
    createKnowledgeGraphFilterScope,
    KnowledgeFilterValidationError,
    PreparedKnowledgeFilter,
    prepareKnowledgeFilter
} from '../../filter'

@QueryHandler(KnowledgeSearchQuery)
export class KnowledgeSearchQueryHandler implements IQueryHandler<KnowledgeSearchQuery> {
    private readonly logger = new Logger(KnowledgeSearchQueryHandler.name)

    @Inject(KnowledgeRetrievalLogService)
    private readonly retrievalLogService: KnowledgeRetrievalLogService

    @Inject(KnowledgeDocumentChunkService)
    private readonly chunkService: KnowledgeDocumentChunkService

    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly queryBus: QueryBus
    ) {}

    public async execute(command: KnowledgeSearchQuery): Promise<KnowledgeSearchResult> {
        const { knowledgebases, query, k, retrieval } = command.input
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
        const diagnostics: KnowledgeFilterDiagnostics[] = []
        const kbs = await Promise.all(
            _knowledgebases.map(async (kb) => {
                try {
                    let docs: DocumentInterface<DocumentMetadata>[] = []
                    let filterDiagnostics: KnowledgeFilterDiagnostics
                    if (kb.type === KnowledgebaseTypeEnum.External) {
                        if (this.hasFilterConfiguration(command.input.filters, retrieval)) {
                            throw new BadRequestException(
                                'Knowledge filter v2 is not supported by external knowledgebases.'
                            )
                        }
                        const { chunks } = await this.knowledgebaseService.searchExternalKnowledgebase(kb, query, topK)
                        docs = chunks.map(([doc, score]) => this.withDocumentMetadata(new Document(doc), { score }))
                        filterDiagnostics = {
                            filterVersion: 2,
                            filterStatus: 'not_applied',
                            hitCount: docs.length
                        }
                    } else {
                        const searchResult = await this.searchInternalKnowledgebase(
                            kb,
                            query,
                            {
                                tenantId,
                                organizationId
                            },
                            k,
                            command.input.filters,
                            command.input.variables,
                            retrieval
                        )
                        docs = searchResult.documents
                        filterDiagnostics = searchResult.diagnostics
                    }

                    const score = command.input.score ?? kb.recall?.score
                    if (!isNil(score)) {
                        docs = docs.filter((doc) => doc.metadata.score >= score)
                    }
                    filterDiagnostics.hitCount = docs.length
                    filterDiagnostics.retryableWithoutDynamic =
                        docs.length === 0 &&
                        !!filterDiagnostics.dynamicFilter &&
                        filterDiagnostics.filterStatus !== 'dynamic_fallback'

                    // Log the retrieval results
                    try {
                        await this.retrievalLogService.create({
                            query,
                            source: command.input.source,
                            knowledgebaseId: kb.id,
                            hitCount: docs.length,
                            requestId: command.input.id,
                            filterVersion: filterDiagnostics.filterVersion,
                            fixedFilter: filterDiagnostics.fixedFilter,
                            dynamicFilter: filterDiagnostics.dynamicFilter,
                            requestFilter: filterDiagnostics.requestFilter,
                            effectiveFilter: filterDiagnostics.effectiveFilter,
                            filterHash: filterDiagnostics.filterHash,
                            filterStatus: filterDiagnostics.filterStatus,
                            fallbackReason: filterDiagnostics.fallbackReason,
                            errorCode: filterDiagnostics.errorCode,
                            candidateDocumentCount: filterDiagnostics.candidateDocumentCount,
                            candidateChunkCount: filterDiagnostics.candidateChunkCount,
                            vectorBackend: filterDiagnostics.vectorBackend,
                            filterLatency: filterDiagnostics.filterLatency,
                            vectorLatency: filterDiagnostics.vectorLatency,
                            diagnostics: filterDiagnostics
                        })
                    } catch (error) {
                        this.logger.error(`Failed to log retrieval results: ${getPythonErrorMessage(error)}`)
                    }

                    return {
                        kb,
                        docs,
                        filterDiagnostics
                    }
                } catch (error) {
                    await this.logFailedRetrieval(kb, command, error)
                    throw error
                }
            })
        )

        kbs.forEach(({ docs, filterDiagnostics }) => {
            diagnostics.push(filterDiagnostics)
            documents.push(...docs)
        })

        return {
            documents: sortBy(documents, 'metadata.relevanceScore', 'metadata.score').reverse().slice(0, topK),
            diagnostics
        }
    }

    private async logFailedRetrieval(kb: IKnowledgebase, command: KnowledgeSearchQuery, error: unknown) {
        const diagnostics: KnowledgeFilterDiagnostics = {
            filterVersion: 2,
            fixedFilter: command.input.filters?.fixed ?? command.input.retrieval?.filtering?.fixed,
            requestFilter: command.input.filters?.request,
            dynamicFilter: command.input.filters?.dynamic,
            filterStatus: 'failed',
            errorCode: this.resolveFilterErrorCode(
                error,
                command.input.retrieval?.mode ?? kb.graphRag?.mode ?? 'vector'
            ),
            hitCount: 0,
            vectorBackend: environment.vectorStore,
            errors: [getErrorMessage(error)]
        }
        try {
            await this.retrievalLogService.create({
                query: command.input.query,
                source: command.input.source,
                knowledgebaseId: kb.id,
                hitCount: 0,
                requestId: command.input.id,
                filterVersion: diagnostics.filterVersion,
                fixedFilter: diagnostics.fixedFilter,
                requestFilter: diagnostics.requestFilter,
                dynamicFilter: diagnostics.dynamicFilter,
                filterStatus: diagnostics.filterStatus,
                errorCode: diagnostics.errorCode,
                vectorBackend: diagnostics.vectorBackend,
                diagnostics
            })
        } catch (logError) {
            this.logger.error(`Failed to log failed retrieval: ${getPythonErrorMessage(logError)}`)
        }
    }

    private resolveFilterErrorCode(
        error: unknown,
        retrievalMode: NonNullable<TKBRetrievalSettings['mode']>
    ): KnowledgeFilterErrorCode {
        if (error instanceof KnowledgeFilterValidationError) {
            const codes: Record<KnowledgeFilterValidationError['code'], KnowledgeFilterErrorCode> = {
                INVALID_FILTER: 'invalid_filter',
                UNKNOWN_FIELD: 'unknown_field',
                INVALID_OPERATOR: 'invalid_operator',
                INVALID_VALUE: 'invalid_value',
                MISSING_VARIABLE: 'missing_fixed_variable',
                FILTER_TOO_COMPLEX: 'filter_too_complex'
            }
            return codes[error.code]
        }
        if (retrievalMode === 'graph') return 'graph_search_failed'
        const message = getErrorMessage(error).toLowerCase()
        return message.includes('vector mode') ? 'unsupported_retrieval_mode' : 'unsupported_backend'
    }

    private async searchInternalKnowledgebase(
        kb: IKnowledgebase,
        query: string,
        context: {
            tenantId: string
            organizationId: string
        },
        k?: number,
        filters?: KnowledgeFilterSources,
        variables?: Record<string, unknown>,
        retrieval?: TKBRetrievalSettings
    ): Promise<{ documents: DocumentInterface<DocumentMetadata>[]; diagnostics: KnowledgeFilterDiagnostics }> {
        const filterStartedAt = Date.now()
        const prepared = prepareKnowledgeFilter({
            knowledgebase: kb,
            filters: {
                fixed: filters?.fixed ?? retrieval?.filtering?.fixed,
                request: filters?.request,
                dynamic: filters?.dynamic
            },
            variables,
            vectorBackend: environment.vectorStore
        })
        prepared.diagnostics.filterLatency = Date.now() - filterStartedAt
        const mode = retrieval?.mode ?? kb.graphRag?.mode ?? 'vector'
        const graphFilterScope = createKnowledgeGraphFilterScope({
            tenantId: context.tenantId,
            organizationId: context.organizationId,
            knowledgebaseId: kb.id,
            prepared
        })
        if (mode === 'graph') {
            const result = await this.queryBus.execute<KnowledgeGraphSearchQuery, TKnowledgeGraphSearchResult>(
                new KnowledgeGraphSearchQuery({
                    tenantId: context.tenantId,
                    organizationId: context.organizationId,
                    knowledgebase: kb,
                    query,
                    k,
                    retrieval,
                    graphRag: kb.graphRag,
                    filterScope: graphFilterScope
                })
            )
            if (result.failed) {
                throw new InternalServerErrorException(
                    result.error ??
                        t('server-ai:Error.GraphSearchFailed', {
                            defaultValue: 'GraphRAG search failed.'
                        })
                )
            }
            Object.assign(prepared.diagnostics, result.diagnostics, {
                graphBranchHitCount: result.docs.length
            })
            prepared.diagnostics.hitCount = result.docs.length
            return { documents: result.docs, diagnostics: prepared.diagnostics }
        }

        const vectorResult = await this.similaritySearchWithScore(kb, query, k, prepared, !!prepared.effective)
        const vectorDocs = vectorResult.documents
        if (mode !== 'hybrid') {
            return vectorResult
        }
        vectorResult.diagnostics.vectorBranchHitCount = vectorDocs.length

        const graphResult = await this.queryBus.execute<KnowledgeGraphSearchQuery, TKnowledgeGraphSearchResult>(
            new KnowledgeGraphSearchQuery({
                tenantId: context.tenantId,
                organizationId: context.organizationId,
                knowledgebase: kb,
                query,
                k,
                retrieval,
                graphRag: kb.graphRag,
                filterScope: graphFilterScope
            })
        )
        if (graphResult.failed) {
            this.logger.warn(`Hybrid GraphRAG failed for knowledgebase '${kb.id}', falling back to vector results`)
            Object.assign(vectorResult.diagnostics, graphResult.diagnostics)
            vectorResult.diagnostics.graphBranchHitCount = 0
            vectorResult.diagnostics.hybridGraphFallbackReason = graphResult.error ?? 'graph_search_failed'
            return vectorResult
        }
        Object.assign(vectorResult.diagnostics, graphResult.diagnostics, {
            graphBranchHitCount: graphResult.docs.length
        })

        const documents = await this.mergeHybridResults(
            kb,
            query,
            vectorDocs,
            graphResult.docs,
            k,
            retrieval?.graphWeight ?? kb.graphRag?.graphWeight ?? 0.35
        )
        vectorResult.diagnostics.hitCount = documents.length
        return { documents, diagnostics: vectorResult.diagnostics }
    }

    private hasFilterConfiguration(filters?: KnowledgeFilterSources, retrieval?: TKBRetrievalSettings) {
        return !!(
            filters?.fixed ||
            filters?.request ||
            filters?.dynamic ||
            retrieval?.filtering?.fixed ||
            retrieval?.filtering?.agent?.enabled
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

    /**
     * Built-in knowledge base vector search
     *
     * @param kb Knowledgebase entity
     * @param query User question
     * @param k Client requested top K
     * @param prepared Validated fixed/request/dynamic filter sources
     */
    async similaritySearchWithScore(
        kb: IKnowledgebase,
        query: string,
        k?: number,
        prepared?: PreparedKnowledgeFilter,
        filterConfigured = false
    ): Promise<{ documents: DocumentInterface<DocumentMetadata>[]; diagnostics: KnowledgeFilterDiagnostics }> {
        const vectorStore = await this.knowledgebaseService.getActiveVectorStore(kb.id, true)
        const vectorTopK = k ?? kb.recall?.topK ?? 10
        const diagnostics = prepared?.diagnostics ?? {
            filterVersion: 2,
            filterStatus: 'not_applied' as const,
            hitCount: 0,
            vectorBackend: environment.vectorStore
        }
        this.logger.debug(
            `SimilaritySearch question='${query}' kb='${kb.name}' in ai provider='${kb.copilotModel?.copilot?.modelProvider?.providerName}' and model='${vectorStore.embeddingModel}'`
        )
        let items: [DocumentInterface, number][]
        const vectorStartedAt = Date.now()
        if (environment.vectorStore === VectorTypeEnum.PGVECTOR) {
            const compiled = prepared?.effective
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
            const compiled = prepared?.effective
                ? compileKnowledgeFilterToMilvus(prepared.effective, prepared.registry)
                : { expression: '', values: {} }
            const relationalCompiled = prepared?.effective
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
        } else if (filterConfigured) {
            throw new BadRequestException(
                `Vector store '${environment.vectorStore}' does not support knowledge filter v2.`
            )
        } else {
            items = await vectorStore.similaritySearchWithScore(query, vectorTopK)
        }
        diagnostics.vectorLatency = Date.now() - vectorStartedAt
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
                chunk.children = chunk.children.filter((child) => {
                    if (child.metadata?.enabled === false) return false
                    const doc = chunkMap.get(child.metadata.chunkId)
                    if (!doc) return false
                    child.metadata.score = doc.metadata.score
                    child.metadata.tokens = doc.metadata.tokens
                    if (!chunk.metadata.score || chunk.metadata.score < doc.metadata.score) {
                        chunk.metadata.score = doc.metadata.score
                    }
                    return true
                })
                if (chunk.metadata?.enabled === false || chunk.document?.disabled || !chunk.children.length) return
                docs.push(chunk)
            })
        }

        const documents = docs.map((doc) => this.withDocumentMetadata(doc))
        // Rerank the documents if a rerank model is set
        if (kb.rerankModelId && documents.length > 0) {
            try {
                const rerankedDocs = await vectorStore.rerank(documents, query, {
                    topN: Math.min(documents.length, k ?? kb.recall?.topK)
                })
                const reranked = rerankedDocs.map(({ index, relevanceScore }) => {
                    return this.withDocumentMetadata(documents[index], { relevanceScore })
                })
                diagnostics.hitCount = reranked.length
                diagnostics.retryableWithoutDynamic = reranked.length === 0 && !!prepared?.sources.dynamic
                return { documents: reranked, diagnostics }
            } catch (error) {
                throw new InternalServerErrorException(getPythonErrorMessage(error))
            }
        }

        diagnostics.hitCount = documents.length
        diagnostics.retryableWithoutDynamic = documents.length === 0 && !!prepared?.sources.dynamic
        return { documents, diagnostics }
    }
}
