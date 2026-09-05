import { Document, DocumentInterface } from '@langchain/core/documents'
import {
    DEFAULT_KNOWLEDGE_RRF_RANK_CONSTANT,
    DEFAULT_KNOWLEDGE_RRF_WEIGHTS,
    DocumentMetadata,
    IKnowledgebase,
    KnowledgeFilterErrorCode,
    KnowledgeFilterDiagnostics,
    KnowledgeFilterSources,
    KnowledgebaseTypeEnum,
    KnowledgeRetrievalMode,
    TKBFusionConfig,
    TKBRetrievalSettings
} from '@xpert-ai/contracts'
import { getErrorMessage, getPythonErrorMessage } from '@xpert-ai/server-common'
import { BadRequestException, Inject, InternalServerErrorException, Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { isNil, sortBy } from 'lodash'
import { In, IsNull, Not } from 'typeorm'
import { t } from 'i18next'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { KnowledgeSearchQuery, KnowledgeSearchResult } from '../knowledge-search.query'
import { KnowledgeRetrievalLogService } from '../../logs'
import { environment } from '@xpert-ai/server-config'
import { KnowledgeFilterValidationError, prepareKnowledgeFilter } from '../../filter'
import {
    GraphKnowledgeCandidateRetriever,
    KeywordKnowledgeCandidateRetriever,
    KnowledgeCandidateRetriever,
    KnowledgeRetrievalBatch,
    KnowledgeRetrievalFailure,
    KnowledgeRetrievalRequest,
    KnowledgeRetrieverSource,
    LegacyWeightedFusion,
    VectorKnowledgeCandidateRetriever,
    WeightedRrfFusion,
    withKnowledgeDocumentMetadata
} from '../../retrieval'
import { filterFAQNegativeMatches, materializeFAQResult } from '../../faq/faq-result'

function getBatchDocuments(batch: KnowledgeRetrievalBatch): DocumentInterface<DocumentMetadata>[] {
    return batch.candidates.map(({ document }) => document)
}

function resolveRetrievalMode(kb: IKnowledgebase, retrieval?: TKBRetrievalSettings): KnowledgeRetrievalMode {
    return retrieval?.mode ?? kb.recall?.mode ?? kb.graphRag?.mode ?? 'vector'
}

@QueryHandler(KnowledgeSearchQuery)
export class KnowledgeSearchQueryHandler implements IQueryHandler<KnowledgeSearchQuery> {
    private readonly logger = new Logger(KnowledgeSearchQueryHandler.name)

    @Inject(KnowledgeRetrievalLogService)
    private readonly retrievalLogService: KnowledgeRetrievalLogService

    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        @Inject(VectorKnowledgeCandidateRetriever)
        private readonly vectorRetriever: KnowledgeCandidateRetriever,
        @Inject(GraphKnowledgeCandidateRetriever)
        private readonly graphRetriever: KnowledgeCandidateRetriever,
        @Inject(KeywordKnowledgeCandidateRetriever)
        private readonly keywordRetriever: KnowledgeCandidateRetriever,
        private readonly legacyWeightedFusion: LegacyWeightedFusion,
        private readonly weightedRrfFusion: WeightedRrfFusion
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
                        docs = chunks.map(([doc, score]) => withKnowledgeDocumentMetadata(new Document(doc), { score }))
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
                                organizationId,
                                xpertId: command.input.xpertId,
                                threadId: command.input.threadId
                            },
                            k,
                            command.input.filters,
                            command.input.variables,
                            retrieval
                        )
                        docs = filterFAQNegativeMatches(searchResult.documents, query).map(materializeFAQResult)
                        filterDiagnostics = searchResult.diagnostics
                    }

                    const score = command.input.score ?? kb.recall?.score
                    const retrievalMode = resolveRetrievalMode(kb, retrieval)
                    if (!isNil(score) && retrievalMode !== 'keyword' && !this.usesWeightedRrf(kb, retrieval)) {
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
        const retrievalFailure = error instanceof KnowledgeRetrievalFailure ? error : undefined
        const previousDiagnostics = retrievalFailure?.diagnostics
        const errorMessage = getErrorMessage(error)
        const errors = [...(previousDiagnostics?.errors ?? [])]
        if (!errors.includes(errorMessage)) errors.push(errorMessage)
        const diagnostics: KnowledgeFilterDiagnostics = {
            ...previousDiagnostics,
            filterVersion: previousDiagnostics?.filterVersion ?? 2,
            fixedFilter:
                previousDiagnostics?.fixedFilter ??
                command.input.filters?.fixed ??
                command.input.retrieval?.filtering?.fixed,
            requestFilter: previousDiagnostics?.requestFilter ?? command.input.filters?.request,
            dynamicFilter: previousDiagnostics?.dynamicFilter ?? command.input.filters?.dynamic,
            filterStatus: 'failed',
            errorCode:
                retrievalFailure?.errorCode ??
                this.resolveFilterErrorCode(error, resolveRetrievalMode(kb, command.input.retrieval)),
            hitCount: 0,
            vectorBackend: previousDiagnostics?.vectorBackend ?? environment.vectorStore,
            errors
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
        if (retrievalMode === 'keyword') return 'keyword_query_failed'
        const message = getErrorMessage(error).toLowerCase()
        return message.includes('vector mode') ? 'unsupported_retrieval_mode' : 'unsupported_backend'
    }

    private async searchInternalKnowledgebase(
        kb: IKnowledgebase,
        query: string,
        context: {
            tenantId: string
            organizationId: string
            xpertId?: string
            threadId?: string
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
        const mode = resolveRetrievalMode(kb, retrieval)
        const request: KnowledgeRetrievalRequest = {
            knowledgebase: kb,
            query,
            k,
            retrieval,
            scope: {
                tenantId: context.tenantId,
                organizationId: context.organizationId
            },
            modelContext: {
                xpertId: context.xpertId,
                threadId: context.threadId
            },
            preparedFilter: prepared
        }
        if (mode === 'graph') {
            const result = await this.graphRetriever.retrieve(request)
            if (result.failed) {
                throw new InternalServerErrorException(
                    result.error ??
                        t('server-ai:Error.GraphSearchFailed', {
                            defaultValue: 'GraphRAG search failed.'
                        })
                )
            }
            const graphDocuments = getBatchDocuments(result)
            Object.assign(prepared.diagnostics, result.diagnostics, {
                graphBranchHitCount: graphDocuments.length
            })
            prepared.diagnostics.hitCount = graphDocuments.length
            return { documents: graphDocuments, diagnostics: prepared.diagnostics }
        }

        if (mode === 'keyword') {
            const result = await this.keywordRetriever.retrieve(request)
            const keywordDocuments = getBatchDocuments(result)
            Object.assign(prepared.diagnostics, result.diagnostics, {
                keywordBranchHitCount: keywordDocuments.length
            })
            if (result.failed) {
                const errorCode = this.resolveRetrievalBatchErrorCode(result)
                prepared.diagnostics.filterStatus = 'failed'
                prepared.diagnostics.errorCode = errorCode
                prepared.diagnostics.hitCount = 0
                throw new KnowledgeRetrievalFailure(
                    result.source,
                    errorCode,
                    prepared.diagnostics,
                    result.error ?? 'Keyword retrieval failed.'
                )
            }
            prepared.diagnostics.hitCount = keywordDocuments.length
            return { documents: keywordDocuments, diagnostics: prepared.diagnostics }
        }

        if (mode === 'hybrid' && this.usesWeightedRrf(kb, retrieval)) {
            return this.searchWithWeightedRrf(request)
        }

        const vectorResult = await this.vectorRetriever.retrieve(request)
        const vectorDocs = getBatchDocuments(vectorResult)
        if (mode !== 'hybrid') {
            return { documents: vectorDocs, diagnostics: vectorResult.diagnostics }
        }
        vectorResult.diagnostics.vectorBranchHitCount = vectorDocs.length

        const graphResult = await this.graphRetriever.retrieve(request)
        if (graphResult.failed) {
            this.logger.warn(`Hybrid GraphRAG failed for knowledgebase '${kb.id}', falling back to vector results`)
            Object.assign(vectorResult.diagnostics, graphResult.diagnostics)
            vectorResult.diagnostics.graphBranchHitCount = 0
            vectorResult.diagnostics.hybridGraphFallbackReason = graphResult.error ?? 'graph_search_failed'
            return { documents: vectorDocs, diagnostics: vectorResult.diagnostics }
        }
        const graphDocuments = getBatchDocuments(graphResult)
        Object.assign(vectorResult.diagnostics, graphResult.diagnostics, {
            graphBranchHitCount: graphDocuments.length
        })

        const merged = this.legacyWeightedFusion.fuse([vectorResult, graphResult], {
            graphWeight: retrieval?.graphWeight ?? kb.graphRag?.graphWeight ?? 0.35
        })
        const documents = await this.finalizeHybridResults(kb, query, merged, k, request.modelContext)
        vectorResult.diagnostics.hitCount = documents.length
        return { documents, diagnostics: vectorResult.diagnostics }
    }

    private async searchWithWeightedRrf(
        request: KnowledgeRetrievalRequest
    ): Promise<{ documents: DocumentInterface<DocumentMetadata>[]; diagnostics: KnowledgeFilterDiagnostics }> {
        const fusion = this.resolveFusionConfig(request.knowledgebase, request.retrieval)
        const weights: Record<KnowledgeRetrieverSource, number> = {
            vector: fusion?.weights?.vector ?? DEFAULT_KNOWLEDGE_RRF_WEIGHTS.vector,
            graph: fusion?.weights?.graph ?? DEFAULT_KNOWLEDGE_RRF_WEIGHTS.graph,
            keyword: fusion?.weights?.keyword ?? DEFAULT_KNOWLEDGE_RRF_WEIGHTS.keyword
        }
        this.validateRrfWeights(weights)

        const retrievers: readonly KnowledgeCandidateRetriever[] = [
            this.vectorRetriever,
            this.graphRetriever,
            this.keywordRetriever
        ]
        const batches = await Promise.all(
            retrievers
                .filter((retriever) => weights[retriever.source] > 0)
                .map((retriever) => retriever.retrieve(request))
        )
        const branchHitCounts: Record<KnowledgeRetrieverSource, number> = {
            vector: 0,
            graph: 0,
            keyword: 0
        }
        const diagnostics = request.preparedFilter.diagnostics
        for (const batch of batches) {
            Object.assign(diagnostics, batch.diagnostics)
            branchHitCounts[batch.source] = batch.candidates.length
        }
        Object.assign(diagnostics, {
            vectorBranchHitCount: branchHitCounts.vector,
            graphBranchHitCount: branchHitCounts.graph,
            keywordBranchHitCount: branchHitCounts.keyword,
            fusionMode: 'weighted_rrf' as const
        })

        let merged: DocumentInterface<DocumentMetadata>[]
        try {
            merged = this.weightedRrfFusion.fuse(batches, {
                rankConstant: fusion?.rankConstant ?? DEFAULT_KNOWLEDGE_RRF_RANK_CONSTANT,
                weights
            })
        } catch (error) {
            const failedBatch = batches.find(({ failed }) => failed)
            if (!failedBatch) throw error
            const errorCode = this.resolveRetrievalBatchErrorCode(failedBatch)
            diagnostics.filterStatus = 'failed'
            diagnostics.errorCode = errorCode
            diagnostics.hitCount = 0
            throw new KnowledgeRetrievalFailure(failedBatch.source, errorCode, diagnostics, getErrorMessage(error))
        }
        const documents = await this.finalizeHybridResults(
            request.knowledgebase,
            request.query,
            merged,
            request.k,
            request.modelContext
        )
        diagnostics.hitCount = documents.length
        return { documents, diagnostics }
    }

    private validateRrfWeights(weights: Readonly<Record<KnowledgeRetrieverSource, number>>) {
        const sources: readonly KnowledgeRetrieverSource[] = ['vector', 'graph', 'keyword']
        for (const source of sources) {
            const weight = weights[source]
            if (!Number.isFinite(weight) || weight < 0) {
                const defaultValue = `RRF weight for source "${source}" must be a finite non-negative number`
                throw new RangeError(
                    t('server-ai:Error.RrfWeightInvalid', {
                        source,
                        defaultValue
                    }) || defaultValue
                )
            }
        }

        if (!sources.some((source) => weights[source] > 0)) {
            const defaultValue = 'RRF requires at least one retrieval source with a positive weight.'
            throw new BadRequestException(
                t('server-ai:Error.RrfPositiveWeightRequired', {
                    defaultValue
                }) || defaultValue
            )
        }
    }

    private resolveRetrievalBatchErrorCode(batch: KnowledgeRetrievalBatch): KnowledgeFilterErrorCode {
        if (batch.source === 'keyword') {
            return batch.diagnostics.keywordIndexStatus === 'missing' ? 'keyword_index_missing' : 'keyword_query_failed'
        }
        if (batch.source === 'graph') return 'graph_search_failed'
        return 'unsupported_backend'
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

    private usesWeightedRrf(kb: IKnowledgebase, retrieval?: TKBRetrievalSettings) {
        const mode = resolveRetrievalMode(kb, retrieval)
        const fusion = this.resolveFusionConfig(kb, retrieval)
        return kb.type !== KnowledgebaseTypeEnum.External && mode === 'hybrid' && fusion?.mode === 'weighted_rrf'
    }

    private resolveFusionConfig(kb: IKnowledgebase, retrieval?: TKBRetrievalSettings): TKBFusionConfig | undefined {
        const knowledgebaseFusion = kb.recall?.fusion
        const retrievalFusion = retrieval?.fusion
        if (!knowledgebaseFusion && !retrievalFusion) return undefined
        return {
            ...knowledgebaseFusion,
            ...retrievalFusion,
            weights:
                knowledgebaseFusion?.weights || retrievalFusion?.weights
                    ? {
                          ...knowledgebaseFusion?.weights,
                          ...retrievalFusion?.weights
                      }
                    : undefined
        }
    }

    private async finalizeHybridResults(
        kb: IKnowledgebase,
        query: string,
        merged: DocumentInterface<DocumentMetadata>[],
        k?: number,
        modelContext?: {
            xpertId?: string
            threadId?: string
        }
    ) {
        if (kb.rerankModelId && merged.length > 0) {
            try {
                const vectorStore = await this.knowledgebaseService.getActiveVectorStore(kb.id, true, modelContext)
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
}
