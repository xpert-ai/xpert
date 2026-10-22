jest.mock('../../core/entities/internal', () => ({ ChatConversation: class {}, ChatConversationThread: class {} }))
jest.mock('../../chat-conversation/recovery/thread-recovery.service', () => ({ ThreadRecoveryService: class {} }))
jest.mock('@xpert-ai/server-core', () => ({
    AllowClientSecretBindings: () => () => undefined,
    Public: () => () => undefined,
    ApiKeyOrClientSecretAuthGuard: class {},
    TransformInterceptor: class {},
    UserPublicDTO: class {}
}))
jest.mock('@xpert-ai/plugin-sdk', () => ({ RequestContext: { currentApiPrincipal: () => null } }))
import { ForbiddenException, INestApplication } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { ApiKeyOrClientSecretAuthGuard, TransformInterceptor } from '@xpert-ai/server-core'
import type { AddressInfo } from 'node:net'
import { init as initI18n } from 'i18next'
import { TransformInterceptor as HttpTransformInterceptor } from '../../../../server/src/core/interceptors/transform.interceptor'
import { ThreadRecoveryService } from '../../chat-conversation/recovery/thread-recovery.service'
import { AssertChatConversationAccessQuery } from '../../chat-conversation/queries/conversation-assert-access.query'
import { recoveryConflict } from '../../chat-conversation/recovery/recovery-error'
import { ThreadRecoveryController } from './thread-recovery.controller'

describe('thread recovery HTTP boundary', () => {
    let app: INestApplication, endpoint: string
    const access = jest.fn()
    const describe = jest.fn()
    const returnToSource = jest.fn()
    beforeAll(async () => {
        await initI18n({ lng: 'en', resources: {} })
    })
    beforeEach(async () => {
        access.mockReset().mockResolvedValue({ id: 'conversation', xpertId: 'assistant' })
        describe
            .mockReset()
            .mockResolvedValue({
                threadId: 'branch',
                executionId: 'run',
                canRetry: false,
                sourceThreadId: 'source',
                reason: 'conversation_recovery_unavailable',
                originalError: 'internal checkpoint error'
            })
        returnToSource.mockReset().mockResolvedValue({
            threadId: 'source',
            status: 'idle',
            conversation: {
                id: 'conversation',
                xpertId: 'assistant',
                threadId: 'source'
            },
            metadata: {}
        })
        const module = await Test.createTestingModule({
            controllers: [ThreadRecoveryController],
            providers: [
                { provide: QueryBus, useValue: { execute: access } },
                {
                    provide: ThreadRecoveryService,
                    useValue: { describe, returnToSource, getSourceThreadId: async () => 'source' }
                }
            ]
        })
            .overrideGuard(ApiKeyOrClientSecretAuthGuard)
            .useValue({ canActivate: () => true })
            .overrideInterceptor(TransformInterceptor)
            .useClass(HttpTransformInterceptor)
            .compile()
        app = module.createNestApplication({ logger: false })
        app.setGlobalPrefix('api/ai')
        await app.listen(0, '127.0.0.1')
        endpoint = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/ai/threads/branch`
    })
    afterEach(async () => app?.close())
    it.each([true, false])(
        'returns only action availability (%s), without diagnostics or mutation',
        async (canRetry) => {
            describe.mockResolvedValue({
                threadId: 'branch',
                executionId: 'run',
                canRetry,
                sourceThreadId: 'source',
                reason: 'conversation_recovery_unavailable',
                originalError: 'internal checkpoint error'
            })
            const response = await fetch(`${endpoint}/capabilities`)
            expect(response.status).toBe(200)
            expect(await response.json()).toEqual({ canRetry })
            expect(access).toHaveBeenCalledWith(new AssertChatConversationAccessQuery({ threadId: 'branch' }, 'read'))
            expect(returnToSource).not.toHaveBeenCalled()
        }
    )
    it('does not expose a diagnostics route to chat clients', async () => {
        expect((await fetch(`${endpoint}/recovery`)).status).toBe(404)
    })
    it('checks read access before querying availability', async () => {
        access.mockRejectedValue(new ForbiddenException())
        expect((await fetch(`${endpoint}/capabilities`)).status).toBe(403)
        expect(describe).not.toHaveBeenCalled()
    })
    it.each([
        ['conversation_recovery_unavailable', 'Retry is currently unavailable.'],
        ['conversation_graph_changed', 'Retry is currently unavailable.'],
        ['conversation_branch_selection_changed', 'The conversation has changed. Refresh it and try again.']
    ] as const)('keeps %s conflict details server-side', async (code, message) => {
        const error = recoveryConflict(code, 'internal checkpoint error', 'source')
        returnToSource.mockRejectedValue(error)
        const response = await fetch(`${endpoint}/recovery/source`, { method: 'POST' })
        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            code,
            message
        })
        expect(error.cause).toEqual({ originalError: 'internal checkpoint error', sourceThreadId: 'source' })
    })
    it('authorizes both threads before switching the working branch', async () => {
        const response = await fetch(`${endpoint}/recovery/source`, { method: 'POST' })
        expect(response.status).toBe(201)
        expect(access.mock.calls.map(([query]) => query)).toEqual([
            new AssertChatConversationAccessQuery({ threadId: 'branch' }, 'contribute'),
            new AssertChatConversationAccessQuery({ threadId: 'source' }, 'contribute')
        ])
        expect(returnToSource).toHaveBeenCalledWith('branch')
    })
    it.each(['branch', 'source'])('rejects access denied to %s before mutation', async (denied) => {
        access.mockImplementation(async (query: AssertChatConversationAccessQuery) => {
            if (query.where.threadId === denied) throw new ForbiddenException()
            return { id: 'conversation', xpertId: 'assistant' }
        })
        expect((await fetch(`${endpoint}/recovery/source`, { method: 'POST' })).status).toBe(403)
        expect(returnToSource).not.toHaveBeenCalled()
    })
})
