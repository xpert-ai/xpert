// Invariants: choosing a Project never grants human membership or changes a started runtime's Project.
// Validate all selected Assistants first; caller-generated creation IDs make interrupted setup repairable.
import { Injectable } from '@nestjs/common'
import { AIPermissionsEnum, ChatGroupProject, ChatGroupProjectInput } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource, EntityManager, In } from 'typeorm'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../../chat-conversation/conversation-thread.entity'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { XpertProjectService } from '../../xpert-project/project.service'
import { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'
import { XpertProjectFeatureGuard } from '../../xpert-project/guards/project-feature.guard'
import { GroupAccessService } from '../group-access.service'
import { GroupParticipant } from '../group.entity'
import { groupConflict, groupDenied } from '../group.errors'

@Injectable()
export class GroupProjectService {
    constructor(
        private readonly db: DataSource,
        private readonly access: GroupAccessService,
        private readonly projects: XpertProjectService,
        private readonly projectAccess: XpertProjectAccessService,
        private readonly feature: XpertProjectFeatureGuard
    ) {}

    async get(groupId: string): Promise<ChatGroupProject | null> {
        await this.feature.canActivate()
        const { group } = await this.access.authorize(groupId)
        if (!group.projectId) return null
        const { project } = await this.projectAccess.assertCanRead(group.projectId)
        return {
            projectId: project.id,
            name: project.name,
            participantIds: await this.participants(this.db.manager, group, project.id)
        }
    }

    private async participants(manager: EntityManager, group: ChatConversation, projectId: string): Promise<string[]> {
        const scope = { tenantId: group.tenantId, organizationId: group.organizationId }
        const members = await manager
            .getRepository(GroupParticipant)
            .findBy({ ...scope, groupId: group.id, active: true, kind: 'assistant' })
        const runtimes = members.length
            ? await manager.getRepository(ChatConversation).findBy({
                  ...scope,
                  id: In(members.map((m) => m.runtimeConversationId)),
                  projectId
              })
            : []
        return members.filter((m) => runtimes.some((r) => r.id === m.runtimeConversationId)).map((m) => m.id)
    }

    async set(groupId: string, input: ChatGroupProjectInput): Promise<ChatGroupProject> {
        await this.feature.canActivate()
        const { group, scope, actor } = await this.access.authorize(groupId, true)
        const projectId = input.project.mode === 'create' ? input.project.id : input.project.projectId
        if (group.projectId && group.projectId !== projectId) throw groupConflict()
        const members = await this.db
            .getRepository(GroupParticipant)
            .findBy({ ...scope, groupId, active: true, kind: 'assistant', id: In(input.participantIds) })
        if (members.length !== input.participantIds.length || !members.some((m) => m.subjectId === group.xpertId))
            throw groupDenied()
        for (const member of members) await this.access.assistant(member.subjectId)
        if (input.project.mode === 'existing') await this.projectAccess.assertCanManage(projectId)
        else if (!RequestContext.hasPermissions([AIPermissionsEnum.XPERT_PROJECT_CREATE])) throw groupDenied()
        return this.db.transaction(async (manager) => {
            const locked = await manager.findOneOrFail(ChatConversation, {
                where: { ...scope, id: groupId },
                lock: { mode: 'pessimistic_write' }
            })
            if (locked.projectId && locked.projectId !== projectId) throw groupConflict()
            if (
                !(await manager.findOneBy(GroupParticipant, {
                    ...scope,
                    id: actor.id,
                    groupId,
                    active: true,
                    role: 'owner'
                }))
            )
                throw groupDenied()
            for (const member of members) {
                const current = await manager.findOneBy(GroupParticipant, { ...scope, id: member.id, active: true })
                if (!current) throw groupDenied()
                const runtime = await manager.findOneByOrFail(ChatConversation, {
                    ...scope,
                    id: member.runtimeConversationId
                })
                const thread = await manager.findOneOrFail(ChatConversationThread, {
                    where: { threadId: member.runtimeThreadId },
                    lock: { mode: 'pessimistic_write' }
                })
                const started =
                    thread.status !== 'idle' || (await manager.existsBy(ChatMessage, { conversationId: runtime.id }))
                if (started && runtime.projectId !== projectId) throw groupConflict()
            }
            if (input.project.mode === 'create')
                await this.projects.ensureManagedProject({
                    projectId,
                    name: input.project.name,
                    xpertId: group.xpertId,
                    status: 'active',
                    projectType: { applicationKey: 'platform', projectTypeKey: 'general' }
                })
            for (const member of members) await this.projects.addXpert(projectId, member.subjectId)
            const { project } = await this.projectAccess.assertCanManage(projectId)
            await manager.update(
                ChatConversation,
                { ...scope, id: In(members.map((m) => m.runtimeConversationId)) },
                { projectId }
            )
            await manager.update(ChatConversation, { ...scope, id: groupId }, { projectId })
            await manager.increment(ChatConversation, { ...scope, id: groupId }, 'revision', 1)
            return {
                projectId,
                name: project.name,
                participantIds: await this.participants(manager, locked, projectId)
            }
        })
    }
}
