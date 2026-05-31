import { RequestContext } from '@xpert-ai/server-core'
import { DataSource } from 'typeorm'
import { StatisticsXpertMessagesQuery } from '../statistics-xpert-messages.query'
import { StatisticsXpertMessagesHandler } from './statistics-xpert-messages.handler'

jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentTenantId: jest.fn(),
        getOrganizationId: jest.fn()
    }
}))

jest.mock('../../../core/entities/internal', () => ({
    ChatConversation: class {}
}))

describe('StatisticsXpertMessagesHandler', () => {
    const createQueryBuilder = () => ({
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
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('filters xpert message counts by each message execution model', async () => {
        const queryBuilder = createQueryBuilder()
        const dataSource = {
            getRepository: jest.fn().mockReturnValue({
                createQueryBuilder: jest.fn().mockReturnValue(queryBuilder)
            })
        }
        const handler = new StatisticsXpertMessagesHandler(dataSource as unknown as DataSource)

        await handler.execute(
            new StatisticsXpertMessagesQuery('2026-05-01', '2026-05-28', {
                model: 'openai/gpt-4o'
            })
        )

        expect(queryBuilder.innerJoin).toHaveBeenCalledWith(
            'xpert_agent_execution',
            'message_execution',
            'message_execution.id = message."executionId"'
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
