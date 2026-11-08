import { Body, Controller, NotFoundException, Param, Post, UseGuards } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { InjectDataSource } from '@nestjs/typeorm'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { EvolutionTargetProviderRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { Permissions, PermissionGuard, UUIDValidationPipe } from '@xpert-ai/server-core'
import { DataSource, In } from 'typeorm'
import { AssertChatConversationAccessQuery } from '../../chat-conversation/queries/conversation-assert-access.query'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { AgentEvolutionGovernanceService, AgentEvolutionStore } from '../application'
import { changeError } from '../changes/change.errors'

const feedbackFields = { id: true, threadId: true, outputs: true, createdAt: true, completedAt: true } as const

@Controller(':feedbackKey')
@UseGuards(PermissionGuard)
@Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
export class EvolutionFeedbackController {
    constructor(
        @InjectDataSource() private readonly db: DataSource,
        private readonly queries: QueryBus,
        private readonly providers: EvolutionTargetProviderRegistry,
        private readonly store: AgentEvolutionStore,
        private readonly governance: AgentEvolutionGovernanceService
    ) {}

    private resolve(key: string) {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const actorId = RequestContext.currentUserId()
        if (!tenantId || !organizationId || !actorId) changeError('identity_mismatch')
        const matches = this.providers.list(organizationId).filter((provider) => provider.feedback?.routeKey === key)
        if (matches.length !== 1 || !matches[0].feedback) throw new NotFoundException('Feedback provider unavailable')
        return {
            identity: { tenantId, organizationId },
            actorId,
            targetId: matches[0].descriptor.targetId,
            feedback: matches[0].feedback
        }
    }

    @Post('candidates/:id/dataset')
    async dataset(@Param('feedbackKey') key: string, @Param('id') id: string) {
        const { identity, actorId, targetId, feedback } = this.resolve(key)
        const candidate = await this.store.findCandidate(identity, id)
        if (!candidate || candidate.targetId !== targetId) changeError('candidate_snapshot_mismatch')
        const proposal = await this.store.findProposal(
            identity,
            candidate.value.proposalId,
            candidate.value.proposalRevision
        )
        if (!proposal) changeError('change_not_found')
        const rows = await this.store.findLearningEvents(identity, proposal.value.evidenceEventIds)
        if (
            rows.length !== proposal.value.evidenceEventIds.length ||
            rows.some(
                ({ value }) =>
                    value.targetId !== targetId ||
                    value.reviewStatus === 'ignored' ||
                    value.scope.type !== candidate.value.targetScope.type ||
                    value.scope.key !== candidate.value.targetScope.key
            )
        )
            changeError('learning_evidence_gate_failed')
        const events = rows.map(({ value }) => value)
        const ids = events.flatMap((event) => (event.executionId ? [event.executionId] : []))
        const executions = await this.db
            .getRepository(XpertAgentExecution)
            .find({ where: { ...identity, type: feedback.executionType, id: In(ids) }, select: feedbackFields })
        return this.governance.createDatasetSnapshot(
            { ...identity, actorId, actorType: 'human', actorRole: RequestContext.currentRoleId() },
            {
                ...feedback.dataset(events, executions),
                targetId,
                scope: candidate.value.targetScope,
                datasetId: targetId
            }
        )
    }

    @Post('executions/:id/review')
    async review(
        @Param('feedbackKey') key: string,
        @Param('id', UUIDValidationPipe) id: string,
        @Body() input: unknown
    ) {
        const { identity, feedback } = this.resolve(key)
        const execution = await this.db
            .getRepository(XpertAgentExecution)
            .findOne({ where: { ...identity, id, type: feedback.executionType }, select: feedbackFields })
        if (!execution?.threadId) changeError('invalid_execution_context')
        await this.queries.execute(
            new AssertChatConversationAccessQuery({ threadId: execution.threadId, ...identity }, 'contribute')
        )
        return feedback.review(identity, execution, input)
    }
}
