import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import { ImprovementProposalEntity } from '../entities'
import { learningProposalRow } from '../entities/evolution-row-guards'
import { tenantWhere } from '../application/evolution-store.helpers'
import type { ConfirmLearningProposalRequest } from '@xpert-ai/contracts'
import { ConflictException, Injectable } from '@nestjs/common'
import { EvolutionTargetProviderRegistry } from '@xpert-ai/plugin-sdk'
import { AgentEvolutionAnalystService, AgentEvolutionGovernanceService, AgentEvolutionStore } from '../application'
import type { EvolutionCommandContext } from '../application/agent-evolution-governance.service'

@Injectable()
export class CheckedProposalService {
    constructor(
        private readonly analyst: AgentEvolutionAnalystService,
        private readonly governance: AgentEvolutionGovernanceService,
        private readonly store: AgentEvolutionStore,
        private readonly providers: EvolutionTargetProviderRegistry,
        @InjectRepository(ImprovementProposalEntity) private readonly records: Repository<ImprovementProposalEntity>
    ) {}
    async create(ctx: EvolutionCommandContext, id: string, body: ConfirmLearningProposalRequest) {
        const check = await this.analyst.checkProposal(ctx, id)
        if (!check.snapshot || check.snapshot !== body.snapshot || !check.baseVersionId)
            throw new ConflictException('learning_review_changed')
        const [row] = await this.store.findLearningEvents(ctx, [id])
        const existing = await this.records.findOneBy({
            ...tenantWhere(ctx),
            targetId: row.targetId,
            requestId: 'PROP-REVIEW-' + check.snapshot
        })
        if (existing && existing.status !== 'draft') return learningProposalRow(existing).value
        const analysis = await this.analyst.diagnose(ctx, { strategyId: 'feedback_learning', seedEventId: id })
        const freshIds = new Set(analysis.diagnoses[0]?.eventIds)
        const cluster = analysis.clusters[0]
        if (
            cluster?.status !== 'proposal_ready' ||
            freshIds.size !== check.eventIds.length ||
            check.eventIds.some((eventId) => !freshIds.has(eventId))
        )
            throw new ConflictException('learning_review_changed')
        const target = this.providers.get(row.targetId, ctx.organizationId ?? undefined).descriptor
        return this.governance.createProposal(
            ctx,
            {
                targetId: row.targetId,
                scope: row.value.scope,
                strategyId: 'feedback_learning',
                eventIds: check.eventIds,
                title: body.title,
                changeHypothesis: body.changeHypothesis,
                problemStatement: body.problemStatement ?? row.value.predictionSummary,
                rootCause: analysis.diagnoses[0].rootCause,
                riskLevel: target.riskLevel
            },
            { seedId: id, snapshot: check.snapshot, baseVersionId: check.baseVersionId }
        )
    }
}
