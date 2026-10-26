import { ReadThreadControlViewQuery } from '../chat-conversation/control-view/read-thread-control-view.query'
// Exercise HTTP -> CQRS -> handler -> DTO; isolate persistence and credential verification.
jest.mock('./thread-activity/thread-activity.service', () => ({ ThreadActivityService: class {} }))
jest.mock('../chat-conversation/thread-run-control.service', () => ({ ThreadRunControlService: class {} }))
jest.mock('@xpert-ai/server-core', () => ({
    AllowClientSecretBindings: () => () => undefined,
    ApiKeyOrClientSecretAuthGuard: class {},
    CurrentUser: () => () => undefined,
    Public: () => () => undefined,
    TransformInterceptor: class {},
    UserPublicDTO: class {},
    ZodValidationPipe: jest.requireActual('../../../server/src/shared/pipes/zod-validation.pipe').ZodValidationPipe
}))
jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: { currentApiPrincipal: () => null, currentUserId: () => null }
}))
jest.mock('./ai.service', () => ({ AiService: class {} }))
jest.mock('../core', () => ({ UnimplementedException: class extends Error {} }))
jest.mock('../core/entities/internal', () => ({ ChatConversation: class {}, ChatConversationThread: class {} }))
jest.mock('./dto', () => ({ ThreadDTO: jest.requireActual('./dto/thread.dto').ThreadDTO }))
jest.mock('../copilot-checkpoint', () => jest.requireActual('../copilot-checkpoint/queries'))
jest.mock('../xpert-agent-execution', () => ({}))
jest.mock('../chat-conversation', () => ({
    ChatConversationThreadService: class {},
    AssertChatConversationAccessQuery: class {
        constructor(
            public readonly input: { id?: string; threadId?: string },
            public readonly operation?: string
        ) {}
    },
    GetChatConversationQuery: class {}
}))

import type { CheckpointTuple } from '@langchain/langgraph'
import { ForbiddenException, INestApplication, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { CqrsModule, QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { ApiKeyOrClientSecretAuthGuard, TransformInterceptor } from '@xpert-ai/server-core'
import { SecretTokenBindingType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import i18next from 'i18next'
import type { AddressInfo } from 'net'
import { TransformInterceptor as HttpTransformInterceptor } from '../../../server/src/core/interceptors/transform.interceptor'
import { AssertChatConversationAccessQuery, ChatConversationThreadService } from '../chat-conversation'
import { ChatConversation, ChatConversationThread } from '../core/entities/internal'
import { CopilotCheckpointGetTupleQuery } from '../copilot-checkpoint/queries'
import en from '../i18n/en.json'
import enUS from '../i18n/en-US.json'
import zhHans from '../i18n/zh-Hans.json'
import { RedisSseStreamService } from '../shared/stream/redis-sse.service'
import { AiService } from './ai.service'
import { FindThreadHandler } from './queries/handlers/thread-find.handler'
import { ThreadsController } from './thread.controller'

describe('thread metadata and explicit state HTTP routes', () => {
    let app: INestApplication
    let endpoint: string
    let authenticated: boolean
    let allowed: boolean
    let exists: boolean
    const conversation = Object.assign(new ChatConversation(), {
        id: 'conversation',
        threadId: 'primary',
        xpertId: 'assistant',
        createdById: 'owner'
    })
    const thread = Object.assign(new ChatConversationThread(), {
        threadId: 'branch',
        conversation,
        status: 'paused',
        parentThreadId: 'primary',
        forkedFromMessageId: 'message',
        runControl: { executionId: 'run', state: 'paused', pauseId: 'pause' },
        operation: null,
        createdAt: new Date('2026-10-16T01:00:00Z'),
        updatedAt: new Date('2026-10-16T02:00:00Z')
    })
    const checkpointRead = jest.fn<Promise<CheckpointTuple | undefined>, [CopilotCheckpointGetTupleQuery]>()
    const copyThread = jest.fn()
    const tuple: CheckpointTuple = {
        config: { configurable: { thread_id: 'branch', checkpoint_ns: '', checkpoint_id: 'checkpoint' } },
        checkpoint: {
            v: 4,
            id: 'checkpoint',
            ts: '2026-10-16T03:00:00Z',
            channel_values: { messages: [{ id: 'message' }] },
            channel_versions: {},
            versions_seen: {}
        },
        metadata: { source: 'loop', step: 2, parents: {} },
        parentConfig: { configurable: { thread_id: 'branch', checkpoint_ns: '', checkpoint_id: 'parent-checkpoint' } }
    }

    beforeAll(async () => {
        await i18next.init({
            lng: 'en',
            fallbackLng: 'en',
            resources: { en: { 'server-ai': en }, 'en-US': { 'server-ai': enUS }, 'zh-Hans': { 'server-ai': zhHans } }
        })
    })

    beforeEach(async () => {
        await i18next.changeLanguage('en')
        authenticated = true
        allowed = true
        exists = true
        checkpointRead.mockReset().mockResolvedValue(undefined)
        copyThread.mockReset().mockResolvedValue({ ...thread, conversation, status: 'idle' })
        const module = await Test.createTestingModule({
            imports: [CqrsModule.forRoot()],
            controllers: [ThreadsController],
            providers: [
                FindThreadHandler,
                { provide: AiService, useValue: {} },
                { provide: RedisSseStreamService, useValue: {} },
                {
                    provide: ChatConversationThreadService,
                    useValue: {
                        copyThread,
                        requireByThreadId: async () => {
                            if (!exists) throw new NotFoundException()
                            return thread
                        }
                    }
                }
            ]
        })
            .overrideGuard(ApiKeyOrClientSecretAuthGuard)
            .useValue({
                canActivate: () => {
                    if (!authenticated) throw new UnauthorizedException()
                    return true
                }
            })
            .overrideInterceptor(TransformInterceptor)
            .useClass(HttpTransformInterceptor)
            .compile()
        const queryBus = module.get(QueryBus)
        const execute = queryBus.execute.bind(queryBus)
        jest.spyOn(queryBus, 'execute').mockImplementation(async (query: object) => {
            if (query instanceof ReadThreadControlViewQuery) return { thread, controlView: undefined }
            if (query instanceof CopilotCheckpointGetTupleQuery) return checkpointRead(query)
            if (query instanceof AssertChatConversationAccessQuery) {
                if (!exists) throw new NotFoundException()
                if (!allowed) throw new ForbiddenException()
                return conversation
            }
            return execute(query)
        })
        app = module.createNestApplication({ logger: false })
        app.setGlobalPrefix('api/ai')
        await app.listen(0, '127.0.0.1')
        const address: AddressInfo = app.getHttpServer().address()
        endpoint = `http://127.0.0.1:${address.port}/api/ai/threads/branch`
    })

    afterEach(async () => {
        await app?.close()
        jest.restoreAllMocks()
    })

    it('validates sealed copy requests through HTTP and preserves the retry identity', async () => {
        const body = { mode: 'latest-sealed-reply', requestId: 'retry-1' }
        const response = await fetch(`${endpoint}/copy`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
        })
        expect(response.status).toBe(201)
        expect(copyThread).toHaveBeenCalledWith('branch', body)
    })

    it.each([
        { mode: 'latest-sealed-reply' },
        { mode: 'latest-sealed-reply', requestId: '' },
        { mode: 'latest-sealed-reply', requestId: 'retry', beforeMessageId: 'human' },
        { mode: 'arbitrary', requestId: 'retry' },
        { beforeMessageId: 'human' },
        { mode: 'latest-sealed-reply', requestId: 'retry', checkpoint: 'client-chosen' }
    ])('rejects invalid copy input %j before invoking the service', async (body) => {
        const response = await fetch(`${endpoint}/copy`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
        })
        expect(response.status).toBe(400)
        expect(copyThread).not.toHaveBeenCalled()
    })

    it('retains contribute authorization for sealed copies', async () => {
        allowed = false
        const response = await fetch(`${endpoint}/copy`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'latest-sealed-reply', requestId: 'retry' })
        })
        expect(response.status).toBe(403)
        expect(copyThread).not.toHaveBeenCalled()
    })

    it('serializes the real handler response without reading checkpoint values', async () => {
        checkpointRead.mockRejectedValue(new Error('Checkpoint storage must not be read'))
        const response = await fetch(endpoint)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            thread_id: 'branch',
            status: 'paused',
            operation: null,
            runControl: { executionId: 'run', state: 'paused', pauseId: 'pause' },
            created_at: '2026-10-16T01:00:00.000Z',
            updated_at: '2026-10-16T02:00:00.000Z',
            created_by: null,
            updated_by: null,
            metadata: {
                id: 'conversation',
                conversation_id: 'conversation',
                assistant_id: 'assistant',
                parent_thread_id: 'primary',
                forked_from_message_id: 'message'
            }
        })
        expect(checkpointRead).not.toHaveBeenCalled()
    })

    it('returns 404 when the thread has no saved state while metadata remains readable', async () => {
        const state = await fetch(`${endpoint}/state`)
        expect(state.status).toBe(404)
        expect(await state.json()).toMatchObject({
            statusCode: 404,
            error: 'Not Found',
            message: 'No saved state was found for this thread.'
        })
        const metadata = await fetch(endpoint)
        expect(metadata.status).toBe(200)
        expect(await metadata.json()).not.toHaveProperty('values')
        expect(checkpointRead).toHaveBeenCalledTimes(1)
    })

    it('returns 404 for a missing explicit checkpoint without falling back to the latest state', async () => {
        const response = await fetch(`${endpoint}/state?checkpoint_id=missing`)
        expect(response.status).toBe(404)
        expect(await response.json()).toMatchObject({ message: 'No saved state was found for this thread.' })
        expect(checkpointRead).toHaveBeenCalledTimes(1)
        expect(checkpointRead).toHaveBeenCalledWith(
            new CopilotCheckpointGetTupleQuery({
                thread_id: 'branch',
                checkpoint_ns: '',
                checkpoint_id: 'missing'
            })
        )
    })

    it.each([undefined, 'checkpoint'])('returns saved branch values for checkpoint %s', async (checkpointId) => {
        checkpointRead.mockResolvedValue(tuple)
        const suffix = checkpointId ? `?checkpoint_id=${checkpointId}` : ''
        const response = await fetch(`${endpoint}/state${suffix}`)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            values: { messages: [{ id: 'message' }] },
            checkpoint: { thread_id: 'branch', checkpoint_ns: '', checkpoint_id: 'checkpoint' },
            parent_checkpoint: { thread_id: 'branch', checkpoint_ns: '', checkpoint_id: 'parent-checkpoint' },
            metadata: { source: 'loop', step: 2, parents: {} },
            created_at: '2026-10-16T03:00:00Z'
        })
        expect(checkpointRead).toHaveBeenCalledTimes(1)
        expect(checkpointRead).toHaveBeenCalledWith(
            new CopilotCheckpointGetTupleQuery({
                thread_id: 'branch',
                checkpoint_ns: '',
                checkpoint_id: checkpointId
            })
        )
    })

    it.each([
        ['en-US', 'No saved state was found for this thread.'],
        ['zh-Hans', '未找到此会话的执行状态存档。']
    ])('localizes missing state in %s', async (language, message) => {
        await i18next.changeLanguage(language)
        const response = await fetch(`${endpoint}/state`)
        expect(response.status).toBe(404)
        expect(await response.json()).toMatchObject({ message })
    })

    it.each(['', '/state'])('rejects unauthenticated %s reads before accessing checkpoints', async (suffix) => {
        authenticated = false
        expect((await fetch(`${endpoint}${suffix}`)).status).toBe(401)
        expect(checkpointRead).not.toHaveBeenCalled()
    })

    it.each(['', '/state'])('rejects unauthorized %s reads before accessing checkpoints', async (suffix) => {
        allowed = false
        expect((await fetch(`${endpoint}${suffix}`)).status).toBe(403)
        expect(checkpointRead).not.toHaveBeenCalled()
    })

    it.each(['', '/state'])('rejects a missing thread for %s reads before accessing checkpoints', async (suffix) => {
        exists = false
        expect((await fetch(`${endpoint}${suffix}`)).status).toBe(404)
        expect(checkpointRead).not.toHaveBeenCalled()
    })

    it.each(['', '/state'])('enforces real restricted-session ownership for %s reads', async (suffix) => {
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.ENTERPRISE_XPERT,
            resourceScope: { kind: 'assistant', xpertId: 'assistant' }
        } as ReturnType<typeof RequestContext.currentApiPrincipal>)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('another-user')
        expect((await fetch(`${endpoint}${suffix}`)).status).toBe(403)
        expect(checkpointRead).not.toHaveBeenCalled()
    })

    it('does not turn checkpoint storage failures into missing-state responses', async () => {
        checkpointRead.mockRejectedValue(new Error('Storage unavailable'))
        expect((await fetch(`${endpoint}/state`)).status).toBe(500)
        expect(checkpointRead).toHaveBeenCalledTimes(1)
    })

    it('does not expose a separate summary route', async () => {
        expect((await fetch(`${endpoint}/summary`)).status).toBe(404)
        expect(checkpointRead).not.toHaveBeenCalled()
    })
})
