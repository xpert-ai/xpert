jest.mock('../../conversation.service', () => ({
    ChatConversationService: class ChatConversationService {}
}))

import { ChatConversationLogsHandler } from './conversation-logs.handler'
import { ChatConversationLogsQuery } from '../conversation-logs.query'

describe('ChatConversationLogsHandler', () => {
    it('counts logs with the same repository scope as the query items', async () => {
        const queryBuilder = {
            leftJoin: jest.fn().mockReturnThis(),
            leftJoinAndMapOne: jest.fn().mockReturnThis(),
            loadRelationCountAndMap: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue([{ id: 'conversation-1' }])
        }
        const repository = {
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
            count: jest.fn().mockResolvedValue(42)
        }
        const service = {
            count: jest.fn()
        }
        const where = {
            xpertId: 'xpert-1'
        }

        const handler = new ChatConversationLogsHandler(repository as any, service as any)
        const result = await handler.execute(
            new ChatConversationLogsQuery({
                where,
                relations: ['messages', 'xpert'],
                order: {
                    createdAt: 'DESC'
                },
                skip: 20,
                take: 10
            })
        )

        expect(result).toEqual({
            items: [{ id: 'conversation-1' }],
            total: 42
        })
        expect(repository.count).toHaveBeenCalledWith({ where })
        expect(service.count).not.toHaveBeenCalled()
    })
})
