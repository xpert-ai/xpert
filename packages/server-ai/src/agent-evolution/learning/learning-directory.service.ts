import type {
    EvolutionLearningPage,
    EvolutionLearningQuery,
    LearningProposalRow,
    LearningReviewRow,
    ImprovementProposal,
    LearningEvent
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, type ObjectLiteral, type SelectQueryBuilder } from 'typeorm'
import { applyEvolutionSearch } from '../application/evolution-search'
import {
    applyOrganizationScope,
    normalizePage,
    page,
    type EvolutionTenantScope
} from '../application/evolution-store.helpers'
import { EvolutionTargetEntity, ImprovementProposalEntity, LearningEventEntity } from '../entities'

// All correlated lookups must use the same tenant and organization as the outer row.
const sameOwner = (inner: string) =>
    `${inner}."tenantId" = item."tenantId" AND ${inner}."organizationId" IS NOT DISTINCT FROM item."organizationId" AND ${inner}."targetId" = item."targetId"`
const citations = `FROM agent_evolution_proposal ref WHERE ${sameOwner('ref')} AND ref.value->>'sourceKind' = 'learning_events' AND (ref.value->'evidenceEventIds')::jsonb ? item."eventId"`

@Injectable()
export class LearningDirectoryService {
    constructor(@InjectDataSource() private readonly db: DataSource) {}

    async events(
        scope: EvolutionTenantScope,
        filters: EvolutionLearningQuery
    ): Promise<EvolutionLearningPage<LearningReviewRow>> {
        const query = this.db.getRepository(LearningEventEntity).createQueryBuilder('item')
        this.scope(query, scope, filters)
        const scopeTotal = await query.getCount()
        if (filters.eventId) query.andWhere('item.eventId = :eventId', { eventId: filters.eventId })
        if (filters.proposalId) {
            const revision = filters.revision ? ' AND ref.revision = :revision' : ''
            query.andWhere(`EXISTS (SELECT 1 ${citations} AND ref."proposalId" = :proposalId ${revision})`, filters)
        }
        if (filters.status)
            query.andWhere("COALESCE(item.value->>'reviewStatus', 'pending') = :status", { status: filters.status })
        if (filters.corrected)
            query.andWhere(
                `EXISTS (SELECT 1 FROM jsonb_array_elements_text((target.descriptor->'feedbackVocabulary'->'correctionReasons')::jsonb) code WHERE (item.value->'reasonCodes')::jsonb ? code)`
            )
        if (filters.grouped)
            query.andWhere(
                `EXISTS (SELECT 1 FROM agent_evolution_event_cluster g WHERE ${sameOwner('g')} AND (g.value->'eventIds')::jsonb ? item."eventId")`
            )
        applyEvolutionSearch(query, filters.search, [
            'item.eventId',
            'item.targetId',
            "item.value->>'subjectRef'",
            "item.value->>'reasonCodes'",
            "item.value->>'executionId'",
            "(SELECT string_agg(v.label::text, ' ') FROM jsonb_each((target.descriptor->'feedbackVocabulary'->'reasons')::jsonb) v(code,label) WHERE (item.value->'reasonCodes')::jsonb ? v.code)",
            "(target.descriptor->'feedbackVocabulary'->'values')->>(item.value->>'predictionSummary')",
            "(target.descriptor->'feedbackVocabulary'->'values')->>(item.value->>'finalOutcomeSummary')",
            "item.value->>'predictionSummary'",
            "item.value->>'finalOutcomeSummary'",
            "target.descriptor->>'displayName'",
            "target.descriptor->>'label'"
        ])
        const pagination = normalizePage(filters)
        const total = await query.getCount()
        const rows = await query
            .select('item.value', 'event')
            .addSelect(`(SELECT count(*) ${citations})`, 'citations')
            .orderBy('item.createdAt', 'DESC')
            .addOrderBy('item.eventId', 'ASC')
            .offset(pagination.skip)
            .limit(pagination.pageSize)
            .getRawMany<{ event: LearningEvent; citations: string }>()
        return {
            ...page(
                rows.map((row) => ({ event: row.event, proposalCount: Number(row.citations) })),
                total,
                pagination
            ),
            scopeTotal
        }
    }

    async proposals(
        scope: EvolutionTenantScope,
        filters: EvolutionLearningQuery
    ): Promise<EvolutionLearningPage<LearningProposalRow>> {
        const query = this.db.getRepository(ImprovementProposalEntity).createQueryBuilder('item')
        this.scope(query, scope, filters)
        query.andWhere("item.value->>'sourceKind' = 'learning_events'")
        const scopeTotal = await query.getCount()
        if (filters.proposalId) query.andWhere('item.proposalId = :proposalId', { proposalId: filters.proposalId })
        if (filters.revision) query.andWhere('item.revision = :revision', { revision: filters.revision })
        if (filters.eventId)
            query.andWhere("(item.value->'evidenceEventIds')::jsonb ? :eventId", { eventId: filters.eventId })
        if (filters.status) query.andWhere('item.status = :status', { status: filters.status })
        applyEvolutionSearch(query, filters.search, [
            'item.proposalId',
            'item.targetId',
            "item.value->>'title'",
            "target.descriptor->>'label'"
        ])
        const pagination = normalizePage(filters)
        const total = await query.getCount()
        const rows = await query
            .select('item.value', 'proposal')
            .addSelect(
                `(SELECT c."candidateId" FROM agent_evolution_candidate c WHERE ${sameOwner('c')} AND c.value->>'proposalId' = item."proposalId" AND c.value->>'proposalRevision' = item.revision::text ORDER BY c."createdAt" DESC, c."candidateId" LIMIT 1)`,
                'candidateId'
            )
            .orderBy('item.createdAt', 'DESC')
            .addOrderBy('item.proposalId', 'ASC')
            .addOrderBy('item.revision', 'DESC')
            .offset(pagination.skip)
            .limit(pagination.pageSize)
            .getRawMany<{ proposal: ImprovementProposal; candidateId: string | null }>()
        return {
            ...page(
                rows.map(({ proposal, candidateId }) => ({ proposal, candidateId: candidateId ?? undefined })),
                total,
                pagination
            ),
            scopeTotal
        }
    }

    private scope<T extends ObjectLiteral>(
        query: SelectQueryBuilder<T>,
        scope: EvolutionTenantScope,
        filters: EvolutionLearningQuery
    ) {
        query
            .leftJoin(EvolutionTargetEntity, 'target', sameOwner('target'))
            .where('item.tenantId = :tenantId', { tenantId: scope.tenantId })
        applyOrganizationScope(query, scope, 'item')
        if (filters.targetId) query.andWhere('item.targetId = :targetId', { targetId: filters.targetId })
        if (!filters.includeFixtures) query.andWhere("target.descriptor->>'targetType' IS DISTINCT FROM 'test_fixture'")
    }
}
