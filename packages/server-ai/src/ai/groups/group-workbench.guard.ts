import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { parseQueryBoolean } from '@xpert-ai/server-common'
import type { Request } from 'express'
import { GroupAccessService } from '../../chat-group/group-access.service'
import { GroupParticipant } from '../../chat-group/group.entity'
import { groupDenied } from '../../chat-group/group.errors'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'

/** Group credentials may only resolve the published main Assistant and its own runtime scope. */
@Injectable()
export class GroupWorkbenchGuard implements CanActivate {
    constructor(
        private readonly access: GroupAccessService,
        private readonly db: DataSource,
        private readonly projects: XpertProjectAccessService
    ) {}

    async resolve(groupId: string) {
        const { group, scope } = await this.access.authorize(groupId)
        await this.access.assistant(group.xpertId)
        const member = await this.db.getRepository(GroupParticipant).findOneBy({
            ...scope,
            groupId,
            kind: 'assistant',
            active: true,
            subjectId: group.xpertId
        })
        // Missing runtime IDs must never become omitted TypeORM predicates.
        if (!member?.runtimeConversationId || !member.runtimeThreadId) throw groupDenied()
        const conversation = await this.db.getRepository(ChatConversation).findOneBy({
            ...scope,
            id: member.runtimeConversationId,
            purpose: 'group_assistant_runtime',
            xpertId: group.xpertId,
            threadId: member.runtimeThreadId
        })
        if (!conversation) throw groupDenied()
        if (conversation.projectId) await this.projects.assertCanReadXpert(conversation.projectId, group.xpertId)
        return {
            assistantId: group.xpertId,
            participantId: member.id,
            conversationId: conversation.id,
            threadId: member.runtimeThreadId,
            projectId: conversation.projectId ?? null
        }
    }

    async canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest<Request>()
        const scope = await this.resolve(request.params.groupId)
        if (
            request.params.hostType !== 'agent' ||
            request.params.hostId !== scope.assistantId ||
            parseQueryBoolean(request.query.isDraft)
        )
            throw groupDenied()
        const conversation = request.headers['x-xpert-view-conversation-id']
        const project = request.headers['x-xpert-view-project-id']
        if ((conversation && conversation !== scope.conversationId) || (project && project !== scope.projectId))
            throw groupDenied()
        request.headers['x-xpert-view-conversation-id'] = scope.conversationId
        if (scope.projectId) request.headers['x-xpert-view-project-id'] = scope.projectId
        else delete request.headers['x-xpert-view-project-id']
        return true
    }
}
