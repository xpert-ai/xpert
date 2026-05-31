import type { Repository } from 'typeorm'
import { RequestContext } from '@xpert-ai/server-core'
import { ChatConversation } from '../../conversation.entity'
import { StatisticsDailyMessagesQuery } from '../statistics-daily-messages.query'
import { StatisticsDailyMessagesHandler } from './statistics-daily-messages.handler'

jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentTenantId: jest.fn(),
        getOrganizationId: jest.fn(),
        currentUserId: jest.fn()
    }
}))

jest.mock('../../conversation.entity', () => ({
    ChatConversation: class {}
}))

describe('StatisticsDailyMessagesHandler', () => {
    const createQueryBuilder = () => ({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([])
    })

    beforeEach(() => {
        ;(RequestContext.currentTenantId as jest.Mock).mockReturnValue('tenant-1')
        ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue('org-1')
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-current')
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('filters model counts by each message execution model', async () => {
        const queryBuilder = createQueryBuilder()
        const repository = {
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder)
        }
        const handler = new StatisticsDailyMessagesHandler(
            repository as unknown as Repository<ChatConversation>,
            undefined as never
        )

        await handler.execute(
            new StatisticsDailyMessagesQuery('2026-05-01', '2026-05-28', undefined, undefined, {
                model: 'openai/gpt-4o'
            })
        )

        expect(queryBuilder.innerJoin).toHaveBeenCalledWith(
            'xpert_agent_execution',
            'message_execution',
            'message_execution.id = chat_message."executionId"'
        )
        expect(queryBuilder.leftJoin).toHaveBeenCalledWith(
            'xpert_agent_execution',
            'message_subexecution',
            'message_subexecution."parentId" = message_execution.id'
        )
        expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('message_execution.metadata'), {
            filterModel: 'openai/gpt-4o'
        })
    })
})
