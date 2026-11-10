import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { ChatConversation } from '../../../chat-conversation/conversation.entity'
import { ResolveConversationResourceScopeHandler } from './conversation-resource-scope.handler'
import { ResolveConversationResourceScopeCommand } from '../conversation-resource-scope.command'

async function fixture() {
    const scope = {
        actor: { tenantId: 'tenant', organizationId: 'org', userId: 'user' },
        projectId: 'project',
        assistantId: 'assistant',
        conversationId: 'runtime'
    }
    const conversation = {
        id: 'runtime',
        projectId: 'project',
        xpertId: 'assistant',
        threadId: 'thread',
        purpose: 'group_assistant_runtime'
    }
    const findConversation = jest.fn().mockResolvedValue(conversation)
    const findMember = jest.fn().mockResolvedValue({ groupId: 'group' })
    const execute = jest.fn().mockResolvedValue({ groupId: 'group', projectId: 'project' })
    const module = await Test.createTestingModule({
        providers: [
            ResolveConversationResourceScopeHandler,
            {
                provide: DataSource,
                useValue: {
                    getRepository: (entity: object) => ({
                        findOneBy: entity === ChatConversation ? findConversation : findMember
                    })
                }
            },
            { provide: CommandBus, useValue: { execute } }
        ]
    }).compile()
    return {
        handler: module.get(ResolveConversationResourceScopeHandler),
        scope,
        conversation,
        findConversation,
        findMember,
        execute
    }
}

it('derives audience from the active runtime and verifies the human membership on each request', async () => {
    const f = await fixture()
    expect(await f.handler.execute(new ResolveConversationResourceScopeCommand(f.scope))).toEqual({ groupId: 'group' })
    expect(f.findConversation).toHaveBeenCalledWith({ tenantId: 'tenant', organizationId: 'org', id: 'runtime' })
    expect(f.findMember).toHaveBeenCalledWith(
        expect.objectContaining({
            runtimeConversationId: 'runtime',
            runtimeThreadId: 'thread',
            active: true,
            subjectId: 'assistant'
        })
    )
    expect(f.execute).toHaveBeenCalledWith(expect.objectContaining({ actor: f.scope.actor, groupId: 'group' }))
    f.execute.mockRejectedValue(new Error('membership revoked'))
    await expect(f.handler.execute(new ResolveConversationResourceScopeCommand(f.scope))).rejects.toThrow(
        'membership revoked'
    )
})

it('rejects stale binding, inactive runtime, missing thread, public group IDs and a different Assistant', async () => {
    for (const change of [
        (f: Awaited<ReturnType<typeof fixture>>) =>
            f.execute.mockResolvedValue({ groupId: 'group', projectId: 'new-project' }),
        (f: Awaited<ReturnType<typeof fixture>>) => f.findMember.mockResolvedValue(null),
        (f: Awaited<ReturnType<typeof fixture>>) => {
            f.conversation.threadId = ''
        },
        (f: Awaited<ReturnType<typeof fixture>>) => {
            f.conversation.purpose = 'group'
        },
        (f: Awaited<ReturnType<typeof fixture>>) => {
            f.conversation.xpertId = 'other'
        }
    ]) {
        const f = await fixture()
        change(f)
        await expect(f.handler.execute(new ResolveConversationResourceScopeCommand(f.scope))).rejects.toThrow()
    }
})
