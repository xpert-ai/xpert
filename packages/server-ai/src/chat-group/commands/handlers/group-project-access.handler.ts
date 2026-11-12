import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource } from 'typeorm'
import { ChatConversation } from '../../../chat-conversation/conversation.entity'
import { XpertProject } from '../../../xpert-project/entities/project.entity'
import { XpertProjectAccessService } from '../../../xpert-project/services/project-access.service'
import { GroupAccessService } from '../../group-access.service'
import { groupDenied } from '../../group.errors'
import { ResolveGroupProjectAccessCommand } from '../group-project-access.command'

@CommandHandler(ResolveGroupProjectAccessCommand)
export class ResolveGroupProjectAccessHandler implements ICommandHandler<ResolveGroupProjectAccessCommand> {
    constructor(
        private readonly db: DataSource,
        private readonly access: GroupAccessService,
        private readonly projects: XpertProjectAccessService
    ) {}

    async execute({ actor, groupId, operation }: ResolveGroupProjectAccessCommand) {
        if (!actor.tenantId || !actor.organizationId || !actor.userId || !groupId) throw groupDenied()
        const authenticated =
            RequestContext.currentUserId() || RequestContext.currentApiPrincipal() || RequestContext.currentApiKey()
        if (
            authenticated &&
            (RequestContext.currentUserId() !== actor.userId ||
                RequestContext.currentTenantId() !== actor.tenantId ||
                RequestContext.getOrganizationId() !== actor.organizationId)
        )
            throw groupDenied()
        const scope = { tenantId: actor.tenantId, organizationId: actor.organizationId }
        const group = await this.db
            .getRepository(ChatConversation)
            .findOneBy({ ...scope, id: groupId, purpose: 'group' })
        if (!group) throw groupDenied()
        if (operation === 'offer') {
            // Resource-scoped credentials cannot be used as an organization-wide target directory.
            if (RequestContext.currentApiPrincipal() || RequestContext.currentApiKey()) throw groupDenied()
            await this.access.user(scope, actor.userId)
            if (!group.projectId) throw groupDenied()
            const project = await this.db.getRepository(XpertProject).findOneBy({ ...scope, id: group.projectId })
            if (!project || project.status === 'archived') throw groupDenied()
            return { groupId, projectId: project.id }
        }
        const authorize = async () => {
            const current = await this.access.authorize(groupId, operation !== 'read')
            const projectId = current.group.projectId ?? null
            // Removing an old reference must remain possible after the group changes its Project.
            if (operation === 'remove') return { groupId, projectId }
            if (!projectId) throw groupDenied()
            if (operation === 'manage') await this.projects.assertCanEdit(projectId)
            else await this.projects.assertCanUse(projectId)
            return { groupId, projectId }
        }
        return authenticated ? authorize() : this.access.withRootUser(group, actor.userId, authorize)
    }
}
