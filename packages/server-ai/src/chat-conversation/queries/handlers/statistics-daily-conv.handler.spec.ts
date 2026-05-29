import type { Repository } from 'typeorm'
import { RequestContext } from '@xpert-ai/server-core'
import { ChatConversation } from '../../../core/entities/internal'
import { StatisticsDailyConvQuery } from '../statistics-daily-conv.query'
import { StatisticsDailyConvHandler } from './statistics-daily-conv.handler'

jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentTenantId: jest.fn(),
        getOrganizationId: jest.fn()
    }
}))

jest.mock('../../../core/entities/internal', () => ({
    ChatConversation: class {}
}))

describe('StatisticsDailyConvHandler', () => {
    const createQueryBuilder = () => {
        const queryBuilder = {
            select: jest.fn().mockReturnThis(),
            addSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            addGroupBy: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            getRawMany: jest.fn().mockResolvedValue([])
        }

        return queryBuilder
    }

    beforeEach(() => {
        ;(RequestContext.currentTenantId as jest.Mock).mockReturnValue('tenant-1')
        ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue('org-1')
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('applies user and model filters to organization conversation counts', async () => {
        const queryBuilder = createQueryBuilder()
        const repository = {
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder)
        }
        const handler = new StatisticsDailyConvHandler(
            repository as unknown as Repository<ChatConversation>,
            undefined as never
        )
        const query = Object.assign(new StatisticsDailyConvQuery('2026-05-01', '2026-05-28'), {
            filters: {
                userId: 'user-1',
                model: 'openai/gpt-4o'
            }
        })

        await handler.execute(query)

        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
            'COALESCE(conversation."fromEndUserId", conversation."createdById"::text) = :filterUserId',
            { filterUserId: 'user-1' }
        )
        expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('model_execution.metadata'), {
            filterModel: 'openai/gpt-4o'
        })
    })
})
