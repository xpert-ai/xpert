// Invariants: only a signed-in human Project manager may raise a ceiling. Authorization is rechecked
// on the lock-owning connection; one idempotent audit event changes no work, decisions or usage.
import { ForbiddenException, Injectable } from '@nestjs/common'
import { UserType, type ProjectPipelineModelBudgetIncrease } from '@xpert-ai/contracts'
import { RequestContext, type ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { DataSource } from 'typeorm'
import { t } from 'i18next'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import { ProjectPipelineEventEntity, ProjectPipelineInstanceEntity } from '../persistence/pipeline.entity'
import { pipelineDigest, pipelineIdentity } from '../persistence/pipeline-identity'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'
import { lockPipelineProject, managedAudit } from '../runtime/pipeline-transaction'
import { pipelineModelBudgetPolicy } from './pipeline-model-budget-policy'
import { pipelineModelBudgetTotals } from './pipeline-model-budget.store'

export function assertPipelineBudgetHuman(context: ProjectPipelineContext) {
    if (
        !RequestContext.currentUserId() ||
        RequestContext.currentApiPrincipal() ||
        RequestContext.currentUser()?.type === UserType.COMMUNICATION ||
        RequestContext.currentUserId() !== context.actor.userId ||
        RequestContext.currentTenantId() !== context.actor.tenantId ||
        (RequestContext.getOrganizationId() ?? null) !== (context.actor.organizationId ?? null)
    )
        throw new ForbiddenException({
            code: 'MODEL_BUDGET_HUMAN_MANAGER_REQUIRED',
            message: t('server-ai:Error.ProjectPipelineBudgetHumanManagerRequired')
        })
}

@Injectable()
export class ProjectPipelineModelBudgetManagementService {
    constructor(
        private readonly db: DataSource,
        private readonly access: ProjectAccessRuntimeService
    ) {}

    async increase(context: ProjectPipelineContext, input: ProjectPipelineModelBudgetIncrease) {
        assertPipelineBudgetHuman(context)
        await this.access.assertManage(context)
        return this.db.transaction(async (manager) => {
            await lockPipelineProject(manager, context)
            await this.access.assertHumanManageWithinTransaction(context, manager)
            const scope = projectionScope(context)
            const instance = await manager.findOneByOrFail(ProjectPipelineInstanceEntity, {
                ...scope,
                id: input.instanceId
            })
            const eventId = pipelineIdentity(context, 'model-budget-increase', input.requestId)
            const digest = pipelineDigest({ ...input, actorId: context.actor.userId })
            const previous = await manager.findOne(ProjectPipelineEventEntity, {
                withDeleted: true,
                where: { ...scope, id: eventId }
            })
            if (previous) {
                if (previous.instanceId !== instance.id || previous.payload.digest !== digest)
                    throw pipelineProjectionConflict('COMMAND_INPUT_IMMUTABLE')
                return previous
            }
            if (instance.revision !== input.expectedRevision)
                throw pipelineProjectionConflict('INSTANCE_REVISION_CONFLICT')
            if (instance.authority !== 'platform' || !instance.nativeModelBudget || !instance.currentRoundId)
                throw pipelineProjectionConflict('MODEL_BUDGET_UNAVAILABLE')
            const { policy } = await pipelineModelBudgetPolicy(manager, instance)
            if (input.maxTokens <= policy.maxTokens) throw pipelineProjectionConflict('MODEL_BUDGET_INCREASE_REQUIRED')
            instance.revision++
            await manager.save(instance)
            return manager.save(ProjectPipelineEventEntity, {
                ...managedAudit(context),
                id: eventId,
                instanceId: instance.id,
                revision: instance.revision,
                type: 'model.budget_increased',
                payload: {
                    roundId: instance.currentRoundId,
                    digest,
                    budgetIncrease: {
                        requestId: input.requestId,
                        previousMaxTokens: policy.maxTokens,
                        maxTokens: input.maxTokens,
                        reason: input.reason
                    }
                }
            })
        })
    }

    async inspect(context: ProjectPipelineContext, instanceId: string) {
        assertPipelineBudgetHuman(context)
        await this.access.assertManage(context)
        return this.db.transaction('REPEATABLE READ', async (manager) => {
            await this.access.assertHumanManageWithinTransaction(context, manager)
            const instance = await manager.findOneByOrFail(ProjectPipelineInstanceEntity, {
                ...projectionScope(context),
                id: instanceId
            })
            if (!instance.nativeModelBudget) throw pipelineProjectionConflict('MODEL_BUDGET_UNAVAILABLE')
            return {
                instanceId,
                revision: instance.revision,
                ...(await pipelineModelBudgetPolicy(manager, instance)),
                usage: await pipelineModelBudgetTotals(manager, instance)
            }
        })
    }
}
