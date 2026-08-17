import { IKnowledgebase, KnowledgeGraphStatus } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { KnowledgeGraphEntitySearchQuery, KnowledgeGraphViewQuery } from '../../../graphrag/queries'
import {
    createKnowledgeGraphFilterScope,
    KnowledgeGraphFilterScope,
    KnowledgeGraphFilterScopeService,
    prepareKnowledgeFilter
} from '../../filter'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { KnowledgeGraphExploreQuery } from '../knowledge-graph-explore.query'

type GraphEvidence = Awaited<ReturnType<KnowledgebaseService['listStructuredGraphEvidence']>>[number]

@QueryHandler(KnowledgeGraphExploreQuery)
export class KnowledgeGraphExploreHandler implements IQueryHandler<KnowledgeGraphExploreQuery> {
    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly graphFilterScopeService: KnowledgeGraphFilterScopeService,
        private readonly queryBus: QueryBus
    ) {}

    async execute(query: KnowledgeGraphExploreQuery) {
        const { input } = query
        const tenantId = input.tenantId ?? RequestContext.currentTenantId()
        const organizationId = input.organizationId ?? RequestContext.getOrganizationId()
        const result = await this.knowledgebaseService.findAll({
            where: {
                id: input.knowledgebaseId,
                tenantId,
                organizationId
            }
        })
        const knowledgebase = result.items[0]
        if (!knowledgebase) {
            throw new NotFoundException(`Knowledgebase '${input.knowledgebaseId}' was not found.`)
        }
        if (!knowledgebase.graphRag?.enabled || knowledgebase.graphStatus === KnowledgeGraphStatus.DISABLED) {
            throw new BadRequestException('GraphRAG is not enabled for this knowledgebase.')
        }

        const prepared = prepareKnowledgeFilter({
            knowledgebase,
            filters: input.filters,
            variables: input.variables
        })
        const scope = createKnowledgeGraphFilterScope({
            tenantId,
            organizationId,
            knowledgebaseId: knowledgebase.id,
            prepared
        })
        const context = {
            knowledgebase,
            tenantId,
            organizationId,
            xpertId: input.xpertId,
            threadId: input.threadId,
            scope,
            fixed: !!prepared.sources.fixed,
            filterStatus: prepared.diagnostics.filterStatus,
            fallbackReason: prepared.diagnostics.fallbackReason
        }

        switch (input.action) {
            case 'search':
                return this.search(input.query, input.take, context)
            case 'neighbors':
                return this.neighbors(input.entityId, input.query, input.depth, input.take, context)
            case 'evidence':
                return this.evidence(input.entityId, input.query, input.take, context)
        }
    }

    private async search(search: string | undefined, requestedTake: number | undefined, context: ExplorationContext) {
        if (!search?.trim()) throw new BadRequestException("Graph action 'search' requires query.")
        const take = clampTake(requestedTake, 10, 20)
        const candidateTake = Math.min(100, take * 8)
        const candidates = await this.queryBus.execute(
            new KnowledgeGraphEntitySearchQuery({
                knowledgebase: context.knowledgebase,
                query: search.trim(),
                take: candidateTake,
                xpertId: context.xpertId,
                threadId: context.threadId
            })
        )
        const eligibleIds = new Set(
            await this.graphFilterScopeService.filterSeedEntities(
                candidates.map(({ entity }) => entity.id),
                context.scope
            )
        )
        const eligibleCandidates = candidates.filter(({ entity }) => eligibleIds.has(entity.id))
        const evidence = await this.knowledgebaseService.listStructuredGraphEvidence(
            context.knowledgebase.id,
            context.tenantId,
            context.organizationId,
            context.scope.compiledPostgres,
            {
                entityIds: eligibleCandidates.map(({ entity }) => entity.id),
                take: 200
            }
        )
        const evidenceByEntity = groupEvidence(evidence, 'entityId')
        const entities = eligibleCandidates
            .filter(({ entity }) => evidenceByEntity.has(entity.id))
            .slice(0, take)
            .map(({ entity, score }) => ({
                id: entity.id,
                name: entity.name,
                type: entity.type,
                score,
                evidenceCount: evidenceByEntity.get(entity.id)?.length ?? 0,
                sampleEvidence: normalizeEvidence(evidenceByEntity.get(entity.id)?.slice(0, 2) ?? []),
                ...(!context.fixed
                    ? {
                          description: entity.description ?? undefined,
                          summary: entity.summary ?? undefined,
                          aliases: entity.aliases ?? undefined,
                          mentionCount: entity.mentionCount ?? 0,
                          confidence: entity.confidence ?? undefined
                      }
                    : {})
            }))
        return {
            action: 'search' as const,
            query: search.trim(),
            entities,
            retrievalHints: buildRetrievalHints(
                search,
                entities.map(({ name }) => name)
            ),
            filterStatus: context.filterStatus,
            fallbackReason: context.fallbackReason,
            truncated: candidates.length >= candidateTake
        }
    }

    private async neighbors(
        entityId: string | undefined,
        originalQuery: string | undefined,
        requestedDepth: number | undefined,
        requestedTake: number | undefined,
        context: ExplorationContext
    ) {
        if (!entityId) throw new BadRequestException("Graph action 'neighbors' requires entityId.")
        const depth = Math.min(2, Math.max(1, Math.trunc(requestedDepth ?? 1)))
        const take = clampTake(requestedTake, 30, 80)
        const eligibleSeedIds = await this.graphFilterScopeService.filterSeedEntities([entityId], context.scope)
        if (!eligibleSeedIds.length) {
            throw new NotFoundException(`Knowledge graph entity '${entityId}' was not found.`)
        }
        const expansion = await this.graphFilterScopeService.expandEligibleSubgraph([entityId], depth, context.scope, {
            maxEntities: take,
            maxRelations: take
        })
        const view = await this.queryBus.execute(
            new KnowledgeGraphViewQuery({
                knowledgebaseId: context.knowledgebase.id,
                query: { focusEntityId: entityId, depth, take, visibility: 'active' }
            })
        )
        const entityIds = new Set(expansion.entityIds)
        const relationIds = new Set(expansion.relations.map(({ id }) => id))
        const nodes = view.visualization.nodes.filter(({ id }) => entityIds.has(id))
        const edges = view.visualization.edges.filter(({ id }) => relationIds.has(id))
        if (!nodes.some((node) => node.id === entityId)) {
            throw new NotFoundException(`Knowledge graph entity '${entityId}' was not found.`)
        }
        const evidence = await this.knowledgebaseService.listStructuredGraphEvidence(
            context.knowledgebase.id,
            context.tenantId,
            context.organizationId,
            context.scope.compiledPostgres,
            {
                entityIds: nodes.map(({ id }) => id),
                relationIds: edges.map(({ id }) => id),
                take: 200
            }
        )
        const evidenceByEntity = groupEvidence(evidence, 'entityId')
        const evidenceByRelation = groupEvidence(evidence, 'relationId')
        const allowedEdges = edges.filter((edge) => evidenceByRelation.has(edge.id))
        const endpointIds = new Set(allowedEdges.flatMap((edge) => [edge.source, edge.target]))
        const allowedNodes = nodes.filter((node) => evidenceByEntity.has(node.id) || endpointIds.has(node.id))
        return {
            action: 'neighbors' as const,
            seedEntityId: entityId,
            depth,
            nodes: allowedNodes.map((node) => ({
                id: node.id,
                name: node.name,
                type: node.type,
                evidenceCount: evidenceByEntity.get(node.id)?.length ?? 0
            })),
            edges: allowedEdges.map((edge) => ({
                id: edge.id,
                sourceEntityId: edge.source,
                targetEntityId: edge.target,
                type: edge.type,
                evidenceCount: evidenceByRelation.get(edge.id)?.length ?? 0,
                sampleEvidence: normalizeEvidence(evidenceByRelation.get(edge.id)?.slice(0, 1) ?? [])
            })),
            retrievalHints: buildRetrievalHints(
                originalQuery,
                allowedNodes.map(({ name }) => name)
            ),
            filterStatus: context.filterStatus,
            fallbackReason: context.fallbackReason,
            truncated: expansion.truncated || view.visualization.totalNodes >= take
        }
    }

    private async evidence(
        entityId: string | undefined,
        originalQuery: string | undefined,
        requestedTake: number | undefined,
        context: ExplorationContext
    ) {
        if (!entityId) throw new BadRequestException("Graph action 'evidence' requires entityId.")
        const eligibleSeedIds = await this.graphFilterScopeService.filterSeedEntities([entityId], context.scope)
        if (!eligibleSeedIds.length) {
            throw new NotFoundException(`Knowledge graph entity '${entityId}' was not found.`)
        }
        const view = await this.queryBus.execute(
            new KnowledgeGraphViewQuery({
                knowledgebaseId: context.knowledgebase.id,
                query: { focusEntityId: entityId, depth: 0, take: 1, visibility: 'active' }
            })
        )
        const entity = view.visualization.nodes.find((node) => node.id === entityId)
        if (!entity) throw new NotFoundException(`Knowledge graph entity '${entityId}' was not found.`)
        const take = clampTake(requestedTake, 12, 30)
        const evidence = await this.knowledgebaseService.listStructuredGraphEvidence(
            context.knowledgebase.id,
            context.tenantId,
            context.organizationId,
            context.scope.compiledPostgres,
            { entityIds: [entityId], take }
        )
        return {
            action: 'evidence' as const,
            entity: { id: entity.id, name: entity.name, type: entity.type },
            evidence: normalizeEvidence(evidence),
            retrievalHints: buildRetrievalHints(originalQuery, [entity.name]),
            filterStatus: context.filterStatus,
            fallbackReason: context.fallbackReason,
            truncated: evidence.length >= take
        }
    }
}

type ExplorationContext = {
    knowledgebase: IKnowledgebase
    tenantId: string
    organizationId: string
    xpertId?: string
    threadId?: string
    scope: KnowledgeGraphFilterScope
    fixed: boolean
    filterStatus: 'not_applied' | 'applied' | 'dynamic_fallback' | 'failed'
    fallbackReason?: 'invalid_dynamic_filter'
}

function groupEvidence(evidence: GraphEvidence[], key: 'entityId' | 'relationId') {
    const grouped = new Map<string, GraphEvidence[]>()
    for (const item of evidence) {
        const id = item[key]
        if (id) grouped.set(id, [...(grouped.get(id) ?? []), item])
    }
    return grouped
}

function normalizeEvidence(evidence: GraphEvidence[]) {
    return evidence.map((item) => ({
        chunkId: item.chunkId,
        documentId: item.documentId,
        documentName: item.documentName,
        folderPath: item.folderPath,
        quote: item.quote?.slice(0, 1000) ?? undefined,
        confidence: item.confidence ?? undefined
    }))
}

function buildRetrievalHints(originalQuery: string | undefined, terms: string[]) {
    const uniqueTerms = [...new Set(terms.filter(Boolean))].slice(0, 12)
    return {
        terms: uniqueTerms,
        suggestedRetrievalQuery: [originalQuery?.trim(), ...uniqueTerms].filter(Boolean).join(' '),
        nextStep:
            'Continue graph exploration when relationships are still uncertain; otherwise call the knowledge Retriever with suggestedRetrievalQuery.'
    }
}

function clampTake(value: number | undefined, fallback: number, maximum: number) {
    return Math.min(maximum, Math.max(1, Math.trunc(value ?? fallback)))
}
