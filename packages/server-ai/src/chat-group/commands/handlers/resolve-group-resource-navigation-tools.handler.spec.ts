import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { ChatConversation } from '../../../chat-conversation/conversation.entity'
import { GroupMessageRecipient, GroupParticipant } from '../../group.entity'
import { GroupResourceToolsService } from '../../group-resource-tools.service'
import { withGroupRuntime } from '../../group-runtime-context'
import { ResolveGroupResourceNavigationToolsCommand } from '../resolve-group-resource-navigation-tools.command'
import { ResolveGroupResourceNavigationToolsHandler } from './resolve-group-resource-navigation-tools.handler'

async function fixture() {
    const invocation = {
        tenantId: 'tenant',
        organizationId: 'org',
        conversationId: 'runtime',
        assistantId: 'assistant',
        projectId: 'project',
        threadId: 'thread'
    }
    const conversation = Object.assign(new ChatConversation(), {
        id: 'runtime',
        purpose: 'group_assistant_runtime',
        projectId: 'project'
    })
    const member = Object.assign(new GroupParticipant(), { id: 'member', groupId: 'group' })
    const receipt = Object.assign(new GroupMessageRecipient(), {
        id: 'admitted-delivery',
        status: 'starting',
        executionId: 'execution'
    })
    const conversations = jest.fn().mockResolvedValue(conversation)
    const members = jest.fn().mockResolvedValue(member)
    const receipts = jest.fn().mockResolvedValue(receipt)
    const createNavigationTools = jest.fn().mockReturnValue([])
    const module = await Test.createTestingModule({
        providers: [
            ResolveGroupResourceNavigationToolsHandler,
            { provide: GroupResourceToolsService, useValue: { createNavigationTools } },
            {
                provide: DataSource,
                useValue: {
                    getRepository: (entity: object) => {
                        if (entity === ChatConversation) return { findOneBy: conversations }
                        if (entity === GroupParticipant) return { findOneBy: members }
                        if (entity === GroupMessageRecipient) return { findOneBy: receipts }
                        throw new Error('Unexpected repository')
                    }
                }
            }
        ]
    }).compile()
    const run = () =>
        module
            .get(ResolveGroupResourceNavigationToolsHandler)
            .execute(new ResolveGroupResourceNavigationToolsCommand(invocation))
    return {
        module,
        invocation,
        conversation,
        member,
        receipt,
        conversations,
        members,
        receipts,
        createNavigationTools,
        run
    }
}

it('only selects Project navigation after verifying an ordinary persisted conversation', async () => {
    const f = await fixture()
    f.conversation.purpose = 'private'
    expect(await f.run()).toEqual({ scope: 'project' })
    expect(f.conversations).toHaveBeenCalledWith({ tenantId: 'tenant', organizationId: 'org', id: 'runtime' })
    expect(f.createNavigationTools).not.toHaveBeenCalled()
    f.conversations.mockResolvedValue(null)
    await expect(f.run()).rejects.toThrow()
    await f.module.close()
})

it('uses the exact admitted delivery even when steering shares an execution ID', async () => {
    const f = await fixture()
    f.receipt.status = 'steering'
    expect(await withGroupRuntime('runtime', f.run, 'admitted-delivery')).toEqual({ scope: 'group', tools: [] })
    expect(f.receipts).toHaveBeenCalledWith({
        tenantId: 'tenant',
        organizationId: 'org',
        id: 'admitted-delivery',
        groupId: 'group',
        participantId: 'member'
    })
    expect(f.members).toHaveBeenCalledWith(
        expect.objectContaining({
            subjectId: 'assistant',
            runtimeConversationId: 'runtime',
            runtimeThreadId: 'thread',
            active: true
        })
    )
    expect(f.createNavigationTools).toHaveBeenCalledWith(f.receipt, f.member)
    await f.module.close()
})

it('rejects absent or foreign runtime context without allowing Project fallback', async () => {
    const f = await fixture()
    await expect(f.run()).rejects.toThrow()
    await expect(withGroupRuntime('runtime', f.run)).rejects.toThrow()
    await expect(withGroupRuntime('other', f.run, 'admitted-delivery')).rejects.toThrow()
    f.conversation.purpose = 'private'
    await expect(withGroupRuntime('runtime', f.run, 'admitted-delivery')).rejects.toThrow()
    expect(f.createNavigationTools).not.toHaveBeenCalled()
    await f.module.close()
})

it.each(['membership', 'receipt', 'canceled', 'project'] as const)(
    'fails closed after %s revocation/change',
    async (reason) => {
        const f = await fixture()
        if (reason === 'membership') f.members.mockResolvedValue(null)
        if (reason === 'receipt') f.receipts.mockResolvedValue(null)
        if (reason === 'canceled') f.receipt.status = 'canceled'
        if (reason === 'project') f.conversation.projectId = 'other-project'
        await expect(withGroupRuntime('runtime', f.run, 'admitted-delivery')).rejects.toThrow()
        expect(f.createNavigationTools).not.toHaveBeenCalled()
        await f.module.close()
    }
)
