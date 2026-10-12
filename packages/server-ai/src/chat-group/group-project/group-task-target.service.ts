// Invariants: group targets are resolved from the caller's persisted runtime, never model-supplied group IDs.
// Recheck the initiating human, both Assistants and both Project bindings on every operation.
import { Injectable } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { AgentInvocationScope, AgentTarget } from '@xpert-ai/plugin-sdk'
import { DataSource } from 'typeorm'
import { createHash } from 'node:crypto'
import { z } from 'zod/v3'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'
import { GroupAccessService } from '../group-access.service'
import { GroupParticipant } from '../group.entity'
import { groupDenied } from '../group.errors'
import {
    AuthorizeGroupTaskCallerCommand,
    GroupTaskTargetItem,
    ListGroupTaskTargetsCommand,
    ResolveGroupTaskTargetCommand
} from './group-task.commands'

@Injectable()
export class GroupTaskTargetService {
    constructor(
        private readonly db: DataSource,
        private readonly access: GroupAccessService,
        private readonly projects: XpertProjectAccessService
    ) {}

    private async source(scope: AgentInvocationScope) {
        if (
            !scope.tenantId ||
            !scope.organizationId ||
            !scope.userId ||
            !scope.projectId ||
            !scope.conversationId ||
            !scope.callerXpertId
        )
            throw groupDenied()
        return this.db.getRepository(GroupParticipant).findOneBy({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            kind: 'assistant',
            active: true,
            runtimeConversationId: scope.conversationId,
            subjectId: scope.callerXpertId
        })
    }

    private async caller(scope: AgentInvocationScope) {
        const source = await this.source(scope)
        if (!source) throw groupDenied()
        const group = await this.db.getRepository(ChatConversation).findOneBy({
            id: source.groupId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            purpose: 'group',
            projectId: scope.projectId
        })
        if (!group) throw groupDenied()
        return { source, group }
    }

    async authorizeCaller(scope: AgentInvocationScope): Promise<void> {
        const { source, group } = await this.caller(scope)
        await this.access.withRootUser(group, scope.userId, async () => {
            await this.access.authorize(group.id)
            await this.projects.assertCanEdit(scope.projectId)
            await this.access.assistant(source.subjectId)
            await this.assertParticipantProject(scope, source)
        })
    }

    private async assertParticipantProject(scope: AgentInvocationScope, participant: GroupParticipant) {
        await this.projects.assertCanUseXpert(scope.projectId, participant.subjectId)
        const runtime = await this.db.getRepository(ChatConversation).findOneBy({
            id: participant.runtimeConversationId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            projectId: scope.projectId
        })
        if (!runtime) throw groupDenied()
    }

    async resolve(scope: AgentInvocationScope, participantId: string): Promise<AgentTarget> {
        if (!z.string().uuid().safeParse(participantId).success) throw groupDenied()
        const { source, group } = await this.caller(scope)
        if (source.id === participantId) throw groupDenied()
        return this.access.withRootUser(group, scope.userId, async () => {
            await this.access.authorize(group.id)
            const member = await this.db
                .getRepository(GroupParticipant)
                .findOneBy({ groupId: group.id, id: participantId, active: true, kind: 'assistant' })
            if (!member) throw groupDenied()
            await this.projects.assertCanEdit(scope.projectId)
            await this.access.assistant(source.subjectId)
            const assistant = await this.access.assistant(member.subjectId)
            for (const participant of [source, member]) await this.assertParticipantProject(scope, participant)
            return {
                bindingId: member.id,
                provider: 'xpert-task',
                reference: member.subjectId,
                revision: createHash('sha256')
                    .update(JSON.stringify([assistant.id, assistant.version, assistant.updatedAt]))
                    .digest('hex'),
                configuration: {
                    executionContext: {
                        type: 'group_member',
                        groupId: group.id,
                        participantId: member.id,
                        sourceParticipantId: source.id,
                        projectId: scope.projectId
                    }
                }
            }
        })
    }

    async list(scope: AgentInvocationScope): Promise<GroupTaskTargetItem[]> {
        if (!scope.callerXpertId) return []
        const source = await this.source(scope)
        if (!source) return []
        const members = await this.db
            .getRepository(GroupParticipant)
            .findBy({ groupId: source.groupId, kind: 'assistant', active: true })
        const result: GroupTaskTargetItem[] = []
        for (const member of members) {
            if (member.id === source.id) continue
            // Only members explicitly selected for this Project are task targets.
            if (
                !(await this.db
                    .getRepository(ChatConversation)
                    .existsBy({ id: member.runtimeConversationId, projectId: scope.projectId }))
            )
                continue
            const target = await this.resolve(scope, member.id)
            result.push({
                target: { type: 'group_member', participantId: member.id },
                assigneeXpertId: member.subjectId,
                title: member.name,
                provider: 'xpert-task',
                revision: target.revision
            })
        }
        return result
    }
}
@CommandHandler(AuthorizeGroupTaskCallerCommand)
export class AuthorizeGroupTaskCallerHandler implements ICommandHandler<AuthorizeGroupTaskCallerCommand> {
    constructor(private readonly targets: GroupTaskTargetService) {}
    execute(command: AuthorizeGroupTaskCallerCommand) {
        return this.targets.authorizeCaller(command.scope)
    }
}
@CommandHandler(ResolveGroupTaskTargetCommand)
export class ResolveGroupTaskTargetHandler implements ICommandHandler<ResolveGroupTaskTargetCommand> {
    constructor(private readonly targets: GroupTaskTargetService) {}
    execute(command: ResolveGroupTaskTargetCommand) {
        return this.targets.resolve(command.scope, command.participantId)
    }
}
@CommandHandler(ListGroupTaskTargetsCommand)
export class ListGroupTaskTargetsHandler implements ICommandHandler<ListGroupTaskTargetsCommand> {
    constructor(private readonly targets: GroupTaskTargetService) {}
    execute(command: ListGroupTaskTargetsCommand) {
        return this.targets.list(command.scope)
    }
}
