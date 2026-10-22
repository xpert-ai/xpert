jest.mock('./thread-activity/thread-activity.service', () => ({ ThreadActivityService: class {} }))
jest.mock('../chat-conversation/thread-run-control.service', () => ({
    ThreadRunControlService: class {},
    threadGraphRevision: () => 'graph-v1',
    threadControlConflict: (_key: string, message: string) =>
        new (jest.requireActual('@nestjs/common').ConflictException)(message)
}))

jest.mock('@xpert-ai/server-core', () => ({
    AllowClientSecretBindings: () => () => undefined,
    ApiKeyOrClientSecretAuthGuard: class {},
    CurrentUser: () => () => undefined,
    Public: () => () => undefined,
    TransformInterceptor: class {},
    ZodValidationPipe: jest.requireActual('../../../server/src/shared/pipes/zod-validation.pipe').ZodValidationPipe
}))

jest.mock('./ai.service', () => ({
    AiService: class {}
}))

jest.mock('../shared/stream/write-sse-response', () => ({ writeSseResponse: jest.fn() }))

jest.mock('../copilot-checkpoint', () => ({
    CopilotCheckpointGetTupleQuery: class CopilotCheckpointGetTupleQuery {}
}))

jest.mock('../core', () => ({
    UnimplementedException: class UnimplementedException extends Error {}
}))

jest.mock('../xpert-agent-execution', () => ({
    FindAgentExecutionsQuery: class FindAgentExecutionsQuery {},
    GetThreadContextUsageQuery: class GetThreadContextUsageQuery {},
    XpertAgentExecutionOneQuery: class XpertAgentExecutionOneQuery {},
    GetAgentExecutionRunSummaryQuery: class GetAgentExecutionRunSummaryQuery {
        constructor(public readonly id: string) {}
    }
}))

jest.mock('../chat-conversation', () => ({
    AssertChatConversationAccessQuery: class AssertChatConversationAccessQuery {
        constructor(
            public input: unknown,
            public operation: string
        ) {}
    },
    CancelConversationCommand: class CancelConversationCommand {},
    GetChatConversationQuery: class GetChatConversationQuery {}
}))

jest.mock('./public-xpert-principal', () => ({
    assertPublicXpertSessionConversationAccess: jest.fn(),
    getPublicXpertSessionConversationScope: jest.fn()
}))

import { EventEmitter } from 'events'
import {
    BadRequestException,
    CallHandler,
    ConflictException,
    ExecutionContext,
    ForbiddenException,
    INestApplication,
    NotFoundException
} from '@nestjs/common'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { Test } from '@nestjs/testing'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiKeyOrClientSecretAuthGuard, TransformInterceptor } from '@xpert-ai/server-core'
import { AddressInfo } from 'net'
import { json } from 'express'
import { ThreadRunControlService } from '../chat-conversation/thread-run-control.service'
import { EMPTY, Subject } from 'rxjs'
import { AiService } from './ai.service'
import { RedisSseStreamService, SseMessageEvent } from '../shared/stream/redis-sse.service'
import { RunCreateStreamCommand } from './commands'
import {
    assertPublicXpertSessionConversationAccess,
    getPublicXpertSessionConversationScope
} from './public-xpert-principal'
import { AssertChatConversationAccessQuery } from '../chat-conversation'
import { GetAgentExecutionRunSummaryQuery, XpertAgentExecutionOneQuery } from '../xpert-agent-execution'
import type { TAgentExecutionRunSummary } from '../xpert-agent-execution/queries/get-run-summary.query'
import { TransformInterceptor as HttpTransformInterceptor } from '../../../server/src/core/interceptors/transform.interceptor'
import { ThreadsController } from './thread.controller'
import { writeSseResponse } from '../shared/stream/write-sse-response'
import { CancelExternalAssistantCommand } from '../chat-conversation/commands/cancel-external-assistant.command'

describe('ThreadsController', () => {
    describe('GET run status', () => {
        const createdAt = new Date('2026-10-12T08:00:00Z')
        const updatedAt = new Date('2026-10-12T08:01:00Z')
        const execution = {
            id: 'run',
            threadId: 'thread',
            parentId: 'parent',
            xpertId: 'assistant',
            type: 'llm',
            category: 'agent',
            agentKey: 'reviewer',
            title: 'Review',
            status: XpertAgentExecutionStatusEnum.INTERRUPTED,
            error: 'Cancelled by user',
            elapsedTime: 60000,
            inputs: { input: 'Please review' },
            createdAt,
            updatedAt,
            xpert: { avatar: { url: '/fallback.png' } },
            metadata: {
                assistantName: 'Reviewer',
                assistantAvatar: { url: '/reviewer.png' },
                invocationKind: 'external_assistant',
                sourceToolCallId: 'call',
                model: 'test-model',
                businessOutcome: { status: 'not_claimed', subjectId: 'task', accepted: false }
            }
        } satisfies TAgentExecutionRunSummary
        const conversation = { id: 'conversation', threadId: 'thread' }

        function setup(row: TAgentExecutionRunSummary = execution) {
            const queries = {
                execute: jest.fn(async (query: object) => {
                    if (query instanceof AssertChatConversationAccessQuery) return conversation
                    if (query instanceof XpertAgentExecutionOneQuery) {
                        throw new Error('Full execution details and checkpoints are unavailable')
                    }
                    if (query instanceof GetAgentExecutionRunSummaryQuery) return row
                    throw new Error('Unexpected query')
                })
            }
            const controller = new ThreadsController({} as never, queries as never, {} as never, {} as never)
            return { controller, queries }
        }

        it('returns the complete existing run contract without loading execution details', async () => {
            const { controller } = setup()
            const run = await controller.getThreadRun('thread', 'run')
            expect(JSON.parse(JSON.stringify(run))).toEqual({
                run_id: 'run',
                thread_id: 'thread',
                assistant_id: 'assistant',
                created_at: '2026-10-12T08:00:00.000Z',
                updated_at: '2026-10-12T08:01:00.000Z',
                status: 'interrupted',
                metadata: {
                    ...execution.metadata,
                    agentRun: {
                        id: 'run',
                        parentId: 'parent',
                        type: 'llm',
                        category: 'agent',
                        agentKey: 'reviewer',
                        xpertId: 'assistant',
                        xpertName: 'Reviewer',
                        avatar: { url: '/reviewer.png' },
                        title: 'Review',
                        invocationKind: 'external_assistant',
                        sourceToolCallId: 'call',
                        model: 'test-model',
                        status: 'interrupted',
                        businessOutcome: { status: 'not_claimed', subjectId: 'task', accepted: false },
                        elapsedTime: 60000,
                        inputs: { input: 'Please review' },
                        error: 'Cancelled by user',
                        createdAt: '2026-10-12T08:00:00.000Z',
                        updatedAt: '2026-10-12T08:01:00.000Z'
                    }
                }
            })
        })

        it.each(Object.values(XpertAgentExecutionStatusEnum))('preserves the persisted %s status', async (status) => {
            const { controller } = setup({ ...execution, status })
            await expect(controller.getThreadRun('thread', 'run')).resolves.toMatchObject({
                status,
                metadata: { agentRun: { status } }
            })
        })

        it('reads the requested run ID through the summary query', async () => {
            const { controller, queries } = setup({ ...execution, id: 'selected-run' })
            await expect(controller.getThreadRun('thread', 'selected-run')).resolves.toMatchObject({
                run_id: 'selected-run'
            })
            expect(queries.execute).toHaveBeenLastCalledWith(new GetAgentExecutionRunSummaryQuery('selected-run'))
        })

        it('preserves resume ancestry and extension metadata through the HTTP response', async () => {
            const metadata = {
                resumedFromExecutionId: 'previous-root',
                extension: { enabled: false, count: 0, value: null, ids: ['one', 'two'] },
                agentRun: { id: 'stale-snapshot', status: 'running' }
            }
            const { queries } = setup({
                ...execution,
                id: 'resumed-root',
                parentId: null,
                status: XpertAgentExecutionStatusEnum.SUCCESS,
                error: null,
                metadata
            })
            const module = await Test.createTestingModule({
                controllers: [ThreadsController],
                providers: [
                    { provide: AiService, useValue: {} },
                    { provide: QueryBus, useValue: queries },
                    { provide: CommandBus, useValue: {} },
                    { provide: RedisSseStreamService, useValue: {} }
                ]
            })
                .overrideGuard(ApiKeyOrClientSecretAuthGuard)
                .useValue({ canActivate: () => true })
                .overrideInterceptor(TransformInterceptor)
                .useClass(HttpTransformInterceptor)
                .compile()
            const app = module.createNestApplication({ logger: false })
            app.setGlobalPrefix('api/ai')
            try {
                await app.listen(0, '127.0.0.1')
                const address: AddressInfo = app.getHttpServer().address()
                const response = await fetch(`http://127.0.0.1:${address.port}/api/ai/threads/thread/runs/resumed-root`)
                expect(response.status).toBe(200)
                expect(await response.json()).toEqual({
                    run_id: 'resumed-root',
                    thread_id: 'thread',
                    assistant_id: 'assistant',
                    created_at: '2026-10-12T08:00:00.000Z',
                    updated_at: '2026-10-12T08:01:00.000Z',
                    status: 'success',
                    metadata: {
                        resumedFromExecutionId: 'previous-root',
                        extension: { enabled: false, count: 0, value: null, ids: ['one', 'two'] },
                        agentRun: {
                            id: 'resumed-root',
                            parentId: null,
                            type: 'llm',
                            category: 'agent',
                            agentKey: 'reviewer',
                            xpertId: 'assistant',
                            avatar: { url: '/fallback.png' },
                            title: 'Review',
                            status: 'success',
                            elapsedTime: 60000,
                            inputs: { input: 'Please review' },
                            error: null,
                            createdAt: '2026-10-12T08:00:00.000Z',
                            updatedAt: '2026-10-12T08:01:00.000Z'
                        }
                    }
                })
                expect(queries.execute).toHaveBeenLastCalledWith(new GetAgentExecutionRunSummaryQuery('resumed-root'))
            } finally {
                await app.close()
            }
        })

        it.each([null, undefined])(
            'supports legacy runs with %s metadata and the Assistant avatar fallback',
            async (metadata) => {
                const { controller } = setup({
                    ...execution,
                    metadata,
                    xpert: { avatar: { emoji: { id: 'smile' } } }
                })
                const run = await controller.getThreadRun('thread', 'run')
                expect(run.metadata.agentRun).toMatchObject({
                    id: 'run',
                    avatar: { emoji: { id: 'smile', unified: '1f604' } }
                })
            }
        )

        it('returns a legacy run whose Assistant has been removed', async () => {
            const { controller } = setup({ ...execution, metadata: null, xpert: null })
            const run = JSON.parse(JSON.stringify(await controller.getThreadRun('thread', 'run')))
            expect(run.metadata.agentRun.id).toBe('run')
            expect(run.metadata.agentRun).not.toHaveProperty('avatar')
        })

        it('checks conversation read access before reading a run', async () => {
            const { controller, queries } = setup()
            queries.execute.mockRejectedValueOnce(new ForbiddenException())
            await expect(controller.getThreadRun('thread', 'run')).rejects.toThrow(ForbiddenException)
            expect(queries.execute).toHaveBeenCalledTimes(1)
            expect(queries.execute).toHaveBeenCalledWith(
                new AssertChatConversationAccessQuery({ threadId: 'thread' }, 'read')
            )
        })

        it('checks restricted Assistant credentials before reading a run', async () => {
            const { controller, queries } = setup()
            jest.mocked(assertPublicXpertSessionConversationAccess).mockRejectedValueOnce(new ForbiddenException())
            await expect(controller.getThreadRun('thread', 'run')).rejects.toThrow(ForbiddenException)
            expect(queries.execute).toHaveBeenCalledTimes(1)
            expect(assertPublicXpertSessionConversationAccess).toHaveBeenCalledWith(conversation, queries)
        })

        it('rejects a run from another thread', async () => {
            const { controller } = setup({ ...execution, threadId: 'another-thread' })
            await expect(controller.getThreadRun('thread', 'run')).rejects.toThrow(ForbiddenException)
        })

        it('preserves not-found errors without falling back to the full detail query', async () => {
            const { controller, queries } = setup()
            queries.execute.mockResolvedValueOnce(conversation).mockRejectedValueOnce(new NotFoundException())
            await expect(controller.getThreadRun('thread', 'missing')).rejects.toThrow(NotFoundException)
            expect(queries.execute).toHaveBeenCalledTimes(2)
        })
    })

    it('returns the persisted expert status, error and elapsed time through the SDK run metadata', async () => {
        const execution = {
            id: 'expert',
            threadId: 'thread',
            status: 'interrupted',
            error: 'Cancelled by user',
            elapsedTime: 2700000,
            createdAt: new Date('2026-10-02T08:00:00Z'),
            updatedAt: new Date('2026-10-02T08:45:00Z'),
            metadata: { invocationKind: 'external_assistant', sourceToolCallId: 'call' }
        }
        const queryBus = { execute: jest.fn().mockResolvedValue(execution) }
        const controller = new ThreadsController({} as never, queryBus as never, {} as never, {} as never)
        expect(await controller.getThreadRun('thread', 'expert')).toMatchObject({
            run_id: 'expert',
            thread_id: 'thread',
            status: 'interrupted',
            metadata: {
                sourceToolCallId: 'call',
                agentRun: {
                    id: 'expert',
                    status: 'interrupted',
                    elapsedTime: 2700000,
                    error: 'Cancelled by user',
                    invocationKind: 'external_assistant'
                }
            }
        })
    })
    beforeEach(() => {
        jest.clearAllMocks()
        ;(getPublicXpertSessionConversationScope as jest.Mock).mockReturnValue(null)
    })

    it('rejects a malformed replay cursor before opening a Redis reader', async () => {
        const queryBus = { execute: jest.fn(async () => ({ threadId: 'thread' })) }
        const redis = { createSseStream: jest.fn() }
        const controller = new ThreadsController({} as never, queryBus as never, {} as never, redis as never)
        await expect(
            controller.joinRunStream({} as never, {} as never, 'thread', 'run', 'invalid-cursor')
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(queryBus.execute).toHaveBeenCalledTimes(2)
        expect(redis.createSseStream).not.toHaveBeenCalled()
    })

    it('authorizes discovery before opening and before each snapshot read', async () => {
        const conversation = { id: 'conversation' }
        const queries = { execute: jest.fn().mockResolvedValue(conversation) }
        const activity = {
            snapshot: jest.fn().mockResolvedValue({ version: 1, threadId: 'thread', runs: [], cards: [] })
        }
        const controller = new ThreadsController(
            {} as never,
            queries as never,
            {} as never,
            {} as never,
            undefined,
            undefined,
            activity as never
        )
        const response = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false, write: jest.fn() })
        const { firstValueFrom } = await import('rxjs')
        const stream = await controller.streamThreadActivity(response as never, 'thread')
        await firstValueFrom(stream)
        response.emit('close')
        expect(queries.execute).toHaveBeenCalledTimes(2)
        expect(activity.snapshot).toHaveBeenCalledWith(conversation, 'thread')
        queries.execute.mockRejectedValue(new ForbiddenException())
        await expect(controller.streamThreadActivity(response as never, 'thread')).rejects.toBeInstanceOf(
            ForbiddenException
        )
    })

    it('authorizes contribution before routing expert cancellation without stopping the conversation', async () => {
        const execution = {
            id: 'expert',
            threadId: 'thread',
            metadata: { invocationKind: 'external_assistant' as const }
        }
        const queryBus = { execute: jest.fn().mockResolvedValue(execution) }
        const commandBus = { execute: jest.fn().mockResolvedValue({ canceledExecutionIds: ['expert'] }) }
        const controller = new ThreadsController({} as never, queryBus as never, commandBus as never, {} as never)
        await controller.cancelThreadRun('thread', 'expert')
        expect(queryBus.execute.mock.calls[0][0].operation).toBe('contribute')
        expect(commandBus.execute).toHaveBeenCalledWith(new CancelExternalAssistantCommand(execution))
        queryBus.execute.mockRejectedValueOnce(new ForbiddenException())
        await expect(controller.cancelThreadRun('thread', 'expert')).rejects.toBeInstanceOf(ForbiddenException)
        expect(commandBus.execute).toHaveBeenCalledTimes(1)
        queryBus.execute.mockResolvedValue(execution)
        await expect(controller.cancelThreadRun('foreign-thread', 'expert')).rejects.toBeInstanceOf(ForbiddenException)
        expect(commandBus.execute).toHaveBeenCalledTimes(1)
    })

    it('accepts a bodyless pause only after contribution access checks', async () => {
        const queryBus = { execute: jest.fn().mockResolvedValue({ threadId: 'thread' }) }
        const controls = {
            requestPause: jest.fn().mockResolvedValue({ state: 'pausing' }),
            releaseDisplayPause: jest.fn()
        }
        const controller = new ThreadsController(
            {} as never,
            queryBus as never,
            {} as never,
            {} as never,
            undefined,
            controls as never
        )
        await controller.pauseRun('thread', 'run')
        expect(queryBus.execute.mock.calls[0][0].operation).toBe('contribute')
        expect(controls.requestPause).toHaveBeenCalledWith('thread', 'run')
        await controller.releaseDisplayPause('thread', 'token')
        expect(queryBus.execute.mock.calls[2][0].operation).toBe('contribute')
        expect(controls.releaseDisplayPause).toHaveBeenCalledWith('thread', 'token')
        queryBus.execute.mockRejectedValue(new ForbiddenException())
        await expect(controller.releaseDisplayPause('other-thread', 'token')).rejects.toBeInstanceOf(ForbiddenException)
        expect(controls.releaseDisplayPause).toHaveBeenCalledTimes(1)
    })

    it('returns direct follow-up streams without waiting on Redis SSE replay', async () => {
        const stream = EMPTY
        const commandBus = {
            execute: jest.fn().mockResolvedValue({
                execution: { id: 'execution-1' },
                stream,
                streamTransport: 'direct'
            })
        }
        const redisSseStreamService = {
            createSseStream: jest.fn(),
            releaseConnection: jest.fn()
        }
        const response = Object.assign(new EventEmitter(), {
            destroyed: false,
            writableEnded: false,
            write: jest.fn(),
            setHeader: jest.fn()
        })
        const controller = new ThreadsController(
            {} as never,
            {} as never,
            commandBus as never,
            redisSseStreamService as never
        )

        try {
            const result = await controller.runStream({} as never, response as never, 'thread-1', {
                assistant_id: 'xpert-1',
                input: {
                    action: 'follow_up'
                }
            } as never)

            expect(response.setHeader).toHaveBeenCalledWith(
                'Content-Location',
                '/api/ai/threads/thread-1/runs/execution-1'
            )
            expect(result).toBeUndefined()
            expect(writeSseResponse).toHaveBeenCalledWith(expect.anything(), response, stream)
            expect(commandBus.execute.mock.calls[0][0]).toBeInstanceOf(RunCreateStreamCommand)
            expect(redisSseStreamService.createSseStream).not.toHaveBeenCalled()
            expect(redisSseStreamService.releaseConnection).not.toHaveBeenCalled()
        } finally {
            response.emit('close')
        }
    })

    it('registers the resumed reader before starting the producer', async () => {
        const subscribe = jest.fn()
        const commandBus = {
            execute: jest.fn().mockResolvedValue({
                execution: { id: 'run-1' },
                stream: { subscribe },
                streamTransport: 'redis'
            })
        }
        const redisSseStreamService = {
            createSseStream: jest.fn().mockResolvedValue({ connectionId: 'connection-1', stream: EMPTY }),
            releaseConnection: jest.fn().mockResolvedValue(true)
        }
        const response = Object.assign(new EventEmitter(), {
            headersSent: false,
            destroyed: false,
            writableEnded: false,
            write: jest.fn(),
            setHeader: jest.fn()
        })
        const controller = new ThreadsController(
            {} as never,
            {} as never,
            commandBus as never,
            redisSseStreamService as never
        )
        try {
            await controller.runStream({ headers: {} } as never, response as never, 'thread-1', {
                assistant_id: 'xpert-1',
                input: { action: 'send' }
            } as never)
            expect(response.setHeader).toHaveBeenCalledWith('Content-Location', '/api/ai/threads/thread-1/runs/run-1')
            expect(subscribe).toHaveBeenCalledTimes(1)
            expect(redisSseStreamService.createSseStream).toHaveBeenCalledTimes(1)
            expect(redisSseStreamService.createSseStream.mock.invocationCallOrder[0]).toBeLessThan(
                subscribe.mock.invocationCallOrder[0]
            )
        } finally {
            response.emit('close')
        }
    })

    it('writes SSE comments while a Redis-backed run has no new events', async () => {
        jest.useFakeTimers()
        const commandBus = {
            execute: jest.fn().mockResolvedValue({
                execution: { id: 'run-1' },
                stream: EMPTY,
                streamTransport: 'redis'
            })
        }
        const redisSseStreamService = {
            createSseStream: jest.fn().mockResolvedValue({
                connectionId: 'connection-1',
                stream: EMPTY
            }),
            releaseConnection: jest.fn().mockResolvedValue(true)
        }
        const response = Object.assign(new EventEmitter(), {
            destroyed: false,
            writableEnded: false,
            write: jest.fn(),
            setHeader: jest.fn()
        })
        const controller = new ThreadsController(
            {} as never,
            {} as never,
            commandBus as never,
            redisSseStreamService as never
        )

        try {
            await controller.runStream({ headers: {} } as never, response as never, 'thread-1', {
                assistant_id: 'xpert-1',
                input: { action: 'send' }
            } as never)

            jest.advanceTimersByTime(30000)
            expect(response.write).toHaveBeenCalledWith(': keep-alive\n\n')

            response.emit('close')
            jest.advanceTimersByTime(30000)
            expect(response.write).toHaveBeenCalledTimes(1)
        } finally {
            response.emit('close')
            jest.useRealTimers()
        }
    })

    it('does not start a heartbeat after the response closes during stream setup', async () => {
        jest.useFakeTimers()
        type RunStreamResult = {
            execution: { id: string }
            stream: typeof EMPTY
            streamTransport: 'direct'
        }
        let resolveExecute: ((value: RunStreamResult) => void) | null = null
        const commandBus = {
            execute: jest.fn().mockImplementation(
                () =>
                    new Promise<RunStreamResult>((resolve) => {
                        resolveExecute = resolve
                    })
            )
        }
        const response = Object.assign(new EventEmitter(), {
            destroyed: false,
            writableEnded: false,
            write: jest.fn(),
            setHeader: jest.fn()
        })
        const controller = new ThreadsController({} as never, {} as never, commandBus as never, {} as never)

        try {
            const pendingStream = controller.runStream({} as never, response as never, 'thread-1', {
                assistant_id: 'xpert-1',
                input: { action: 'follow_up' }
            } as never)

            response.destroyed = true
            response.emit('close')
            if (!resolveExecute) {
                throw new Error('Expected stream setup to start')
            }
            resolveExecute({
                execution: { id: 'execution-1' },
                stream: EMPTY,
                streamTransport: 'direct'
            })
            await pendingStream

            jest.advanceTimersByTime(30000)
            expect(response.write).not.toHaveBeenCalled()
        } finally {
            response.emit('close')
            jest.useRealTimers()
        }
    })

    it('uses the authorized run scope only when the client opts into snapshots', async () => {
        const redis = {
            createSseStream: jest.fn().mockResolvedValue({ connectionId: 'c', stream: EMPTY }),
            releaseConnection: jest.fn().mockResolvedValue(true)
        }
        const query = {
            execute: jest.fn(async (value: object) =>
                value.constructor.name === 'AssertChatConversationAccessQuery'
                    ? { id: 'conversation', threadId: 'thread' }
                    : { id: 'run', threadId: 'thread', tenantId: 'tenant', organizationId: 'organization' }
            )
        }
        const command = { execute: jest.fn() }
        const controller = new ThreadsController({} as never, query as never, command as never, redis as never)
        const response = new EventEmitter()
        try {
            await controller.joinRunStream(
                { headers: { 'organization-id': 'untrusted' } } as never,
                response as never,
                'thread',
                'run',
                '1-0',
                '1'
            )
            expect(redis.createSseStream).toHaveBeenLastCalledWith(
                expect.objectContaining({ snapshotScope: { tenantId: 'tenant', organizationId: 'organization' } })
            )
            await controller.joinRunStream({ headers: {} } as never, response as never, 'thread', 'run', '1-0')
            expect(redis.createSseStream.mock.calls[1][0]).not.toHaveProperty('snapshotScope')
            expect(command.execute).not.toHaveBeenCalled()
        } finally {
            response.emit('close')
        }
    })

    it('allows multiple clients to join the same run stream', async () => {
        const firstStream = EMPTY
        const secondStream = EMPTY
        const redisSseStreamService = {
            createSseStream: jest
                .fn()
                .mockResolvedValueOnce({
                    connectionId: 'connection-1',
                    stream: firstStream
                })
                .mockResolvedValueOnce({
                    connectionId: 'connection-2',
                    stream: secondStream
                }),
            releaseConnection: jest.fn().mockResolvedValue(true)
        }
        const queryBus = {
            execute: jest.fn(async (query: object) =>
                query.constructor.name === 'AssertChatConversationAccessQuery'
                    ? { id: 'conversation-1', threadId: 'thread-1', createdById: 'user-1' }
                    : { id: 'run-1', threadId: 'thread-1' }
            )
        }
        const controller = new ThreadsController({} as any, queryBus as any, {} as any, redisSseStreamService as any)
        const firstResponse = new EventEmitter()
        const secondResponse = new EventEmitter()

        const firstResult = await controller.joinRunStream(
            { headers: {} } as any,
            firstResponse as any,
            'thread-1',
            'run-1'
        )
        const secondResult = await controller.joinRunStream(
            { headers: {}, method: 'GET', originalUrl: '/threads/thread-1/runs/run-1/stream' } as any,
            secondResponse as any,
            'thread-1',
            'run-1',
            '1-0'
        )

        expect(firstResult).toBe(firstStream)
        expect(secondResult).toBe(secondStream)
        expect(redisSseStreamService.createSseStream).toHaveBeenCalledTimes(2)
        expect(redisSseStreamService.createSseStream).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                threadId: 'thread-1',
                runId: 'run-1',
                mode: 'join'
            })
        )
        expect(redisSseStreamService.createSseStream).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                threadId: 'thread-1',
                runId: 'run-1',
                lastEventId: '1-0',
                mode: 'join'
            })
        )

        firstResponse.emit('close')
        expect(redisSseStreamService.releaseConnection).toHaveBeenCalledWith('thread-1', 'run-1', 'connection-1')
        expect(redisSseStreamService.releaseConnection).not.toHaveBeenCalledWith('thread-1', 'run-1', 'connection-2')

        secondResponse.emit('close')
        expect(redisSseStreamService.releaseConnection).toHaveBeenCalledWith('thread-1', 'run-1', 'connection-2')
    })

    it('rejects a run id that belongs to another restricted-assistant thread', async () => {
        ;(getPublicXpertSessionConversationScope as jest.Mock).mockReturnValue({
            createdById: 'employee-1',
            xpertId: 'xpert-1'
        })
        const queryBus = {
            execute: jest
                .fn()
                .mockResolvedValueOnce({ createdById: 'employee-1', xpertId: 'xpert-1' })
                .mockResolvedValueOnce({ id: 'run-other', threadId: 'thread-other' })
        }
        const controller = new ThreadsController({} as never, queryBus as never, {} as never, {} as never)

        await expect(controller.getThreadRun('thread-1', 'run-other')).rejects.toBeInstanceOf(ForbiddenException)
    })
})

describe('run stream HTTP admission with Nest interceptors', () => {
    let app: INestApplication
    let endpoint: string
    const commandBus = { execute: jest.fn() }
    const queryBus = { execute: jest.fn().mockResolvedValue({ threadId: 'thread-1' }) }
    const controls = {
        requestPause: jest.fn().mockResolvedValue({ executionId: 'run-1', state: 'pausing', pauseId: 'token' })
    }
    const redis = { createSseStream: jest.fn(), releaseConnection: jest.fn().mockResolvedValue(true) }

    beforeAll(async () => {
        ;(writeSseResponse as jest.Mock).mockImplementation(
            jest.requireActual('../shared/stream/write-sse-response').writeSseResponse
        )
        const module = await Test.createTestingModule({
            controllers: [ThreadsController],
            providers: [
                { provide: AiService, useValue: {} },
                { provide: QueryBus, useValue: queryBus },
                { provide: ThreadRunControlService, useValue: controls },
                { provide: CommandBus, useValue: commandBus },
                { provide: RedisSseStreamService, useValue: redis }
            ]
        })
            .overrideGuard(ApiKeyOrClientSecretAuthGuard)
            .useValue({ canActivate: () => true })
            .overrideInterceptor(TransformInterceptor)
            .useValue({ intercept: (_context: ExecutionContext, next: CallHandler) => next.handle() })
            .compile()
        app = module.createNestApplication({ logger: false })
        app.use(json({ limit: '4mb' }))
        await app.listen(0, '127.0.0.1')
        const address: AddressInfo = app.getHttpServer().address()
        endpoint = `http://127.0.0.1:${address.port}/threads/thread-1/runs/stream`
    })

    afterAll(async () => {
        await app?.close()
        ;(writeSseResponse as jest.Mock).mockReset()
    })

    it.each([undefined, { displaySnapshot: 42 }, { displaySnapshot: 'x'.repeat(2_800_000) }])(
        'accepts a pause independent of legacy presentation bodies',
        async (body) => {
            controls.requestPause.mockClear()
            const response = await fetch(endpoint.replace('/stream', '/run-1/pause'), {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                ...(body ? { body: JSON.stringify(body) } : {})
            })
            expect(response.status).toBe(202)
            const result = await response.text()
            expect(result.length).toBeLessThan(256)
            expect(JSON.parse(result)).toEqual({ executionId: 'run-1', state: 'pausing', pauseId: 'token' })
            expect(controls.requestPause).toHaveBeenCalledTimes(1)
            expect(controls.requestPause).toHaveBeenCalledWith('thread-1', 'run-1')
        }
    )

    it('rejects unauthorized pause before changing run state', async () => {
        controls.requestPause.mockClear()
        queryBus.execute.mockRejectedValueOnce(new ForbiddenException())
        const response = await fetch(endpoint.replace('/stream', '/run-1/pause'), { method: 'POST' })
        expect(response.status).toBe(403)
        expect(controls.requestPause).not.toHaveBeenCalled()
    })

    it.each(['direct', 'redis'])('acknowledges an accepted %s run before it completes', async (transport) => {
        const events = new Subject<SseMessageEvent>()
        commandBus.execute.mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20))
            return {
                execution: { id: 'run-1' },
                stream: transport === 'direct' ? events : EMPTY,
                streamTransport: transport
            }
        })
        redis.createSseStream.mockResolvedValue({ connectionId: 'connection-1', stream: events })
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ assistant_id: 'assistant', input: { action: 'resume' } })
        })
        expect(response.status).toBe(201)
        expect(response.headers.get('Content-Location')).toBe('/api/ai/threads/thread-1/runs/run-1')
        expect(response.headers.get('content-type')).toBe('text/event-stream')
        // HTTP headers arrive while the Agent is still waiting, not at stream completion.
        events.next({ id: '2-0', type: 'message', data: { input: 'resumed output' } })
        events.next({ id: '3-0', type: 'complete', data: { type: 'complete' } })
        events.complete()
        const body = await response.text()
        expect(body).toContain('resumed output')
        expect(body).toContain('event: complete')
    })

    it('returns an actual admission error without an acknowledgement header', async () => {
        const logger = jest.spyOn(console, 'error').mockImplementation(() => undefined)
        commandBus.execute.mockRejectedValue(new ConflictException('Resume already running'))
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ assistant_id: 'assistant', input: { action: 'resume' } })
            })
            expect(response.status).toBe(409)
            expect(response.headers.get('Content-Location')).toBeNull()
            expect(await response.json()).toMatchObject({ message: 'Resume already running' })
        } finally {
            logger.mockRestore()
        }
    })
})
