jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentTenantId: jest.fn(),
        getLanguageCode: jest.fn(),
        getOrganizationId: jest.fn()
    },
    TenantOrganizationBaseEntity: class TenantOrganizationBaseEntity {}
}))

jest.mock('../chat-conversation/conversation.entity', () => ({
    ChatConversation: class ChatConversation {}
}))

jest.mock('../chat-message/chat-message.entity', () => ({
    ChatMessage: class ChatMessage {}
}))

jest.mock('./xpert.entity', () => ({
    Xpert: class Xpert {}
}))

jest.mock('./xpert-frequent-question-cache.entity', () => ({
    XpertFrequentQuestionCache: class XpertFrequentQuestionCache {}
}))

jest.mock('../copilot-model', () => ({
    CopilotModelGetChatModelQuery: class CopilotModelGetChatModelQuery {
        constructor(
            public readonly copilot: unknown,
            public readonly copilotModel: unknown,
            public readonly options: unknown
        ) {}
    }
}))

import { RequestContext } from '@xpert-ai/server-core'
import { RunnableLambda } from '@langchain/core/runnables'
import type { QueryBus } from '@nestjs/cqrs'
import type { Repository } from 'typeorm'
import { XpertFrequentQuestionsService } from './xpert-frequent-questions.service'
import type { XpertFrequentQuestionCache } from './xpert-frequent-question-cache.entity'
import type { Xpert } from './xpert.entity'
import type { ChatConversation } from '../chat-conversation/conversation.entity'
import type { ChatMessage } from '../chat-message/chat-message.entity'

type MockRepository = {
    find: jest.Mock
    findOne: jest.Mock
    create: jest.Mock
    save: jest.Mock
}

describe('XpertFrequentQuestionsService', () => {
    let xpertRepository: MockRepository
    let conversationRepository: MockRepository
    let messageRepository: MockRepository
    let cacheRepository: MockRepository
    let queryBus: Pick<QueryBus, 'execute'>
    let service: XpertFrequentQuestionsService

    beforeEach(() => {
        ;(RequestContext.currentTenantId as jest.Mock).mockReturnValue('tenant-1')
        ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue('org-1')
        ;(RequestContext.getLanguageCode as jest.Mock).mockReturnValue('zh-Hans')

        xpertRepository = {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn((input?: Partial<Xpert>) => input ?? {}),
            save: jest.fn()
        }
        conversationRepository = {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn((input?: Partial<ChatConversation>) => input ?? {}),
            save: jest.fn()
        }
        messageRepository = {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn((input?: Partial<ChatMessage>) => input ?? {}),
            save: jest.fn()
        }
        cacheRepository = {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(() => ({})),
            save: jest.fn(async (input: XpertFrequentQuestionCache) => input)
        }
        queryBus = {
            execute: jest.fn()
        }

        service = new XpertFrequentQuestionsService(
            xpertRepository as unknown as Repository<Xpert>,
            conversationRepository as unknown as Repository<ChatConversation>,
            messageRepository as unknown as Repository<ChatMessage>,
            cacheRepository as unknown as Repository<XpertFrequentQuestionCache>,
            queryBus as QueryBus
        )
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('returns a valid cache without calling the model', async () => {
        ;(cacheRepository.findOne as jest.Mock).mockResolvedValue({
            xpertId: 'xpert-1',
            organizationId: 'org-1',
            locale: 'zh-Hans',
            questions: ['历史中最常问什么？'],
            generatedAt: new Date('2026-05-20T00:00:00.000Z'),
            expiresAt: new Date('2026-05-21T00:00:00.000Z'),
            sample: {
                windowDays: 90,
                conversationLimit: 50,
                questionCount: 5,
                conversationCount: 10,
                messageCount: 30,
                since: '2026-02-19T00:00:00.000Z',
                until: '2026-05-20T00:00:00.000Z'
            }
        })

        const result = await service.getFrequentQuestions('xpert-1', { locale: 'zh-Hans' })

        expect(result.cached).toBe(true)
        expect(result.questions).toEqual(['历史中最常问什么？'])
        expect(xpertRepository.findOne).not.toHaveBeenCalled()
        expect(queryBus.execute).not.toHaveBeenCalled()
    })

    it('caches an empty result when the history sample is too small', async () => {
        ;(cacheRepository.findOne as jest.Mock).mockResolvedValue(null)
        ;(xpertRepository.findOne as jest.Mock).mockResolvedValue({
            id: 'xpert-1',
            copilotModel: {
                model: 'gpt-test',
                copilotId: 'copilot-1'
            }
        })
        ;(conversationRepository.find as jest.Mock).mockResolvedValue([])

        const result = await service.getFrequentQuestions('xpert-1', { locale: 'zh-Hans' })

        expect(result.questions).toEqual([])
        expect(result.cached).toBe(false)
        expect(cacheRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                xpertId: 'xpert-1',
                locale: 'zh-Hans',
                questions: []
            })
        )
        expect(queryBus.execute).not.toHaveBeenCalled()
    })

    it('generates and caches up to five questions from recent user messages', async () => {
        ;(cacheRepository.findOne as jest.Mock).mockResolvedValue({
            xpertId: 'xpert-1',
            organizationId: 'org-1',
            locale: 'zh-Hans',
            questions: ['旧问题'],
            generatedAt: new Date('2026-05-18T00:00:00.000Z'),
            expiresAt: new Date('2026-05-18T12:00:00.000Z'),
            sample: null
        })
        ;(xpertRepository.findOne as jest.Mock).mockResolvedValue({
            id: 'xpert-1',
            copilotModel: {
                model: 'gpt-test',
                copilotId: 'copilot-1',
                copilot: { id: 'copilot-1' }
            }
        })
        ;(conversationRepository.find as jest.Mock).mockResolvedValue([
            { id: 'conversation-1', title: '资源分析' },
            { id: 'conversation-2', title: '质量检查' }
        ])
        ;(messageRepository.find as jest.Mock).mockResolvedValue([
            { conversationId: 'conversation-1', content: '帮我分析当前资源' },
            { conversationId: 'conversation-1', content: '这个资源有什么风险？' },
            { conversationId: 'conversation-2', content: '查看数据质量' }
        ])
        ;(queryBus.execute as jest.Mock).mockResolvedValue({
            withStructuredOutput: jest.fn(() =>
                RunnableLambda.from(async () => ({
                    questions: ['分析当前资源', '查看数据质量', '这个资源有什么风险？', '分析当前资源']
                }))
            )
        })

        const result = await service.getFrequentQuestions('xpert-1', { locale: 'zh-Hans' })

        expect(result.questions).toEqual(['分析当前资源', '查看数据质量', '这个资源有什么风险？'])
        expect(conversationRepository.find).toHaveBeenCalledWith(
            expect.objectContaining({
                take: 50
            })
        )
        expect(cacheRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                questions: ['分析当前资源', '查看数据质量', '这个资源有什么风险？']
            })
        )
    })

    it('does not overwrite cache when the model fails', async () => {
        ;(cacheRepository.findOne as jest.Mock).mockResolvedValue(null)
        ;(xpertRepository.findOne as jest.Mock).mockResolvedValue({
            id: 'xpert-1',
            copilotModel: {
                model: 'gpt-test',
                copilotId: 'copilot-1',
                copilot: { id: 'copilot-1' }
            }
        })
        ;(conversationRepository.find as jest.Mock).mockResolvedValue([{ id: 'conversation-1', title: '资源分析' }])
        ;(messageRepository.find as jest.Mock).mockResolvedValue([
            { conversationId: 'conversation-1', content: '帮我分析当前资源' },
            { conversationId: 'conversation-1', content: '查看数据质量' },
            { conversationId: 'conversation-1', content: '这个资源有什么风险？' }
        ])
        ;(queryBus.execute as jest.Mock).mockResolvedValue({
            withStructuredOutput: jest.fn(() =>
                RunnableLambda.from(async () => {
                    throw new Error('model failed')
                })
            )
        })

        const result = await service.getFrequentQuestions('xpert-1', { locale: 'zh-Hans' })

        expect(result.questions).toEqual([])
        expect(cacheRepository.save).not.toHaveBeenCalled()
    })
})
