import { CommandBus } from '@nestjs/cqrs'
import { CancelConversationCommand } from '@xpert-ai/plugin-sdk'
import { DataSource, EntityManager } from 'typeorm'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { XpertPrincipalService } from '../xpert/xpert-principal.service'
import { GroupAccessService } from './group-access.service'
import { GroupParticipant } from './group.entity'
import { GroupMembersService } from './group-members.service'
import { EnsureXpertProjectMemberCommand } from '../xpert-project/commands/ensure-project-member.command'

describe('group membership lifecycle', () => {
    function setup() {
        const group = Object.assign(new ChatConversation(), { id: 'group', xpertId: 'assistant', revision: 1 })
        const member = Object.assign(new GroupParticipant(), {
            id: 'member',
            groupId: 'group',
            kind: 'assistant',
            subjectId: 'external',
            runtimeConversationId: 'runtime',
            runtimeThreadId: 'thread',
            role: 'member'
        })
        let sequence = 0
        const manager = {
            create: jest.fn((entity: new () => object, values: object) =>
                Object.assign(new entity(), { id: `record-${++sequence}` }, values)
            ),
            save: jest.fn(async (entityOrRow: unknown, row?: object) => row ?? entityOrRow),
            findOne: jest.fn().mockResolvedValue(group),
            findOneBy: jest.fn(async (entity: unknown) =>
                entity === GroupParticipant ? member : { runControl: { executionId: 'run' } }
            ),
            findBy: jest.fn(async (entity: unknown) => (entity === GroupParticipant ? [member] : [])),
            find: jest.fn().mockResolvedValue([]),
            getRepository: jest.fn(() => ({ findOne: jest.fn().mockResolvedValue(group) })),
            countBy: jest.fn().mockResolvedValue(2),
            update: jest.fn().mockResolvedValue({ affected: 1 })
        }
        const db = {
            transaction: jest.fn(async (work: (manager: EntityManager) => Promise<unknown>) =>
                work(manager as unknown as EntityManager)
            )
        }
        const access = {
            scope: () => ({ tenantId: 'tenant', organizationId: 'org', userId: 'human' }),
            user: jest.fn().mockResolvedValue({ id: 'human', firstName: 'A' }),
            assistant: jest.fn().mockResolvedValue({ id: 'assistant', title: 'C' }),
            authorize: jest.fn().mockResolvedValue({
                group,
                actor: { subjectId: 'human' },
                scope: { tenantId: 'tenant', organizationId: 'org' }
            })
        }
        const principals = { ensurePrincipalUser: jest.fn().mockResolvedValue({ id: 'technical-user' }) }
        const commands = { execute: jest.fn().mockResolvedValue(undefined) }
        const service = new GroupMembersService(
            db as unknown as DataSource,
            access as unknown as GroupAccessService,
            principals as unknown as XpertPrincipalService,
            commands as unknown as CommandBus
        )
        return { service, db, manager, access, commands, group, member }
    }

    it('creates a human-owned public group and separate default Assistant runtime atomically', async () => {
        const { service, db, manager } = setup()
        const result = await service.create({ title: 'Team', assistantId: 'assistant' })
        expect(db.transaction).toHaveBeenCalledTimes(1)
        expect(manager.create).toHaveBeenCalledWith(
            ChatConversation,
            expect.objectContaining({
                id: result.id,
                purpose: 'group',
                xpertId: 'assistant',
                createdById: 'human'
            })
        )
        expect(manager.create).toHaveBeenCalledWith(
            ChatConversation,
            expect.objectContaining({
                purpose: 'group_assistant_runtime',
                xpertId: 'assistant',
                createdById: 'human'
            })
        )
        expect(manager.create).toHaveBeenCalledWith(
            ChatConversationThread,
            expect.objectContaining({ createdById: 'human' })
        )
        expect(manager.create).toHaveBeenCalledWith(
            GroupParticipant,
            expect.objectContaining({
                groupId: result.id,
                kind: 'user',
                subjectId: 'human',
                role: 'owner'
            })
        )
        expect(manager.create).toHaveBeenCalledWith(
            GroupParticipant,
            expect.objectContaining({
                groupId: result.id,
                kind: 'assistant',
                subjectId: 'assistant',
                principalUserId: 'technical-user'
            })
        )
    })

    it('rejects membership changes before opening a transaction when the actor is not the owner', async () => {
        const { service, access, db } = setup()
        access.authorize.mockRejectedValue(new Error('owner required'))
        await expect(service.add('group', { kind: 'user', subjectId: 'other' })).rejects.toThrow('owner required')
        await expect(service.remove('group', 'member')).rejects.toThrow('owner required')
        expect(access.authorize).toHaveBeenCalledWith('group', true)
        expect(db.transaction).not.toHaveBeenCalled()
    })

    it('uses an email fallback when creating the owner of a group', async () => {
        const { service, access, manager } = setup()
        access.user.mockResolvedValue({ id: 'human', email: 'owner@example.com' })
        await service.create({ title: 'Team', assistantId: 'assistant' })
        expect(manager.create).toHaveBeenCalledWith(
            GroupParticipant,
            expect.objectContaining({ kind: 'user', role: 'owner', name: 'owner@example.com' })
        )
    })

    it.each([false, true])('uses the current username when inviting a user (rejoining: %s)', async (rejoining) => {
        const { service, access, manager, member } = setup()
        access.user.mockResolvedValue({ id: 'human', username: 'member', email: 'member@example.com' })
        member.kind = 'user'
        member.subjectId = 'human'
        member.name = 'human'
        manager.findOneBy.mockResolvedValueOnce(rejoining ? member : null)
        const result = await service.add('group', { kind: 'user', subjectId: 'human' })
        expect(result).toMatchObject({ kind: 'user', name: 'member', active: true })
        expect(access.user).toHaveBeenCalledWith({ tenantId: 'tenant', organizationId: 'org' }, 'human')
    })

    it.each(['owner', 'default-assistant'])('protects the %s from removal', async (protectedMember) => {
        const { service, member, manager, commands } = setup()
        if (protectedMember === 'owner') member.role = 'owner'
        else member.subjectId = 'assistant'
        await expect(service.remove('group', 'member')).rejects.toMatchObject({ status: 409 })
        expect(manager.update).not.toHaveBeenCalled()
        expect(commands.execute).not.toHaveBeenCalled()
    })

    it.each(['new', 'inactive', 'active'])(
        'ensures bound Project membership for a %s human participant',
        async (state) => {
            const { service, group, member, manager, commands } = setup()
            group.projectId = 'project'
            member.kind = 'user'
            member.subjectId = 'human'
            member.active = state === 'active'
            manager.findOneBy.mockResolvedValueOnce(state === 'new' ? null : member)

            await service.add('group', { kind: 'user', subjectId: 'human' })

            expect(commands.execute).toHaveBeenCalledWith(
                new EnsureXpertProjectMemberCommand('project', 'human', manager as unknown as EntityManager)
            )
            expect(commands.execute.mock.invocationCallOrder[0]).toBeLessThan(manager.save.mock.invocationCallOrder[0])
        }
    )

    it.each(['unbound', 'assistant'])('does not grant Project membership for %s invitations', async (kind) => {
        const { service, group, manager, commands } = setup()
        group.projectId = kind === 'assistant' ? 'project' : null
        manager.findOneBy.mockResolvedValueOnce(null)
        await service.add('group', { kind: kind === 'assistant' ? 'assistant' : 'user', subjectId: 'human' })
        expect(commands.execute).not.toHaveBeenCalled()
    })

    it('does not activate a participant or change the group if Project membership is denied', async () => {
        const { service, group, member, manager, commands } = setup()
        group.projectId = 'project'
        member.active = false
        commands.execute.mockRejectedValue(new Error('project manager required'))
        await expect(service.add('group', { kind: 'user', subjectId: 'human' })).rejects.toThrow(
            'project manager required'
        )
        expect(member.active).toBe(false)
        expect(group.revision).toBe(1)
        expect(manager.save).not.toHaveBeenCalled()
    })

    it('does not grant Project access when the group is full', async () => {
        const { service, group, manager, commands } = setup()
        group.projectId = 'project'
        manager.findOneBy.mockResolvedValueOnce(null)
        manager.countBy.mockResolvedValueOnce(32)
        await expect(service.add('group', { kind: 'user', subjectId: 'human' })).rejects.toMatchObject({ status: 409 })
        expect(commands.execute).not.toHaveBeenCalled()
    })

    it('revokes membership before canceling the removed Assistant runtime', async () => {
        const { service, manager, commands, group } = setup()
        await expect(service.remove('group', 'member')).resolves.toEqual({ removed: true })
        expect(manager.update).toHaveBeenCalledWith(GroupParticipant, { id: 'member' }, { active: false })
        expect(group.revision).toBe(2)
        expect(commands.execute).toHaveBeenCalledWith(expect.any(CancelConversationCommand))
        expect(commands.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                input: { conversationId: 'runtime', threadId: 'thread', executionId: 'run' }
            })
        )
        expect(manager.save.mock.invocationCallOrder[0]).toBeLessThan(commands.execute.mock.invocationCallOrder[0])
    })
})
