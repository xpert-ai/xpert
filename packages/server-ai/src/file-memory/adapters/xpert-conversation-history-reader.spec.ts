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
                where: [
                    {
                        id: 'conversation-other-user',
                        xpertId: 'xpert-1',
                        tenantId: 'tenant-1',
                        createdById: 'user-1'
                    }
                ]
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
                where: [
                    {
                        id: 'conversation-other-project',
                        xpertId: 'xpert-1',
                        tenantId: 'tenant-1',
                        projectId: 'project-1'
                    }
                ]
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
})
