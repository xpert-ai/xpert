jest.mock('../../conversation.service', () => ({
    ChatConversationService: class ChatConversationService {}
}))

import type { Repository, WhereExpressionBuilder } from 'typeorm'
import { Brackets } from 'typeorm'
import { ChatConversation } from '../../conversation.entity'
import { ChatConversationService } from '../../conversation.service'
import { ChatConversationLogsQuery } from '../conversation-logs.query'
import { ChatConversationLogsHandler } from './conversation-logs.handler'

type QueryBuilderMock = {
    leftJoin: jest.Mock
    where: jest.Mock
    andWhere: jest.Mock
    orderBy: jest.Mock
    skip: jest.Mock
    take: jest.Mock
    offset: jest.Mock
    limit: jest.Mock
    select: jest.Mock
    getRawAndEntities: jest.Mock
    getCount: jest.Mock
}

function createQueryBuilderMock({
    entities = [{ id: 'conversation-1' }],
    total = 42,
    raw = entities.map((entity) => ({
        conversationLog_conversationId: entity.id
    }))
}: {
    entities?: Array<{ id: string }>
    total?: number
    raw?: Record<string, unknown>[]
} = {}): QueryBuilderMock {
    const queryBuilder: QueryBuilderMock = {
        leftJoin: jest.fn(),
        where: jest.fn(),
        andWhere: jest.fn(),
        orderBy: jest.fn(),
        skip: jest.fn(),
        take: jest.fn(),
        offset: jest.fn(),
        limit: jest.fn(),
        select: jest.fn(),
        getRawAndEntities: jest.fn().mockResolvedValue({ raw, entities }),
        getCount: jest.fn().mockResolvedValue(total)
    }

    for (const method of [
        queryBuilder.leftJoin,
        queryBuilder.where,
        queryBuilder.andWhere,
        queryBuilder.orderBy,
        queryBuilder.skip,
        queryBuilder.take,
        queryBuilder.offset,
        queryBuilder.limit,
        queryBuilder.select
    ]) {
        method.mockReturnValue(queryBuilder)
    }

    return queryBuilder
}

function createHandler(
    queryBuilders: QueryBuilderMock[],
    {
        findResult = [{ id: 'conversation-1' }],
        messageCountRows = [],
        auditRows = []
    }: {
        findResult?: Array<{ id: string; [key: string]: unknown }>
        messageCountRows?: Record<string, unknown>[]
        auditRows?: Record<string, unknown>[]
    } = {}
) {
    const repository = {
        createQueryBuilder: jest.fn(),
        find: jest.fn().mockResolvedValue(findResult),
        manager: {
            query: jest.fn().mockResolvedValueOnce(messageCountRows).mockResolvedValueOnce(auditRows)
        }
    }
    queryBuilders.forEach((queryBuilder) => repository.createQueryBuilder.mockReturnValueOnce(queryBuilder))

    const handler = new ChatConversationLogsHandler(
        repository as unknown as Repository<ChatConversation>,
        {} as unknown as ChatConversationService
    )

    return { handler, repository }
}

describe('ChatConversationLogsHandler', () => {
    it('paginates conversation ids before loading log rows', async () => {
        const pageIdsQuery = createQueryBuilderMock({
            entities: [{ id: 'conversation-1' }, { id: 'conversation-2' }]
        })
        const countQuery = createQueryBuilderMock({ total: 42 })
        const { handler, repository } = createHandler([pageIdsQuery, countQuery], {
            findResult: [{ id: 'conversation-2' }, { id: 'conversation-1' }],
            messageCountRows: [
                { conversationId: 'conversation-1', messageCount: 2 },
                { conversationId: 'conversation-2', messageCount: 3 }
            ]
        })
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
            items: [
                { id: 'conversation-1', messageCount: 2 },
                { id: 'conversation-2', messageCount: 3 }
            ],
            total: 42
        })
        expect(pageIdsQuery.select).toHaveBeenCalledWith('conversation.id')
        expect(pageIdsQuery.where).toHaveBeenCalledWith(where)
        expect(pageIdsQuery.orderBy).toHaveBeenCalledWith('conversation.createdAt', 'DESC')
        expect(pageIdsQuery.offset).toHaveBeenCalledWith(20)
        expect(pageIdsQuery.limit).toHaveBeenCalledWith(10)
        expect(pageIdsQuery.skip).not.toHaveBeenCalled()
        expect(pageIdsQuery.take).not.toHaveBeenCalled()
        expect(pageIdsQuery.getRawAndEntities).toHaveBeenCalledTimes(1)
        expect(countQuery.where).toHaveBeenCalledWith(where)
        expect(countQuery.getCount).toHaveBeenCalledTimes(1)
        expect(repository.find).toHaveBeenCalledWith(
            expect.objectContaining({
                relations: ['xpert']
            })
        )
        expect(repository.manager.query).toHaveBeenCalledTimes(2)
    })

    it('maps conversation source audit metadata before execution fallback metadata', async () => {
        const pageIdsQuery = createQueryBuilderMock({
            entities: [{ id: 'conversation-1' }]
        })
        const countQuery = createQueryBuilderMock({ total: 1 })
        const { handler } = createHandler([pageIdsQuery, countQuery], {
            findResult: [
                {
                    id: 'conversation-1',
                    sourceAudit: {
                        sourceIntegrationId: 'conversation-integration',
                        channelType: 'wechat',
                        sourceMessageLogIds: ['conversation-log-1', 'conversation-log-2']
                    }
                }
            ],
            auditRows: [
                {
                    conversationId: 'conversation-1',
                    sourceIntegrationId: 'execution-integration',
                    channelType: 'api',
                    sourceMessageLogIds: ['execution-log-1']
                }
            ]
        })

        const result = await handler.execute(
            new ChatConversationLogsQuery({
                where: {
                    xpertId: 'xpert-1'
                }
            })
        )

        expect(result).toEqual({
            items: [
                {
                    id: 'conversation-1',
                    sourceAudit: {
                        sourceIntegrationId: 'conversation-integration',
                        channelType: 'wechat',
                        sourceMessageLogIds: ['conversation-log-1', 'conversation-log-2']
                    },
                    messageCount: 0,
                    sourceIntegrationId: 'conversation-integration',
                    channelType: 'wechat',
                    sourceMessageLogIds: ['conversation-log-1', 'conversation-log-2']
                }
            ],
            total: 1
        })
    })

    it('maps latest root execution audit metadata from raw projection', async () => {
        const pageIdsQuery = createQueryBuilderMock({
            entities: [{ id: 'conversation-1' }]
        })
        const countQuery = createQueryBuilderMock({ total: 1 })
        const { handler } = createHandler([pageIdsQuery, countQuery], {
            findResult: [{ id: 'conversation-1' }],
            auditRows: [
                {
                    conversationId: 'conversation-1',
                    sourceIntegrationId: 'integration-1',
                    channelType: 'wechat',
                    sourceMessageLogIds: ['message-log-1', 'message-log-2']
                }
            ]
        })

        const result = await handler.execute(
            new ChatConversationLogsQuery({
                where: {
                    xpertId: 'xpert-1'
                }
            })
        )

        expect(result).toEqual({
            items: [
                {
                    id: 'conversation-1',
                    messageCount: 0,
                    sourceIntegrationId: 'integration-1',
                    channelType: 'wechat',
                    sourceMessageLogIds: ['message-log-1', 'message-log-2']
                }
            ],
            total: 1
        })
    })

    it('falls back to raw conversation id aliases when page entities are not hydrated', async () => {
        const pageIdsQuery = createQueryBuilderMock({
            entities: [],
            raw: [{ conversation_id: 'conversation-1' }]
        })
        const countQuery = createQueryBuilderMock({ total: 1 })
        const { handler, repository } = createHandler([pageIdsQuery, countQuery], {
            findResult: [{ id: 'conversation-1' }]
        })

        const result = await handler.execute(
            new ChatConversationLogsQuery({
                where: {
                    xpertId: 'xpert-1'
                },
                take: 20,
                skip: 0
            })
        )

        expect(result).toEqual({
            items: [{ id: 'conversation-1', messageCount: 0 }],
            total: 1
        })
        expect(repository.find).toHaveBeenCalledTimes(1)
    })

    it('adds a parameterized search condition across conversation and created-by fields', async () => {
        const pageIdsQuery = createQueryBuilderMock()
        const countQuery = createQueryBuilderMock()
        const { handler } = createHandler([pageIdsQuery, countQuery])

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

        expect(pageIdsQuery.leftJoin).toHaveBeenCalledWith('conversation.createdBy', 'createdBy')
        expect(countQuery.leftJoin).toHaveBeenCalledWith('conversation.createdBy', 'createdBy')
        expect(pageIdsQuery.andWhere).toHaveBeenCalledTimes(1)
        expect(countQuery.andWhere).toHaveBeenCalledTimes(1)

        const bracketCandidate: unknown = pageIdsQuery.andWhere.mock.calls[0][0]
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
        const pageIdsQuery = createQueryBuilderMock()
        const countQuery = createQueryBuilderMock()
        const { handler, repository } = createHandler([pageIdsQuery, countQuery])

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

        expect(repository.find).toHaveBeenCalledWith(
            expect.objectContaining({
                relations: ['createdBy']
            })
        )
        expect(pageIdsQuery.leftJoin).toHaveBeenCalledWith('conversation.createdBy', 'createdBy')
        expect(countQuery.leftJoin).toHaveBeenCalledWith('conversation.createdBy', 'createdBy')
    })
})
