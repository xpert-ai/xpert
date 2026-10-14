import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { ResolveGroupRuntimeAccessCommand } from './group-runtime-access.command'
import { GroupAccessService } from './group-access.service'
import { GroupParticipant } from './group.entity'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { groupDenied } from './group.errors'

@CommandHandler(ResolveGroupRuntimeAccessCommand)
export class ResolveGroupRuntimeAccessHandler implements ICommandHandler<ResolveGroupRuntimeAccessCommand> {
    constructor(
        private readonly db: DataSource,
        private readonly access: GroupAccessService,
        private readonly projects: XpertProjectAccessService
    ) {}

    async execute({ actor, target }: ResolveGroupRuntimeAccessCommand) {
        if (!actor.tenantId || !actor.organizationId || !actor.userId) throw groupDenied()
        const scope = { tenantId: actor.tenantId, organizationId: actor.organizationId }
        let member: GroupParticipant | null = null
        if (target.type === 'runtime') {
            if (!target.conversationId) throw groupDenied()
            member = await this.db.getRepository(GroupParticipant).findOneBy({
                ...scope,
                runtimeConversationId: target.conversationId,
                kind: 'assistant',
                active: true
            })
            if (!member) throw groupDenied()
        }
        const groupId = target.type === 'group' ? target.groupId : member.groupId
        if (!groupId) throw groupDenied()
        const group = await this.db
            .getRepository(ChatConversation)
            .findOneBy({ ...scope, id: groupId, purpose: 'group' })
        if (!group) throw groupDenied()
        if (!member && !group.xpertId) throw groupDenied()
        member ??= await this.db.getRepository(GroupParticipant).findOneBy({
            ...scope,
            groupId,
            subjectId: group.xpertId,
            kind: 'assistant',
            active: true
        })
        if (!member?.subjectId || !member.runtimeConversationId || !member.runtimeThreadId) throw groupDenied()
        const runtime = await this.db.getRepository(ChatConversation).findOneBy({
            ...scope,
            id: member.runtimeConversationId,
            threadId: member.runtimeThreadId,
            xpertId: member.subjectId,
            purpose: 'group_assistant_runtime'
        })
        if (!runtime) throw groupDenied()
        const authorize = async () => {
            await this.access.authorize(group.id)
            await this.access.assistant(member.subjectId)
            if (runtime.projectId) await this.projects.assertCanUseXpert(runtime.projectId, member.subjectId, actor)
            return { groupId: group.id, assistantId: member.subjectId }
        }
        // Preserve an authenticated request audience. Context-free internal callers supply a trusted actor.
        if (RequestContext.currentUserId() || RequestContext.currentApiPrincipal() || RequestContext.currentApiKey()) {
            if (
                RequestContext.currentUserId() !== actor.userId ||
                RequestContext.currentTenantId() !== actor.tenantId ||
                RequestContext.getOrganizationId() !== actor.organizationId
            )
                throw groupDenied()
            return authorize()
        }
        return this.access.withRootUser(group, actor.userId, authorize)
    }
}
