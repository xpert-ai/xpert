// Candidate roles belong to the policy. Notifications never call authorizeDecision or execute a gate.
import { Injectable, OnModuleInit } from '@nestjs/common'
import { DataSource, IsNull, In } from 'typeorm'
import { z } from 'zod/v3'
import { ProjectPipelineRuntimeAdapterRegistry } from '@xpert-ai/plugin-sdk'
import {
    projectPipelineBindingSchema,
    UserType,
    type ActionNotificationPresentation,
    type ActionNotificationSource
} from '@xpert-ai/contracts'
import { User, UserOrganization } from '@xpert-ai/server-core'
import {
    ActionNotificationSources,
    ActionNotificationSourceProvider,
    ActionNotificationRecipient
} from '../../../user-notification/actions/action-notification.sources'
import { XpertProject } from '../../entities/project.entity'
import { XpertProjectMembership } from '../../entities/project-membership.entity'
import {
    ProjectPipelineAttentionEntity,
    ProjectPipelineInstanceEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineRunEntity
} from '../persistence/pipeline.entity'

const rolesSchema = z.array(z.enum(['owner', 'manager', 'editor'])).max(3)

@Injectable()
export class ProjectPipelineNotificationSource implements OnModuleInit, ActionNotificationSourceProvider {
    readonly key = 'project.pipeline.human'
    constructor(
        private readonly database: DataSource,
        private readonly adapters: ProjectPipelineRuntimeAdapterRegistry,
        private readonly sources: ActionNotificationSources
    ) {}
    onModuleInit() {
        this.sources.register(this)
    }

    reference(attention: ProjectPipelineAttentionEntity): ActionNotificationSource {
        return { type: 'action', provider: this.key, key: attention.id, version: String(attention.generation) }
    }

    async describe(attention: ProjectPipelineAttentionEntity) {
        const scope = {
            tenantId: attention.tenantId,
            organizationId: attention.organizationId ?? IsNull(),
            projectId: attention.projectId
        }
        const [project, instance, node, round] = await Promise.all([
            this.database.getRepository(XpertProject).findOneBy({
                id: attention.projectId,
                tenantId: attention.tenantId,
                organizationId: scope.organizationId
            }),
            this.database
                .getRepository(ProjectPipelineInstanceEntity)
                .findOneBy({ ...scope, id: attention.instanceId }),
            this.database
                .getRepository(ProjectPipelineNodeEntity)
                .findOneBy({ ...scope, id: attention.nodeInstanceId }),
            this.database.getRepository(ProjectPipelineRoundEntity).findOneBy({ ...scope, id: attention.roundId })
        ])
        if (!project || !instance || !node || !round || !attention.policyRef || !attention.candidateRoleKey) return null
        const run = await this.database.getRepository(ProjectPipelineRunEntity).findOneBy({ ...scope, id: round.runId })
        if (!run?.bindingSnapshot || instance.authority !== 'platform') return null
        const binding = projectPipelineBindingSchema.parse(run.bindingSnapshot)
        const candidate = binding.roleBindings[attention.candidateRoleKey]
        if (candidate?.kind !== 'human') return null
        const policy = this.adapters.resolve('policy', attention.policyRef, attention)
        const roles = rolesSchema.parse(policy.decisionRecipientRoles?.(candidate.selectionKey) ?? [])
        const memberships =
            roles.length && project.status !== 'archived'
                ? await this.database
                      .getRepository(XpertProjectMembership)
                      .findBy({ ...scope, role: In(roles), removedAt: IsNull() })
                : []
        const ids = new Set(memberships.map((row) => row.userId))
        if (roles.includes('owner') && project.ownerId && project.status !== 'archived') ids.add(project.ownerId)
        const users = ids.size
            ? this.database
                  .getRepository(User)
                  .createQueryBuilder('u')
                  .select('u.id', 'id')
                  .where('u.id IN (:...ids) AND u.tenantId = :tenantId AND u.isActive = true AND u.type = :type', {
                      ids: [...ids],
                      tenantId: attention.tenantId,
                      type: UserType.USER
                  })
            : null
        if (users && attention.organizationId)
            users.andWhere(
                `EXISTS (${this.database
                    .getRepository(UserOrganization)
                    .createQueryBuilder('o')
                    .select('1')
                    .where(
                        'o.userId = u.id AND o.tenantId = u.tenantId AND o.organizationId = :organizationId AND o.isActive = true'
                    )
                    .getQuery()})`,
                { organizationId: attention.organizationId }
            )
        const recipientIds = users ? (await users.getRawMany<{ id: string }>()).map((row) => row.id) : []
        const state: ActionNotificationPresentation['state'] =
            attention.state === 'resolved' && attention.decisionId
                ? 'handled'
                : attention.state === 'open' &&
                    project.status !== 'archived' &&
                    instance.currentRoundId === round.id &&
                    round.state === 'active' &&
                    node.disposition === 'active'
                  ? 'pending'
                  : 'closed'
        const presentation: ActionNotificationPresentation = {
            title: `${project.name} · ${instance.title} · ${node.projection.title}`.slice(0, 240),
            state,
            workbench: {
                target: 'project.pipelines',
                organizationId: attention.organizationId,
                projectId: attention.projectId,
                pipelineInstanceId: instance.id,
                pipelineRoundId: round.id,
                pipelineNodeId: node.id
            }
        }
        return { recipientIds, presentation }
    }

    async resolve(recipient: ActionNotificationRecipient, source: ActionNotificationSource) {
        const attention = await this.database.getRepository(ProjectPipelineAttentionEntity).findOneBy({
            tenantId: recipient.tenantId,
            id: source.key,
            kind: 'human'
        })
        if (!attention || this.reference(attention).version !== source.version) return null
        try {
            const current = await this.describe(attention)
            return current?.recipientIds.includes(recipient.userId) ? current.presentation : null
        } catch (error) {
            if (error instanceof Error && error.message === 'PIPELINE_ADAPTER_UNAVAILABLE') return null
            throw error
        }
    }
}
