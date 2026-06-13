jest.mock('../../conversation.service', () => ({
    ChatConversationService: class ChatConversationService {}
}))

import type { Repository, SelectQueryBuilder, WhereExpressionBuilder } from 'typeorm'
import { Brackets } from 'typeorm'
import { ChatConversation } from '../../conversation.entity'
import { ChatConversationService } from '../../conversation.service'
import { ChatConversationLogsQuery } from '../conversation-logs.query'
import { ChatConversationLogsHandler } from './conversation-logs.handler'

type QueryBuilderMock = {
    leftJoin: jest.Mock
    leftJoinAndMapOne: jest.Mock
    loadRelationCountAndMap: jest.Mock
    where: jest.Mock
    leftJoinAndSelect: jest.Mock
    andWhere: jest.Mock
    orderBy: jest.Mock
    skip: jest.Mock
    take: jest.Mock
    getManyAndCount: jest.Mock
}

function createQueryBuilderMock(items = [{ id: 'conversation-1' }], total = 42): QueryBuilderMock {
    const queryBuilder: QueryBuilderMock = {
        leftJoin: jest.fn(),
        leftJoinAndMapOne: jest.fn(),
        loadRelationCountAndMap: jest.fn(),
        where: jest.fn(),
        leftJoinAndSelect: jest.fn(),
        andWhere: jest.fn(),
        orderBy: jest.fn(),
        skip: jest.fn(),
        take: jest.fn(),
        getManyAndCount: jest.fn().mockResolvedValue([items, total])
    }

    for (const method of [
        queryBuilder.leftJoin,
        queryBuilder.leftJoinAndMapOne,
        queryBuilder.loadRelationCountAndMap,
        queryBuilder.where,
        queryBuilder.leftJoinAndSelect,
        queryBuilder.andWhere,
        queryBuilder.orderBy,
        queryBuilder.skip,
        queryBuilder.take
    ]) {
        method.mockReturnValue(queryBuilder)
    }

    return queryBuilder
}

function createHandler(queryBuilder: QueryBuilderMock) {
    const repository = {
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder)
    }

    const handler = new ChatConversationLogsHandler(
        repository as unknown as Repository<ChatConversation>,
        {} as unknown as ChatConversationService
    )

    return { handler, repository }
}

describe('ChatConversationLogsHandler', () => {
    it('returns logs and total from one query so search affects both', async () => {
        const queryBuilder = createQueryBuilderMock([{ id: 'conversation-1' }], 42)
        const { handler } = createHandler(queryBuilder)
        const where = {
            xpertId: 'xpert-1'
        }

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
        expect(queryBuilder.where).toHaveBeenCalledWith(where)
        expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('conversation.xpert', 'xpert')
        expect(queryBuilder.orderBy).toHaveBeenCalledWith('conversation.createdAt', 'DESC')
        expect(queryBuilder.skip).toHaveBeenCalledWith(20)
        expect(queryBuilder.take).toHaveBeenCalledWith(10)
        expect(queryBuilder.getManyAndCount).toHaveBeenCalledTimes(1)
    })

    it('adds a parameterized search condition across conversation and created-by fields', async () => {
        const queryBuilder = createQueryBuilderMock()
        const { handler } = createHandler(queryBuilder)

        await handler.execute(
            new ChatConversationLogsQuery(
                {
                    where: {
                        xpertId: 'xpert-1'
                    },
                    relations: []
                },
                'admin'
            )
        )

        expect(queryBuilder.leftJoin).toHaveBeenCalledWith('conversation.createdBy', 'createdBy')
        expect(queryBuilder.andWhere).toHaveBeenCalledTimes(1)

        const bracketCandidate: unknown = queryBuilder.andWhere.mock.calls[0][0]
        expect(bracketCandidate).toBeInstanceOf(Brackets)
        const brackets = bracketCandidate as Brackets

        const whereBuilder = {
            where: jest.fn().mockReturnThis(),
            orWhere: jest.fn().mockReturnThis()
        }
        brackets.whereFactory(whereBuilder as unknown as WhereExpressionBuilder)

        expect(whereBuilder.where).toHaveBeenCalledWith('conversation.title ILIKE :search', {
            search: '%admin%'
        })
        expect(whereBuilder.orWhere).toHaveBeenCalledWith('createdBy.email ILIKE :search', {
            search: '%admin%'
        })
    })

    it('selects createdBy once when it is requested and also searched', async () => {
        const queryBuilder = createQueryBuilderMock()
        const { handler } = createHandler(queryBuilder)

        await handler.execute(
            new ChatConversationLogsQuery(
                {
                    where: {
                        xpertId: 'xpert-1'
                    },
                    relations: ['createdBy']
                },
                'admin'
            )
        )

        expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('conversation.createdBy', 'createdBy')
        expect(queryBuilder.leftJoin).not.toHaveBeenCalledWith('conversation.createdBy', 'createdBy')
    })
})
