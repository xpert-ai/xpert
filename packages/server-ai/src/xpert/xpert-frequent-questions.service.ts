import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import {
    CopilotMessageType,
    XpertFrequentQuestionsRequest,
    XpertFrequentQuestionsResponse,
    XpertFrequentQuestionsSample
} from '@xpert-ai/contracts'
import { stringifyMessageContent } from '@xpert-ai/copilot'
import { getErrorMessage } from '@xpert-ai/server-common'
import { RequestContext } from '@xpert-ai/server-core'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, MoreThanOrEqual, Repository } from 'typeorm'
import { z } from 'zod'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { CopilotModelGetChatModelQuery } from '../copilot-model'
import { XpertFrequentQuestionCache } from './xpert-frequent-question-cache.entity'
import { Xpert } from './xpert.entity'

const DEFAULT_WINDOW_DAYS = 90
const DEFAULT_CONVERSATION_LIMIT = 50
const DEFAULT_QUESTION_COUNT = 5
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const MODEL_TIMEOUT_MS = 15 * 1000
const MIN_HISTORY_MESSAGES = 3
const MAX_MESSAGE_CHARS = 800
const MAX_HISTORY_MESSAGES = 120

type ConversationHistory = {
    conversationId: string
    title?: string
    messages: string[]
}

@Injectable()
export class XpertFrequentQuestionsService {
    readonly #logger = new Logger(XpertFrequentQuestionsService.name)

    constructor(
        @InjectRepository(Xpert)
        private readonly xpertRepository: Repository<Xpert>,
        @InjectRepository(ChatConversation)
        private readonly conversationRepository: Repository<ChatConversation>,
        @InjectRepository(ChatMessage)
        private readonly messageRepository: Repository<ChatMessage>,
        @InjectRepository(XpertFrequentQuestionCache)
        private readonly cacheRepository: Repository<XpertFrequentQuestionCache>,
        private readonly queryBus: QueryBus
    ) {}

    async getFrequentQuestions(
        xpertId: string,
        request: XpertFrequentQuestionsRequest
    ): Promise<XpertFrequentQuestionsResponse> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        if (!tenantId || !organizationId) {
            throw new BadRequestException('Tenant and organization are required')
        }

        const locale = this.normalizeLocale(request.locale)
        const windowDays = this.normalizePositiveInteger(request.windowDays, DEFAULT_WINDOW_DAYS, 1, 365)
        const conversationLimit = this.normalizePositiveInteger(
            request.conversationLimit,
            DEFAULT_CONVERSATION_LIMIT,
            1,
            DEFAULT_CONVERSATION_LIMIT
        )
        const questionCount = this.normalizePositiveInteger(request.questionCount, DEFAULT_QUESTION_COUNT, 1, 5)
        const now = new Date()
        const cachedResult = await this.findCache(tenantId, organizationId, xpertId, locale)

        if (!request.forceRefresh && cachedResult && cachedResult.expiresAt > now) {
            return this.toResponse(cachedResult, true)
        }

        const xpert = await this.xpertRepository.findOne({
            where: { id: xpertId, tenantId, organizationId },
            relations: ['copilotModel', 'copilotModel.copilot']
        })
        if (!xpert) {
            throw new NotFoundException('Xpert not found')
        }

        const { history, sample } = await this.loadHistory({
            tenantId,
            organizationId,
            xpertId,
            windowDays,
            conversationLimit,
            questionCount,
            now
        })

        if (sample.messageCount < MIN_HISTORY_MESSAGES) {
            return this.saveAndReturn({
                cache: cachedResult,
                tenantId,
                organizationId,
                xpertId,
                locale,
                questions: [],
                sample,
                generatedAt: now,
                expiresAt: new Date(now.getTime() + CACHE_TTL_MS)
            })
        }

        const copilotModel = xpert.copilotModel
        if (!copilotModel?.model || !copilotModel?.copilotId) {
            this.#logger.warn(`Skip frequent question generation for xpert '${xpertId}': copilot model is missing`)
            return this.emptyResponse(xpertId, organizationId, locale, sample, now)
        }

        let chatModel: BaseChatModel
        try {
            chatModel = await this.queryBus.execute<CopilotModelGetChatModelQuery, BaseChatModel>(
                new CopilotModelGetChatModelQuery(copilotModel.copilot, copilotModel, {
                    abortController: new AbortController(),
                    usageCallback: () => undefined,
                    xpertId
                })
            )
        } catch (error) {
            this.#logger.warn(`Skip frequent question generation for xpert '${xpertId}': ${getErrorMessage(error)}`)
            return this.emptyResponse(xpertId, organizationId, locale, sample, now)
        }

        const questions = await this.generateQuestions({
            xpertId,
            locale,
            questionCount,
            history,
            chatModel
        })

        if (!questions) {
            return this.emptyResponse(xpertId, organizationId, locale, sample, now)
        }

        return this.saveAndReturn({
            cache: cachedResult,
            tenantId,
            organizationId,
            xpertId,
            locale,
            questions,
            sample,
            generatedAt: now,
            expiresAt: new Date(now.getTime() + CACHE_TTL_MS)
        })
    }

    private async loadHistory(input: {
        tenantId: string
        organizationId: string
        xpertId: string
        windowDays: number
        conversationLimit: number
        questionCount: number
        now: Date
    }): Promise<{ history: ConversationHistory[]; sample: XpertFrequentQuestionsSample }> {
        const since = new Date(input.now.getTime() - input.windowDays * 24 * 60 * 60 * 1000)
        const conversations = await this.conversationRepository.find({
            where: {
                tenantId: input.tenantId,
                organizationId: input.organizationId,
                xpertId: input.xpertId,
                createdAt: MoreThanOrEqual(since)
            },
            order: { updatedAt: 'DESC' },
            take: input.conversationLimit
        })

        const conversationIds = conversations.map((conversation) => conversation.id).filter(this.isString)
        const historyByConversationId = new Map<string, ConversationHistory>()
        for (const conversation of conversations) {
            if (!conversation.id) {
                continue
            }
            historyByConversationId.set(conversation.id, {
                conversationId: conversation.id,
                title: conversation.title,
                messages: []
            })
        }

        if (conversationIds.length) {
            const userRoles: CopilotMessageType[] = ['human', 'user']
            const messages = await this.messageRepository.find({
                where: {
                    tenantId: input.tenantId,
                    organizationId: input.organizationId,
                    conversationId: In(conversationIds),
                    role: In(userRoles),
                    deletedAt: IsNull()
                },
                order: { createdAt: 'ASC' }
            })

            let capturedMessages = 0
            for (const message of messages) {
                if (capturedMessages >= MAX_HISTORY_MESSAGES) {
                    break
                }
                if (!message.conversationId) {
                    continue
                }
                const history = historyByConversationId.get(message.conversationId)
                if (!history) {
                    continue
                }
                const content = this.normalizeHistoryMessage(stringifyMessageContent(message.content))
                if (!content) {
                    continue
                }
                history.messages.push(content)
                capturedMessages += 1
            }
        }

        const history = Array.from(historyByConversationId.values()).filter((item) => item.messages.length > 0)
        const messageCount = history.reduce((total, item) => total + item.messages.length, 0)

        return {
            history,
            sample: {
                windowDays: input.windowDays,
                conversationLimit: input.conversationLimit,
                questionCount: input.questionCount,
                conversationCount: history.length,
                messageCount,
                since: since.toISOString(),
                until: input.now.toISOString()
            }
        }
    }

    private async generateQuestions(input: {
        xpertId: string
        locale: string
        questionCount: number
        history: ConversationHistory[]
        chatModel: BaseChatModel
    }): Promise<string[] | null> {
        const abortController = new AbortController()
        const timeout = setTimeout(() => abortController.abort(), MODEL_TIMEOUT_MS)
        try {
            const structuredOutput = input.chatModel.withStructuredOutput<{ questions: string[] }>(
                z.object({
                    questions: z.array(z.string().describe('Frequent question')).max(input.questionCount)
                }),
                { method: 'functionCalling' }
            )
            const prompt = ChatPromptTemplate.fromMessages(
                [
                    [
                        'system',
                        [
                            'You extract frequently asked start-screen questions for a ChatKit assistant.',
                            'Use only recurring user intents from historical conversations.',
                            'Write in the requested UI language.',
                            'Return at most {{questionCount}} concise pure questions.',
                            'Do not include answers, numbering, markdown, duplicated meaning, or private details.'
                        ].join(' ')
                    ],
                    [
                        'human',
                        [
                            'UI language: {{locale}}',
                            'Requested question count: {{questionCount}}',
                            'Historical conversations:',
                            '{{history}}'
                        ].join('\n\n')
                    ]
                ],
                { templateFormat: 'mustache' }
            )

            const output = await prompt.pipe(structuredOutput).invoke(
                {
                    locale: input.locale,
                    questionCount: input.questionCount,
                    history: this.renderHistory(input.history)
                },
                { signal: abortController.signal }
            )
            return this.normalizeQuestions(output.questions, input.questionCount)
        } catch (error) {
            this.#logger.warn(
                `Frequent question generation failed for xpert '${input.xpertId}': ${getErrorMessage(error)}`
            )
            return null
        } finally {
            clearTimeout(timeout)
        }
    }

    private renderHistory(history: ConversationHistory[]) {
        return history
            .map((conversation, index) => {
                const title = conversation.title?.trim()
                const messages = conversation.messages.map((message) => `- ${message}`).join('\n')
                return [`Conversation ${index + 1}`, title ? `Title: ${title}` : '', 'User messages:', messages]
                    .filter(this.isString)
                    .join('\n')
            })
            .join('\n\n')
    }

    private async findCache(tenantId: string, organizationId: string, xpertId: string, locale: string) {
        return this.cacheRepository.findOne({
            where: {
                tenantId,
                organizationId,
                xpertId,
                locale
            }
        })
    }

    private async saveAndReturn(input: {
        cache: XpertFrequentQuestionCache | null
        tenantId: string
        organizationId: string
        xpertId: string
        locale: string
        questions: string[]
        sample: XpertFrequentQuestionsSample
        generatedAt: Date
        expiresAt: Date
    }) {
        const cache = input.cache ?? this.cacheRepository.create()
        cache.tenantId = input.tenantId
        cache.organizationId = input.organizationId
        cache.xpertId = input.xpertId
        cache.locale = input.locale
        cache.questions = input.questions
        cache.sample = input.sample
        cache.generatedAt = input.generatedAt
        cache.expiresAt = input.expiresAt

        const saved = await this.cacheRepository.save(cache)
        return this.toResponse(saved, false)
    }

    private toResponse(cache: XpertFrequentQuestionCache, cached: boolean): XpertFrequentQuestionsResponse {
        return {
            xpertId: cache.xpertId,
            organizationId: cache.organizationId ?? null,
            locale: cache.locale,
            questions: cache.questions ?? [],
            generatedAt: cache.generatedAt.toISOString(),
            expiresAt: cache.expiresAt.toISOString(),
            cached,
            sample: cache.sample ?? {
                windowDays: DEFAULT_WINDOW_DAYS,
                conversationLimit: DEFAULT_CONVERSATION_LIMIT,
                questionCount: DEFAULT_QUESTION_COUNT,
                conversationCount: 0,
                messageCount: 0,
                since: cache.generatedAt.toISOString(),
                until: cache.generatedAt.toISOString()
            }
        }
    }

    private emptyResponse(
        xpertId: string,
        organizationId: string,
        locale: string,
        sample: XpertFrequentQuestionsSample,
        now: Date
    ): XpertFrequentQuestionsResponse {
        return {
            xpertId,
            organizationId,
            locale,
            questions: [],
            generatedAt: now.toISOString(),
            expiresAt: now.toISOString(),
            cached: false,
            sample
        }
    }

    private normalizeLocale(locale: string | null | undefined) {
        const trimmed = locale?.trim()
        return trimmed ? trimmed.slice(0, 32) : (RequestContext.getLanguageCode() ?? 'zh-Hans')
    }

    private normalizePositiveInteger(value: number | null | undefined, fallback: number, min: number, max: number) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return fallback
        }
        const normalized = Math.trunc(value)
        return Math.max(min, Math.min(max, normalized))
    }

    private normalizeHistoryMessage(value: string) {
        const normalized = value.trim().replace(/\s+/g, ' ')
        if (!normalized) {
            return ''
        }
        return normalized.length > MAX_MESSAGE_CHARS ? `${normalized.slice(0, MAX_MESSAGE_CHARS)}...` : normalized
    }

    private normalizeQuestions(questions: string[], questionCount: number) {
        const seen = new Set<string>()
        const result: string[] = []
        for (const question of questions) {
            const normalized = question.trim().replace(/\s+/g, ' ')
            if (!normalized) {
                continue
            }
            const dedupeKey = normalized.toLocaleLowerCase()
            if (seen.has(dedupeKey)) {
                continue
            }
            seen.add(dedupeKey)
            result.push(normalized)
            if (result.length >= questionCount) {
                break
            }
        }
        return result
    }

    private isString(value: string | undefined | null): value is string {
        return Boolean(value)
    }
}
