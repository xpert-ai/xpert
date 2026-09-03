import { Document, DocumentInterface } from '@langchain/core/documents'
import {
    DocumentMetadata,
    IKnowledgebase,
    KnowledgeFilterErrorCode,
    KnowledgeFilterDiagnostics,
    KnowledgeFilterSources,
    KnowledgebaseTypeEnum,
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
    KnowledgeCandidateRetriever,
    KnowledgeRetrievalBatch,
    KnowledgeRetrievalRequest,
    LegacyWeightedFusion,
    VectorKnowledgeCandidateRetriever,
    withKnowledgeDocumentMetadata
} from '../../retrieval'

function getBatchDocuments(batch: KnowledgeRetrievalBatch): DocumentInterface<DocumentMetadata>[] {
    return batch.candidates.map(({ document }) => document)
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
        private readonly legacyWeightedFusion: LegacyWeightedFusion
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
        const mode = retrieval?.mode ?? kb.graphRag?.mode ?? 'vector'
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

    private hasFilterConfiguration(filters?: KnowledgeFilterSources, retrieval?: TKBRetrievalSettings) {
        return !!(
            filters?.fixed ||
            filters?.request ||
            filters?.dynamic ||
            retrieval?.filtering?.fixed ||
            retrieval?.filtering?.agent?.enabled
        )
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
