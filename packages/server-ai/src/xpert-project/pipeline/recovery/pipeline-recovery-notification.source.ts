import { ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource, IsNull } from 'typeorm'
import { ResolveExecutionIdentityCommand, runWithExecutionIdentity } from '@xpert-ai/server-core'
import type { ActionNotificationPresentation, ActionNotificationSource } from '@xpert-ai/contracts'
import {
    ActionNotificationSources,
    type ActionNotificationSourceProvider,
    type ActionNotificationRecipient
} from '../../../user-notification/actions/action-notification.sources'
import { XpertProject } from '../../entities/project.entity'
import { XpertProjectMembership } from '../../entities/project-membership.entity'
import { ProjectPipelineOperationEntity } from '../persistence/pipeline.entity'
import { ProjectPipelineRecoveryService } from './pipeline-recovery.service'
import { recoveryVersion } from './pipeline-recovery-record'

/** Notifications project recovery availability; they never authorize or execute recovery. */
@Injectable()
export class ProjectPipelineRecoveryNotificationSource implements OnModuleInit, ActionNotificationSourceProvider {
    readonly key = 'project.pipeline.recovery'
    constructor(
        private readonly db: DataSource,
        private readonly sources: ActionNotificationSources,
        private readonly commands: CommandBus,
        private readonly recovery: ProjectPipelineRecoveryService
    ) {}
    onModuleInit() {
        this.sources.register(this)
    }
    reference(row: ProjectPipelineOperationEntity): ActionNotificationSource {
        return { type: 'action', provider: this.key, key: row.id, version: recoveryVersion(row) }
    }
    async describe(row: ProjectPipelineOperationEntity) {
        if (row.kind !== 'operation' || row.deletedAt || row.state !== 'failed') return null
        const scope = { tenantId: row.tenantId, organizationId: row.organizationId ?? IsNull() }
        const project = await this.db.manager.findOneBy(XpertProject, { ...scope, id: row.projectId })
        if (!project || project.status === 'archived') return null
        const members = await this.db.manager.findBy(XpertProjectMembership, {
            ...scope,
            projectId: row.projectId,
            role: 'manager',
            removedAt: IsNull()
        })
        const candidates = new Set(members.map((item) => item.userId))
        if (project.ownerId) candidates.add(project.ownerId)
        const recipientIds: string[] = []
        for (const userId of candidates) {
            const actor = { ...row.context.actor, userId }
            try {
                const identity = await this.commands.execute(
                    new ResolveExecutionIdentityCommand({ ...actor, kind: 'user' })
                )
                const actions = await runWithExecutionIdentity(identity, () =>
                    this.recovery.describe({ ...row.context, actor }, row)
                )
                // Keep a pending notification during the short recovery lease as well.
                if (actions.recoveryState === 'available' || actions.recoveryState === 'checking')
                    recipientIds.push(userId)
            } catch (error) {
                if (!(error instanceof ForbiddenException)) throw error
            }
        }
        if (!recipientIds.length) return null
        const presentation: ActionNotificationPresentation = {
            title: `${project.name} · 流程执行失败，可手动恢复 / Pipeline recovery available`.slice(0, 240),
            state: 'pending',
            workbench: {
                target: 'project.pipelines',
                organizationId: row.organizationId,
                projectId: row.projectId,
                pipelineInstanceId: row.instanceId,
                pipelineRoundId: row.roundId,
                pipelineNodeId: row.nodeInstanceId
            }
        }
        return { recipientIds, presentation }
    }
    async resolve(recipient: ActionNotificationRecipient, source: ActionNotificationSource) {
        const row = await this.db.manager.findOneBy(ProjectPipelineOperationEntity, {
            tenantId: recipient.tenantId,
            id: source.key,
            kind: 'operation'
        })
        if (!row || this.reference(row).version !== source.version) return null
        try {
            const current = await this.describe(row)
            return current?.recipientIds.includes(recipient.userId) ? current.presentation : null
        } catch (error) {
            // Read-only presentation may disappear while a plugin is unavailable. Reconciliation still
            // calls describe directly so this transient condition never closes the persisted notification.
            if (error instanceof Error && error.message === 'PIPELINE_ADAPTER_UNAVAILABLE') return null
            throw error
        }
    }
}
