import { ConflictException, ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource, IsNull } from 'typeorm'
import {
    projectPluginDeploymentRefs,
    UserType,
    type ProjectPluginDeploymentRequest,
    type ActionNotificationPresentation,
    type ActionNotificationSource
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ResolveExecutionIdentityCommand, runWithExecutionIdentity } from '@xpert-ai/server-core'
import {
    ActionNotificationSources,
    type ActionNotificationSourceProvider,
    type ActionNotificationRecipient
} from '../../../user-notification/actions/action-notification.sources'
import { XpertProject } from '../../entities/project.entity'
import { XpertProjectMembership } from '../../entities/project-membership.entity'
import { ProjectPipelineOperationEntity } from '../persistence/pipeline.entity'
import { ProjectPluginDeploymentStore } from './plugin-deployment.store'
import { ProjectPluginInstallationAuthorizationStore } from './plugin-installation-authorization.store'
import { ProjectPluginInstallationAuthorizationService } from './plugin-installation-authorization.service'

@Injectable()
export class ProjectPluginInstallationNotificationSource implements OnModuleInit, ActionNotificationSourceProvider {
    readonly key = 'project.plugin-installation'
    constructor(
        private readonly db: DataSource,
        private readonly sources: ActionNotificationSources,
        private readonly commands: CommandBus,
        private readonly store: ProjectPluginDeploymentStore,
        private readonly authorizations: ProjectPluginInstallationAuthorizationStore,
        private readonly installation: ProjectPluginInstallationAuthorizationService
    ) {}
    onModuleInit() {
        this.sources.register(this)
    }
    reference(row: ProjectPipelineOperationEntity): ActionNotificationSource {
        return { type: 'action', provider: this.key, key: row.id, version: this.authorizations.version(row) }
    }
    async describe(row: ProjectPipelineOperationEntity) {
        if (row.kind !== 'operation' || row.handlerRef !== projectPluginDeploymentRefs.operation || row.deletedAt)
            return null
        const c = row.context
        const project = await this.db.manager.findOneBy(XpertProject, {
            id: row.projectId,
            tenantId: row.tenantId,
            organizationId: row.organizationId ?? IsNull()
        })
        if (!project || project.status === 'archived') return null
        const authorization = await this.authorizations.read(row)
        if (!authorization && ['succeeded', 'accepted'].includes(row.state)) return null
        let state: ActionNotificationPresentation['state'] = authorization ? 'handled' : 'pending'
        try {
            await this.store.current(c, row)
        } catch (error) {
            if (!(error instanceof ConflictException)) throw error
            if (!authorization) return null
            state = 'handled'
        }
        const members = await this.db.manager.findBy(XpertProjectMembership, {
            tenantId: row.tenantId,
            organizationId: row.organizationId ?? IsNull(),
            projectId: row.projectId,
            role: 'manager',
            removedAt: IsNull()
        })
        const candidates = new Set(members.map((item) => item.userId))
        if (project.ownerId) candidates.add(project.ownerId)
        const recipientIds: string[] = []
        let request: ProjectPluginDeploymentRequest | undefined
        for (const userId of candidates) {
            const actor = { ...c.actor, userId }
            try {
                const identity = await this.commands.execute(
                    new ResolveExecutionIdentityCommand({ ...actor, kind: 'user' })
                )
                const approved = await runWithExecutionIdentity(identity, async () => {
                    if (RequestContext.currentUser()?.type !== UserType.USER) throw new ForbiddenException()
                    const input = await this.installation.inspect({ ...c, actor }, c)
                    return input.request
                })
                request ??= approved
                recipientIds.push(userId)
            } catch (error) {
                if (!(error instanceof ForbiddenException)) throw error
            }
        }
        if (!request) return null
        const presentation: ActionNotificationPresentation = {
            title: `${project.name} · 安装授权 / Installation authorization · ${request.packageName}@${request.packageVersion}`.slice(
                0,
                240
            ),
            state,
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
            handlerRef: projectPluginDeploymentRefs.operation,
            kind: 'operation'
        })
        if (!row || this.reference(row).version !== source.version) return null
        const current = await this.describe(row)
        return current?.recipientIds.includes(recipient.userId) ? current.presentation : null
    }
}
