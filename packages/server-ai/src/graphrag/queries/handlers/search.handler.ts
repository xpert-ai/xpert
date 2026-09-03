import { DocumentInterface } from '@langchain/core/documents'
import { DocumentMetadata, IKnowledgebase, KnowledgeFilterDiagnostics, KnowledgeGraphStatus } from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { BadRequestException, Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { t } from 'i18next'
import { TDocChunkMetadata } from '../../../knowledge-document/types'
import { KnowledgeGraphFilterScope, KnowledgeGraphFilterScopeService } from '../../../knowledgebase/filter'
import { KnowledgebaseService } from '../../../knowledgebase/knowledgebase.service'
import { TKnowledgeGraphSearchInput, TKnowledgeGraphSearchResult } from '../../types'
import { KnowledgeGraphSearchQuery } from '../knowledge-graph-search.query'

const DEFAULT_ENTITY_TOP_K = 8
const DEFAULT_NEIGHBOR_HOPS = 1
const MAX_ENTITY_CANDIDATES = 500

function uniqByEntity(items: Array<{ entityId: string; score: number }>) {
    const seen = new Set<string>()
    return items.filter(({ entityId }) => {
        if (seen.has(entityId)) return false
        seen.add(entityId)
        return true
    })
}

@QueryHandler(KnowledgeGraphSearchQuery)
export class KnowledgeGraphSearchHandler implements IQueryHandler<KnowledgeGraphSearchQuery> {
    private readonly logger = new Logger(KnowledgeGraphSearchHandler.name)

    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly graphFilterScopeService: KnowledgeGraphFilterScopeService
    ) {}

    async execute({ input }: KnowledgeGraphSearchQuery): Promise<TKnowledgeGraphSearchResult> {
        if (
            input.knowledgebase.graphRag?.enabled !== true ||
            input.knowledgebase.graphStatus === KnowledgeGraphStatus.DISABLED
        ) {
            return { docs: [] }
        }

        const config = this.resolveRetrievalConfig(input)
        const diagnostics: Partial<KnowledgeFilterDiagnostics> = {}
        try {
            const scope = this.resolveFilterScope(input)
            const seedResult = await this.searchScopedEntities(
                input.knowledgebase,
                input.query,
                config.entityTopK,
                scope,
                {
                    xpertId: input.xpertId,
                    threadId: input.threadId
                }
            )
            const entityScores = seedResult.entityScores
            Object.assign(diagnostics, seedResult.diagnostics)
            if (!entityScores.length) {
                return { docs: [], diagnostics }
            }

            const expansionStartedAt = Date.now()
            const expanded = await this.graphFilterScopeService.expandEligibleSubgraph(
                entityScores.map(({ entityId }) => entityId),
                config.neighborHops,
                scope
            )
            const graphExpansionLatency = Date.now() - expansionStartedAt
            const chunkStartedAt = Date.now()
            const chunkResult = await this.graphFilterScopeService.resolveEligibleGraphChunks({
                scope,
                entityIds: expanded.entityIds,
                relationIds: expanded.relations.map(({ id }) => id),
                seedScores: entityScores,
                topK: input.k
            })
            const relationById = new Map(expanded.relations.map((relation) => [relation.id, relation]))

            return {
                docs: chunkResult.chunks.map((chunk) => {
                    const metadata: TDocChunkMetadata = {
                        ...(chunk.metadata ?? {}),
                        chunkId: chunk.chunkId,
                        graphScore: chunk.graphScore,
                        score: chunk.graphScore,
                        matchedEntities: chunk.matchedEntityIds,
                        relations: chunk.matchedRelationIds.map((relationId) => {
                            const relation = relationById.get(relationId)
                            return {
                                id: relationId,
                                type: relation?.type,
                                sourceEntityId: relation?.sourceEntityId,
                                targetEntityId: relation?.targetEntityId
                            }
                        })
                    }
                    const doc: DocumentInterface<DocumentMetadata> & {
                        id: string
                        document: {
                            id: string
                            name?: string | null
                            sourceType?: string | null
                            type?: string | null
                            category?: string | null
                            fileUrl?: string | null
                        }
                    } = {
                        id: chunk.chunkRowId,
                        pageContent: chunk.pageContent,
                        metadata,
                        document: {
                            id: chunk.documentId,
                            name: chunk.documentName,
                            sourceType: chunk.sourceType,
                            type: chunk.fileExtension,
                            category: chunk.category,
                            fileUrl: chunk.fileUrl
                        }
                    }
                    return doc
                }),
                diagnostics: {
                    ...diagnostics,
                    eligibleSeedEntityCount: entityScores.length,
                    eligibleRelationCount: expanded.relations.length,
                    eligibleMentionCount: chunkResult.eligibleMentionCount,
                    graphCandidateChunkCount: chunkResult.candidateChunkCount,
                    candidateDocumentCount: chunkResult.candidateDocumentCount,
                    candidateChunkCount: chunkResult.candidateChunkCount,
                    graphCandidateTruncated:
                        seedResult.diagnostics.graphCandidateTruncated || expanded.truncated || chunkResult.truncated,
                    graphExpansionLatency,
                    graphChunkLatency: Date.now() - chunkStartedAt
                }
            }
        } catch (error) {
            this.logger.warn(
                `GraphRAG search failed for knowledgebase '${input.knowledgebase.id}': ${getErrorMessage(error)}`
            )
            return {
                docs: [],
                failed: true,
                error: getErrorMessage(error),
                diagnostics
            }
        }
    }

    private resolveRetrievalConfig(input: TKnowledgeGraphSearchInput) {
        const entityTopK = input.retrieval?.entityTopK ?? input.graphRag?.entityTopK ?? DEFAULT_ENTITY_TOP_K
        const neighborHops = input.retrieval?.neighborHops ?? input.graphRag?.neighborHops ?? DEFAULT_NEIGHBOR_HOPS
        return {
            entityTopK: Math.max(1, Math.trunc(entityTopK)),
            neighborHops: Math.min(2, Math.max(1, Math.trunc(neighborHops)))
        }
    }

    private resolveFilterScope(input: TKnowledgeGraphSearchInput): KnowledgeGraphFilterScope {
        if (input.filterScope) return input.filterScope
        const tenantId = input.tenantId ?? input.knowledgebase.tenantId
        const organizationId = input.organizationId ?? input.knowledgebase.organizationId
        if (!tenantId || !organizationId) {
            throw new BadRequestException(
                t('server-ai:Error.GraphSearchScopeRequired', {
                    defaultValue: 'GraphRAG search requires tenant and organization scope.'
                })
            )
        }
        return {
            tenantId,
            organizationId,
            knowledgebaseId: input.knowledgebase.id,
            compiledPostgres: { sql: 'TRUE', parameters: [] },
            filterStatus: 'not_applied'
        }
    }

    private async searchScopedEntities(
        knowledgebase: IKnowledgebase,
        query: string,
        entityTopK: number,
        scope: KnowledgeGraphFilterScope,
        modelContext?: {
            xpertId?: string
            threadId?: string
        }
    ) {
        const target = Math.min(100, Math.max(1, Math.trunc(entityTopK)))
        const maximum = Math.min(MAX_ENTITY_CANDIDATES, Math.max(target, target * 16))
        let scanLimit = Math.min(maximum, Math.max(target, target * 4))
        let rounds = 0
        let globalCandidateCount = 0
        let seedLatency = 0
        let filterLatency = 0
        let entityScores: Array<{ entityId: string; score: number }> = []
        let exhausted = false
        let continueScanning: boolean
        const vectorStore = await this.knowledgebaseService.getGraphEntityVectorStore(
            knowledgebase.id,
            true,
            modelContext
        )

        do {
            rounds += 1
            const seedStartedAt = Date.now()
            const results = await vectorStore.similaritySearchWithScore(query, scanLimit, {
                kind: 'knowledge_graph_entity',
                knowledgebaseId: knowledgebase.id
            })
            seedLatency += Date.now() - seedStartedAt
            const scored = uniqByEntity(
                results
                    .map(([doc, score]) => ({
                        entityId: typeof doc.metadata?.graphEntityId === 'string' ? doc.metadata.graphEntityId : null,
                        score: 1 - score
                    }))
                    .filter((item): item is { entityId: string; score: number } => !!item.entityId)
            )
            globalCandidateCount = Math.max(globalCandidateCount, scored.length)
            const filterStartedAt = Date.now()
            const eligibleIds = new Set(
                await this.graphFilterScopeService.filterSeedEntities(
                    scored.map(({ entityId }) => entityId),
                    scope
                )
            )
            filterLatency += Date.now() - filterStartedAt
            entityScores = scored.filter(({ entityId }) => eligibleIds.has(entityId)).slice(0, target)
            exhausted = results.length < scanLimit
            continueScanning = entityScores.length < target && !exhausted && scanLimit < maximum
            if (continueScanning) scanLimit = Math.min(maximum, scanLimit * 2)
        } while (continueScanning)

        return {
            entityScores,
            diagnostics: {
                graphGlobalCandidateCount: globalCandidateCount,
                graphCandidateScanLimit: scanLimit,
                graphCandidateScanRounds: rounds,
                graphCandidateTruncated: !exhausted && scanLimit >= maximum && entityScores.length < target,
                graphSeedLatency: seedLatency,
                graphFilterLatency: filterLatency
            }
        }
    }
}
