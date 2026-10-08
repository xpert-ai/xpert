jest.mock('../../xpert-agent-execution/agent-execution.entity', () => ({ XpertAgentExecution: class {} }))
jest.mock('../../chat-message/chat-message.entity', () => ({ ChatMessage: class {} }))
import { CommandBus } from '@nestjs/cqrs'
import { DataSource, In, IsNull } from 'typeorm'
import { createResourceCardContent, IChatConversation } from '@xpert-ai/contracts'
import { ThreadActivityService } from './thread-activity.service'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { RefreshConversationResourceCardsCommand } from '../../chat-message/commands/refresh-resource-cards.command'

function fixture() {
    const date = new Date('2026-10-06T00:00:00Z')
    const runs = {
        find: jest.fn().mockResolvedValue([{ id: 'run', status: 'success', createdAt: date, updatedAt: date }])
    }
    const card = createResourceCardContent({
        resource: { namespace: 'example.resources', type: 'result', id: 'result' },
        title: 'Original title',
        open: { target: 'workbench.view', viewKey: 'example.resources__results' }
    })
    const query = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
            {
                id: 'message',
                executionId: 'run',
                content: [
                    { type: 'text', text: 'Result' },
                    { ...card, messageId: 'forged-message', executionId: 'forged-run' }
                ]
            }
        ])
    }
    const messages = {
        find: jest.fn().mockResolvedValue([{ executionId: 'run', updatedAt: date }]),
        createQueryBuilder: () => query
    }
    const dataSource = {
        getRepository: (entity: unknown) => {
            if (entity === XpertAgentExecution) return runs
            if (entity === ChatMessage) return messages
            throw new Error('Thread activity must only read runs and messages')
        }
    } as unknown as DataSource
    const projected = {
        ...card,
        data: { ...card.data, description: 'Updated' },
        messageId: 'message',
        executionId: 'run'
    }
    const commands = { execute: jest.fn().mockResolvedValue([projected]) }
    const service = new ThreadActivityService(dataSource, commands as unknown as CommandBus)
    const conversation = {
        id: 'conversation',
        tenantId: 'tenant',
        organizationId: 'org'
    } as IChatConversation
    return { service, conversation, runs, messages, query, commands, card, projected }
}

describe('thread activity discovery', () => {
    it('keeps completed runs and message revisions while delegating generic bound cards', async () => {
        const f = fixture()
        const snapshot = await f.service.snapshot(f.conversation, 'thread')
        const scope = { tenantId: 'tenant', organizationId: 'org' }
        expect(f.runs.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { ...scope, threadId: 'thread', parentId: IsNull() }
            })
        )
        expect(f.query.where).toHaveBeenCalledWith({
            ...scope,
            conversationId: 'conversation',
            role: 'ai',
            executionId: In(['run'])
        })
        expect(f.commands.execute).toHaveBeenCalledWith(
            new RefreshConversationResourceCardsCommand(f.conversation, 'thread', [
                { ...f.card, messageId: 'message', executionId: 'run' }
            ])
        )
        expect(snapshot).toEqual({
            version: 1,
            threadId: 'thread',
            runs: [
                {
                    id: 'run',
                    status: 'success',
                    createdAt: '2026-10-06T00:00:00.000Z',
                    updatedAt: '2026-10-06T00:00:00.000Z',
                    messageRevision: '2026-10-06T00:00:00.000Z'
                }
            ],
            cards: [f.projected]
        })
    })

    it('does not resolve cards when there are no executions', async () => {
        const f = fixture()
        f.runs.find.mockResolvedValue([])
        expect(await f.service.snapshot(f.conversation, 'thread')).toEqual({
            version: 1,
            threadId: 'thread',
            runs: [],
            cards: []
        })
        expect(f.query.getMany).not.toHaveBeenCalled()
        expect(f.commands.execute).not.toHaveBeenCalled()
    })

    it('ignores malformed cards and text without guessing resource types', async () => {
        const f = fixture()
        f.query.getMany.mockResolvedValue([
            { id: 'text', executionId: 'run', content: 'Created task' },
            { id: 'invalid', executionId: 'run', content: [{ type: 'resource_card', data: {} }] }
        ])
        f.commands.execute.mockResolvedValue([])
        expect((await f.service.snapshot(f.conversation, 'thread')).cards).toEqual([])
        expect(f.commands.execute).toHaveBeenCalledWith(
            new RefreshConversationResourceCardsCommand(f.conversation, 'thread', [])
        )
    })

    it('propagates host dispatch failures instead of silently publishing an incomplete snapshot', async () => {
        const f = fixture()
        f.commands.execute.mockRejectedValue(new Error('Forbidden'))
        await expect(f.service.snapshot(f.conversation, 'thread')).rejects.toThrow('Forbidden')
    })
})
