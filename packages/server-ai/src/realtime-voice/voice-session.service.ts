// Admission is repeated on socket attachment; an issued ticket never substitutes for current access.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { REDIS_CLIENT } from '@xpert-ai/server-core'
import { AIModelGetProviderQuery } from '../ai-model'
import { AgentMiddlewareRegistry, AIModel, IAIModelProviderStrategy, RequestContext } from '@xpert-ai/plugin-sdk'
import {
    AiModelTypeEnum,
    ICopilot,
    IModelAccessResolution,
    ModelUsageReport,
    RealtimeUsage,
    VoiceSessionTicket
} from '@xpert-ai/contracts'
import { RedisClientType } from 'redis'
import { IsNull, Repository } from 'typeorm'
import { t } from 'i18next'
import { AssertChatConversationAccessQuery } from '../chat-conversation'
import { PublishedXpertAccessService } from '../xpert'
import { CopilotGetOneQuery } from '../copilot'
import { CopilotCheckLimitCommand, CopilotModelUsageRecordCommand } from '../copilot-user'
import { RealtimeVoiceSession, RealtimeVoiceTurn } from './voice.entity'
import { VoiceScope, voiceFeatureSchema, voiceScopeSchema } from './voice.schema'
import { withVoiceScope } from './voice-context'
import { persistCallEnded } from './voice-call-history'
import { voiceAssistantContext, VoiceContextTurn } from './voice-assistant-context'
import { ChatConversationThreadService } from '../chat-conversation/conversation-thread.service'
import { voiceTaskAnswer } from './voice-task-result'

const TICKET_SECONDS = 30
const CALL_SECONDS = 1800
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const releaseLease = 'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end return 0'

@Injectable()
export class VoiceSessionService {
    constructor(
        @InjectRepository(RealtimeVoiceSession) private readonly sessions: Repository<RealtimeVoiceSession>,
        @InjectRepository(RealtimeVoiceTurn) private readonly turns: Repository<RealtimeVoiceTurn>,
        @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
        private readonly queries: QueryBus,
        private readonly commands: CommandBus,
        private readonly assistants: PublishedXpertAccessService,
        private readonly middlewareRegistry: AgentMiddlewareRegistry,
        private readonly threads: ChatConversationThreadService
    ) {}

    private denied(): never {
        throw new ForbiddenException(t('server-ai:Error.RealtimeForbidden'))
    }
    private lease(scope: VoiceScope) {
        return `voice:lease:${scope.tenantId}:${scope.userId}`
    }

    async available(assistantId: string) {
        if (RequestContext.currentApiPrincipal()) this.denied()
        const assistant = await this.assistants.getAccessiblePublishedXpert(assistantId)
        return { enabled: voiceFeatureSchema.safeParse(assistant.features?.realtimeVoice).success }
    }

    async authorize(threadId: string) {
        // First release targets signed-in Bosi users. Do not widen an API principal into a user context.
        if (RequestContext.currentApiPrincipal()) this.denied()
        const conversation = await this.queries.execute(
            new AssertChatConversationAccessQuery({ threadId }, 'contribute')
        )
        const scope = voiceScopeSchema.parse({
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId(),
            userId: RequestContext.currentUserId(),
            threadId,
            conversationId: conversation.id,
            assistantId: conversation.xpertId
        }) as VoiceScope
        if (conversation.tenantId !== scope.tenantId || conversation.organizationId !== scope.organizationId)
            this.denied()
        const assistant = await this.assistants.getAccessiblePublishedXpert(scope.assistantId, { relations: ['agent'] })
        const feature = voiceFeatureSchema.safeParse(assistant.features?.realtimeVoice)
        if (!feature.success) throw new BadRequestException(t('server-ai:Error.RealtimeConfigurationInvalid'))
        return {
            scope,
            assistant,
            isDerivedThread: conversation.threadId !== threadId,
            feature: feature.data,
            configurationHash: digest(JSON.stringify(feature.data))
        }
    }

    async create(threadId: string, originMode: 'web' | 'desktop', assistantId: string): Promise<VoiceSessionTicket> {
        const authorized = await this.authorize(threadId)
        if (authorized.scope.assistantId !== assistantId) this.denied()
        const id = randomUUID()
        const lease = this.lease(authorized.scope)
        if (!(await this.redis.set(lease, id, { NX: true, EX: TICKET_SECONDS + 15 })))
            throw new ConflictException(t('server-ai:Error.RealtimeCallAlreadyActive'))
        try {
            // Resolve and check model access before consuming a microphone permission prompt.
            await this.model(authorized.scope, authorized.feature)
            await this.sessions.save(
                this.sessions.create({
                    id,
                    ...authorized.scope,
                    scope: authorized.scope,
                    configurationHash: authorized.configurationHash,
                    originMode,
                    status: 'connecting',
                    expiresAt: new Date(Date.now() + CALL_SECONDS * 1000)
                })
            )
            return await this.ticket(id, authorized.scope.conversationId)
        } catch (error) {
            await this.sessions.update({ id }, { status: 'ended' })
            await this.redis.eval(releaseLease, { keys: [lease], arguments: [id] })
            throw error
        }
    }

    private async ticket(sessionId: string, conversationId: string): Promise<VoiceSessionTicket> {
        const ticket = randomBytes(32).toString('hex')
        await this.redis.set(`voice:ticket:${digest(ticket)}`, sessionId, { EX: TICKET_SECONDS })
        return {
            sessionId,
            conversationId,
            ticket,
            path: '/api/ai/voice/stream',
            inputSampleRate: 16000,
            outputSampleRate: 24000,
            expiresAt: new Date(Date.now() + TICKET_SECONDS * 1000).toISOString()
        }
    }

    async consume(ticket: string) {
        const id = await this.redis.getDel(`voice:ticket:${digest(ticket)}`)
        if (!id) this.denied()
        const session = await this.sessions.findOneBy({ id })
        if (!session || session.status !== 'connecting' || session.expiresAt.getTime() <= Date.now()) this.denied()
        session.scope = voiceScopeSchema.parse(session.scope) as VoiceScope
        return session
    }

    async current(session: RealtimeVoiceSession) {
        return withVoiceScope(session.scope, async () => {
            const current = await this.sessions.findOneBy({ id: session.id, userId: session.userId, status: 'active' })
            if (!current || current.expiresAt.getTime() <= Date.now()) this.denied()
            const authorized = await this.authorize(session.threadId)
            if (authorized.configurationHash !== session.configurationHash) this.denied()
            return this.model(session.scope, authorized.feature)
        })
    }

    async open(session: RealtimeVoiceSession) {
        return withVoiceScope(session.scope, async () => {
            const authorized = await this.authorize(session.threadId)
            if (authorized.configurationHash !== session.configurationHash) this.denied()
            const prepared = await this.model(session.scope, authorized.feature)
            const renewed = await this.redis.eval(
                'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("EXPIRE", KEYS[1], ARGV[2]) end return 0',
                { keys: [this.lease(session.scope)], arguments: [session.id, String(CALL_SECONDS)] }
            )
            if (renewed !== 1) this.denied()
            const updated = await this.sessions.update(
                { id: session.id, status: 'connecting' },
                {
                    status: 'active',
                    modelSnapshot: {
                        model: prepared.model,
                        copilotId: prepared.copilot.id,
                        provider: prepared.copilot.modelProvider.providerName,
                        pricing: prepared.pricing
                    }
                }
            )
            if (updated.affected !== 1) this.denied()
            return {
                ...prepared,
                voice: authorized.feature.voice,
                assistantContext: voiceAssistantContext(authorized.assistant, this.middlewareRegistry)
            }
        })
    }

    private async model(scope: VoiceScope, feature: ReturnType<typeof voiceFeatureSchema.parse>) {
        const copilot = await this.queries.execute<CopilotGetOneQuery, ICopilot>(
            new CopilotGetOneQuery(scope.tenantId, feature.copilotModel.copilotId, ['modelProvider'])
        )
        if (!copilot?.enabled || !copilot.modelProvider) this.denied()
        const access = await this.commands.execute<CopilotCheckLimitCommand, IModelAccessResolution>(
            new CopilotCheckLimitCommand({
                ...scope,
                xpertId: scope.assistantId,
                copilot,
                model: feature.copilotModel.model,
                modelType: AiModelTypeEnum.REALTIME
            })
        )
        const provider = await this.queries.execute<AIModelGetProviderQuery, IAIModelProviderStrategy>(
            new AIModelGetProviderQuery(copilot.modelProvider.providerName)
        )
        const manager = provider?.getModelManager<AIModel>(AiModelTypeEnum.REALTIME)
        const schema = manager?.getModelSchema(feature.copilotModel.model)
        if (!schema?.realtime?.voices.some((voice) => voice.id === feature.voice)) this.denied()
        const model = { ...feature.copilotModel, modelType: AiModelTypeEnum.REALTIME, copilot }
        const pricing = {
            text: manager.getUsagePricingSnapshot(model.model, copilot.modelProvider.credentials, {
                model: model.model,
                operation: AiModelTypeEnum.REALTIME,
                modality: 'text'
            }),
            audio: manager.getUsagePricingSnapshot(model.model, copilot.modelProvider.credentials, {
                model: model.model,
                operation: AiModelTypeEnum.REALTIME,
                modality: 'audio'
            })
        }
        return { connection: manager.getRealtimeModel(model), pricing, copilot, access, model: model.model }
    }

    async markReady(session: RealtimeVoiceSession) {
        await this.sessions.update({ id: session.id, status: 'active', startedAt: IsNull() }, { startedAt: new Date() })
    }

    async end(session: RealtimeVoiceSession, usageState: 'reported' | 'incomplete' = 'incomplete') {
        const record = await this.sessions.manager.transaction((manager) =>
            persistCallEnded(manager, session, usageState)
        )
        await this.redis.eval(releaseLease, { keys: [this.lease(session.scope)], arguments: [session.id] })
        return record
    }

    async get(threadId: string, id: string) {
        const { scope } = await this.authorize(threadId)
        const session = await this.sessions.findOneBy({
            id,
            threadId,
            userId: scope.userId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId
        })
        if (!session) this.denied()
        return session
    }

    async history(scope: VoiceScope) {
        const turns = await this.turns
            .createQueryBuilder('turn')
            .innerJoin(RealtimeVoiceSession, 'session', 'session.id = turn."sessionId"')
            .where('session."tenantId" = :tenantId AND session."organizationId" = :organizationId', scope)
            .andWhere('session."userId" = :userId AND session."threadId" = :threadId', scope)
            .orderBy('turn.createdAt', 'DESC')
            .take(12)
            .getMany()
        return turns.reverse().map(({ role, text, interrupted }) => ({ role, text: text.slice(0, 700), interrupted }))
    }

    async conversationContext(scope: VoiceScope): Promise<VoiceContextTurn[]> {
        const [page, voice] = await Promise.all([
            this.threads.findVisibleMessages(scope.threadId, { order: { createdAt: 'DESC' }, take: 10 }),
            this.history(scope)
        ])
        const chat = page.items
            .reverse()
            .filter((message) => ['human', 'ai'].includes(message.role))
            .flatMap((message) => {
                const text = voiceTaskAnswer(message.content)
                return text
                    ? [{ role: message.role === 'human' ? 'user' : 'assistant', text: text.slice(0, 2000) }]
                    : []
            })
        return [...chat, ...voice]
    }

    async markInterrupted(sessionId: string, turnId: string) {
        await this.turns.update({ sessionId, turnId, role: 'assistant' }, { interrupted: true })
    }

    async saveTranscript(
        session: RealtimeVoiceSession,
        event: { id: string; role: 'user' | 'assistant'; text: string }
    ) {
        await this.turns.upsert(
            {
                tenantId: session.tenantId,
                organizationId: session.organizationId,
                sessionId: session.id,
                turnId: event.id.slice(0, 256),
                role: event.role,
                text: event.text.slice(0, 64000)
            },
            ['sessionId', 'turnId', 'role']
        )
    }

    async recordUsage(
        session: RealtimeVoiceSession,
        prepared: Awaited<ReturnType<VoiceSessionService['open']>>,
        usage: RealtimeUsage
    ) {
        // Keep the provider receipt even if ledger delivery fails. Never substitute estimated usage.
        await this.sessions
            .createQueryBuilder()
            .update()
            .set({
                usageReceipts: () =>
                    `jsonb_set(COALESCE("usageReceipts", '{}'::jsonb), ARRAY[:responseId]::text[], CAST(:receipt AS jsonb), true)`
            })
            .where('id = :id', { id: session.id })
            .setParameters({ responseId: usage.responseId, receipt: JSON.stringify(usage) })
            .execute()
        for (const modality of ['text', 'audio'] as const) {
            const promptTokens = modality === 'text' ? usage.inputText : usage.inputAudio
            const completionTokens = modality === 'text' ? usage.outputText : usage.outputAudio
            if (promptTokens === undefined && completionTokens === undefined) continue
            const report: ModelUsageReport = {
                requestId: `${session.id}:${usage.responseId}:${modality}`,
                model: prepared.model,
                modelType: AiModelTypeEnum.REALTIME,
                operation: AiModelTypeEnum.REALTIME,
                modality,
                metrics: [{ unit: 'token', promptTokens, completionTokens, authority: 'provider' }]
            }
            const pricingSnapshot = prepared.pricing[modality]
            await this.commands.execute(
                new CopilotModelUsageRecordCommand({
                    ...session.scope,
                    xpertId: session.assistantId,
                    originId: session.threadId,
                    copilot: prepared.copilot,
                    modelAccess: prepared.access,
                    report,
                    pricingSnapshot
                })
            )
        }
    }
}
