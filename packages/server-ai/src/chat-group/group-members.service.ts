import { Injectable } from '@nestjs/common'
import { User } from '@xpert-ai/server-core'
import { Xpert } from '../xpert/xpert.entity'
import { DataSource, In } from 'typeorm'
import { CommandBus } from '@nestjs/cqrs'
import { CancelConversationCommand } from '@xpert-ai/plugin-sdk'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { withGroupRuntime } from './group-runtime-context'
import { randomUUID } from 'node:crypto'
import type { ChatGroupParticipant } from '@xpert-ai/contracts'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { XpertPrincipalService } from '../xpert/xpert-principal.service'
import { GroupParticipant, GroupMessageRecipient, GroupInteraction } from './group.entity'
import { GroupAccessService } from './group-access.service'
import { z } from 'zod'
import { groupCreateSchema, groupMemberSchema } from './group.schema'
import { groupConflict } from './group.errors'

/** Public participant projection; runtime IDs and technical principals stay server-side. */
export function publicMember(member: GroupParticipant): ChatGroupParticipant {
    return {
        id: member.id,
        kind: member.kind,
        subjectId: member.subjectId,
        name: member.name,
        role: member.role,
        active: member.active
    }
}

/** Read only public profile fields after group authorization; no schema migration. */
export async function publicMembers(
    db: DataSource,
    group: Pick<ChatConversation, 'tenantId' | 'organizationId'>,
    members: GroupParticipant[]
): Promise<ChatGroupParticipant[]> {
    const userIds = members.filter((member) => member.kind === 'user').map((member) => member.subjectId)
    const assistantIds = members.filter((member) => member.kind === 'assistant').map((member) => member.subjectId)
    const [users, assistants] = await Promise.all([
        userIds.length
            ? db.getRepository(User).find({
                  where: { id: In(userIds), tenantId: group.tenantId },
                  select: { id: true, imageUrl: true }
              })
            : [],
        assistantIds.length
            ? db.getRepository(Xpert).find({
                  where: { id: In(assistantIds), tenantId: group.tenantId, organizationId: group.organizationId },
                  select: { id: true, avatar: true }
              })
            : []
    ])
    return members.map((member) => {
        const imageUrl = users.find((user) => user.id === member.subjectId)?.imageUrl
        const avatar =
            member.kind === 'user'
                ? imageUrl
                    ? { url: imageUrl }
                    : null
                : (assistants.find((assistant) => assistant.id === member.subjectId)?.avatar ?? null)
        return { ...publicMember(member), avatar }
    })
}

/**
 * Invariants: only the owner changes membership; one Assistant has one private runtime per group.
 * Group.xpertId identifies the default Assistant. Execution records belong to the initiating human.
 * Removal revokes pending work transactionally before canceling affected runs through the existing command.
 */
@Injectable()
export class GroupMembersService {
    constructor(
        private readonly db: DataSource,
        private readonly access: GroupAccessService,
        private readonly principals: XpertPrincipalService,
        private readonly commands: CommandBus
    ) {}

    /** Create the public group, human owner and default Assistant runtime in one transaction. */
    async create(input: z.output<typeof groupCreateSchema>) {
        const { tenantId, organizationId, userId } = this.access.scope()
        const scope = { tenantId, organizationId }
        const user = await this.access.user(scope, userId)
        const assistant = await this.access.assistant(input.assistantId)
        const principal = await this.principals.ensurePrincipalUser(assistant)
        const groupId = randomUUID()
        const assistantParticipantId = randomUUID()
        await this.db.transaction(async (manager) => {
            const group = await manager.save(
                ChatConversation,
                manager.create(ChatConversation, {
                    ...scope,
                    id: groupId,
                    threadId: randomUUID(),
                    purpose: 'group',
                    title: input.title,
                    createdById: userId,
                    status: 'idle',
                    xpertId: assistant.id,
                    revision: 1
                })
            )
            await manager.save(
                GroupParticipant,
                manager.create(GroupParticipant, {
                    ...scope,
                    groupId,
                    kind: 'user',
                    subjectId: userId,
                    name: user.name || user.firstName || userId,
                    role: 'owner',
                    active: true
                })
            )
            const runtime = await manager.save(
                ChatConversation,
                manager.create(ChatConversation, {
                    ...scope,
                    purpose: 'group_assistant_runtime',
                    threadId: randomUUID(),
                    xpertId: assistant.id,
                    createdById: userId,
                    status: 'idle'
                })
            )
            await manager.save(
                ChatConversationThread,
                manager.create(ChatConversationThread, {
                    ...scope,
                    conversationId: runtime.id,
                    threadId: runtime.threadId,
                    createdById: userId,
                    status: 'idle'
                })
            )
            await manager.save(
                GroupParticipant,
                manager.create(GroupParticipant, {
                    ...scope,
                    id: assistantParticipantId,
                    groupId: group.id,
                    kind: 'assistant',
                    subjectId: assistant.id,
                    name: assistant.title || assistant.name,
                    active: true,
                    runtimeConversationId: runtime.id,
                    runtimeThreadId: runtime.threadId,
                    principalUserId: principal.id
                })
            )
        })
        return { id: groupId }
    }

    /** Validate the target before locking; rejoining restores the same membership and runtime binding. */
    async add(groupId: string, input: z.output<typeof groupMemberSchema>) {
        const { scope, actor } = await this.access.authorize(groupId, true)
        const user = input.kind === 'user' ? await this.access.user(scope, input.subjectId) : null
        const assistant = input.kind === 'assistant' ? await this.access.assistant(input.subjectId) : null
        const principal = assistant ? await this.principals.ensurePrincipalUser(assistant) : null
        return this.db.transaction(async (manager) => {
            const group = await manager
                .getRepository(ChatConversation)
                .findOne({ where: { id: groupId, ...scope }, lock: { mode: 'pessimistic_write' } })
            const existing = await manager.findOneBy(GroupParticipant, {
                groupId,
                kind: input.kind,
                subjectId: assistant?.id ?? input.subjectId
            })
            const count = await manager.countBy(GroupParticipant, { groupId, active: true })
            if (count >= 32 && !existing?.active) throw groupConflict()
            if (existing) {
                existing.active = true
                group.revision++
                await manager.save(group)
                return publicMember(await manager.save(existing))
            }
            const runtime = assistant
                ? await manager.save(
                      ChatConversation,
                      manager.create(ChatConversation, {
                          ...scope,
                          purpose: 'group_assistant_runtime',
                          xpertId: assistant.id,
                          threadId: randomUUID(),
                          createdById: actor.subjectId,
                          status: 'idle'
                      })
                  )
                : null
            if (runtime)
                await manager.save(
                    ChatConversationThread,
                    manager.create(ChatConversationThread, {
                        ...scope,
                        conversationId: runtime.id,
                        threadId: runtime.threadId,
                        createdById: actor.subjectId,
                        status: 'idle'
                    })
                )
            const member = await manager.save(
                GroupParticipant,
                manager.create(GroupParticipant, {
                    ...scope,
                    groupId,
                    kind: input.kind,
                    subjectId: assistant?.id ?? user.id,
                    name: assistant ? assistant.title || assistant.name : user.name || user.firstName || user.id,
                    runtimeConversationId: runtime?.id,
                    runtimeThreadId: runtime?.threadId,
                    principalUserId: principal?.id,
                    active: true
                })
            )
            group.revision++
            await manager.save(group)
            return publicMember(member)
        })
    }

    /** Protect the owner/default Assistant and revoke work caused by the removed member. */
    async remove(groupId: string, participantId: string) {
        await this.access.authorize(groupId, true)
        const runs = await this.db.transaction(async (manager) => {
            const group = await manager.findOne(ChatConversation, {
                where: { id: groupId },
                lock: { mode: 'pessimistic_write' }
            })
            const member = await manager.findOneBy(GroupParticipant, { id: participantId, groupId })
            if (
                !member ||
                member.role === 'owner' ||
                (member.kind === 'assistant' && member.subjectId === group.xpertId)
            )
                throw groupConflict()
            await manager.update(GroupParticipant, { id: participantId }, { active: false })
            const sources = await manager.findBy(ChatMessage, { conversationId: groupId })
            const revoked = sources
                .filter(
                    (message) =>
                        message.groupCommunication?.senderId === participantId ||
                        (member.kind === 'user' && message.groupCommunication?.rootUserId === member.subjectId)
                )
                .map((message) => message.id)
            const receipts = await manager.find(GroupMessageRecipient, {
                where: [
                    { groupId, participantId, status: In(['pending', 'starting', 'steering', 'blocked']) },
                    ...(revoked.length
                        ? [
                              {
                                  groupId,
                                  messageId: In(revoked),
                                  status: In(['pending', 'starting', 'steering', 'blocked'])
                              }
                          ]
                        : [])
                ]
            })
            if (receipts.length)
                await manager.update(
                    GroupMessageRecipient,
                    { id: In(receipts.map((row) => row.id)) },
                    { status: 'canceled', error: 'member_removed', control: null }
                )
            await manager.update(
                GroupInteraction,
                {
                    groupId,
                    status: In(['pending', 'claimed']),
                    ...(member.kind === 'user' ? { assignedUserId: member.subjectId } : { participantId })
                },
                { status: 'canceled' }
            )
            const affected = await manager.findBy(GroupParticipant, { groupId, kind: 'assistant' })
            const result: { conversationId: string; threadId: string; executionId: string }[] = []
            for (const target of affected) {
                const thread = await manager.findOneBy(ChatConversationThread, { threadId: target.runtimeThreadId })
                const executionId =
                    thread?.runControl?.executionId ??
                    receipts.find((row) => row.participantId === target.id && row.executionId)?.executionId
                if (
                    executionId &&
                    (target.id === participantId ||
                        receipts.some((row) => row.participantId === target.id && row.executionId === executionId))
                )
                    result.push({
                        conversationId: target.runtimeConversationId,
                        threadId: target.runtimeThreadId,
                        executionId
                    })
            }
            group.revision++
            await manager.save(group)
            return result
        })
        for (const run of runs)
            await withGroupRuntime(run.conversationId, () => this.commands.execute(new CancelConversationCommand(run)))
        return { removed: true }
    }
}
