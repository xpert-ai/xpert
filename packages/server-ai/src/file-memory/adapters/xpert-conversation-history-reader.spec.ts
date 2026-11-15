import type { Repository } from 'typeorm'
import { ChatConversation, ChatMessage } from '../../core/entities/internal'
import { XpertConversationHistoryReader } from './xpert-conversation-history-reader'

describe('XpertConversationHistoryReader', () => {
    let conversationRepository: { find: jest.Mock }
    let messageRepository: { createQueryBuilder: jest.Mock }
    let reader: XpertConversationHistoryReader

    beforeEach(() => {
        conversationRepository = {
            find: jest.fn().mockResolvedValue([])
        }
        messageRepository = {
            createQueryBuilder: jest.fn()
        }
        reader = new XpertConversationHistoryReader(
            conversationRepository as unknown as Repository<ChatConversation>,
            messageRepository as unknown as Repository<ChatMessage>
        )
    })

    it('filters user-isolated Dream evidence by the conversation owner', async () => {
        await reader.readSnippets({
            xpert: {
                tenantId: 'tenant-1',
                id: 'xpert-1',
                userId: 'user-1',
                workspaceDataScope: 'user'
            },
            conversationIds: ['conversation-other-user'],
            maxMessages: 10,
            maxBytes: 10_000
        })

        expect(conversationRepository.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    xpertId: 'xpert-1',
                    tenantId: 'tenant-1',
                    createdById: 'user-1',
                    purpose: 'private'
                })
            })
        )
        expect(messageRepository.createQueryBuilder).not.toHaveBeenCalled()
    })

    it('filters project Dream evidence by project id even when the xpert policy is user-isolated', async () => {
        await reader.readSnippets({
            xpert: {
                tenantId: 'tenant-1',
                id: 'xpert-1',
                projectId: 'project-1',
                userId: 'user-1',
                workspaceDataScope: 'user'
            },
            conversationIds: ['conversation-other-project'],
            maxMessages: 10,
            maxBytes: 10_000
        })

        expect(conversationRepository.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    xpertId: 'xpert-1',
                    tenantId: 'tenant-1',
                    projectId: 'project-1',
                    purpose: 'private'
                })
            })
        )
    })

    it('fails closed when a user-isolated scope has no user id', async () => {
        await expect(
            reader.readSnippets({
                xpert: {
                    tenantId: 'tenant-1',
                    id: 'xpert-1',
                    workspaceDataScope: 'user'
                },
                conversationIds: ['conversation-1'],
                maxMessages: 10,
                maxBytes: 10_000
            })
        ).resolves.toEqual([])

        expect(conversationRepository.find).not.toHaveBeenCalled()
    })
    it('looks up old cited turns before loading nearby replies and keeps private evidence off shared volumes', async () => {
        const input = {
            xpert: { id: 'x', tenantId: 't', userId: 'u', workspaceDataScope: 'user' as const },
            conversationIds: ['c'],
            anchors: [{ conversationId: 'c', messageId: 'old' }],
            maxMessages: 3,
            maxBytes: 10000
        }
        const query = {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            addOrderBy: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            getMany: jest.fn()
        }
        messageRepository.createQueryBuilder.mockReturnValue(query)
        conversationRepository.find.mockResolvedValue([{ id: 'c' }])
        const opening = { id: 'old', conversationId: 'c', role: 'human', content: '原始口径' }
        query.getMany.mockResolvedValueOnce([opening]).mockResolvedValueOnce([
            {
                id: 'reply',
                conversationId: 'c',
                parentId: 'old',
                role: 'ai',
                content: '已核对',
                events: [
                    { category: 'Tool', tool: 'report', status: 'success', input: 'private input', output: '业务输出' },
                    { category: 'Tool', tool: 'memory_get', status: 'success', output: 'retrieved note' },
                    { category: 'Tool', status: 'error', output: 'error output' }
                ]
            },
            { id: 'mismatch', conversationId: 'other', parentId: 'old', role: 'ai', content: '其他会话' }
        ])
        const snippets = await reader.readSnippets(input)
        expect(query.andWhere).toHaveBeenCalledWith('m.id IN (:...idsOfMessages)', { idsOfMessages: ['old'] })
        expect(snippets.map((row) => row.messageId)).toEqual(['old', 'reply'])
        expect(snippets[1].outputs).toEqual([{ text: '业务输出', truncated: false }])
        expect(JSON.stringify(snippets)).not.toContain('private input')
        expect(
            await reader.readSnippets({ ...input, xpert: { ...input.xpert, workspaceDataScope: 'shared' } })
        ).toEqual([])
        expect(conversationRepository.find).toHaveBeenCalledTimes(1)
    })
    it('does not substitute recent messages when the exact anchor cannot be resolved', async () => {
        conversationRepository.find.mockResolvedValue([{ id: 'c' }])
        const q = {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            addOrderBy: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue([{ id: 'old', conversationId: 'different' }])
        }
        messageRepository.createQueryBuilder.mockReturnValue(q)
        expect(
            await reader.readSnippets({
                xpert: { id: 'x', tenantId: 't', userId: 'u', workspaceDataScope: 'user' },
                conversationIds: ['c'],
                anchors: [{ conversationId: 'c', messageId: 'old' }],
                maxMessages: 10,
                maxBytes: 10000
            })
        ).toEqual([])
        expect(q.getMany).toHaveBeenCalledTimes(1)
    })
})
