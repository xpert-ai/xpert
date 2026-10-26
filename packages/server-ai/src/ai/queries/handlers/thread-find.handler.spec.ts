import { ReadThreadControlViewQuery } from '../../../chat-conversation/control-view/read-thread-control-view.query'
// Keep persistence and request-context boundaries isolated; exercise the real handler, DTO and scope policy.
jest.mock('../../../chat-conversation', () => ({
    ChatConversationThreadService: class {},
    GetChatConversationQuery: class {
        constructor(
            public readonly input: { threadId: string },
            public readonly relations?: string[]
        ) {}
    },
    AssertChatConversationAccessQuery: class {
        constructor(public readonly input: { id: string }) {}
    }
}))
jest.mock('../../../core/entities/internal', () => ({
    ChatConversation: class {},
    ChatConversationThread: class {}
}))
jest.mock('@xpert-ai/server-core', () => ({ UserPublicDTO: class {} }))
jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: { currentApiPrincipal: () => null, currentUserId: () => null }
}))
jest.mock('../../dto', () => ({ ThreadDTO: jest.requireActual('../../dto/thread.dto').ThreadDTO }))

import { QueryBus } from '@nestjs/cqrs'
import { FindThreadQuery } from '../thread-find.query'
import { FindThreadHandler } from './thread-find.handler'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { instanceToPlain } from 'class-transformer'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ChatThreadPurpose, SecretTokenBindingType } from '@xpert-ai/contracts'
import {
    AssertChatConversationAccessQuery,
    ChatConversationThreadService,
    GetChatConversationQuery
} from '../../../chat-conversation'
import { CopilotCheckpointGetTupleQuery } from '../../../copilot-checkpoint/queries'
import { ChatConversation, ChatConversationThread } from '../../../core/entities/internal'
import { IsPublishedXpertInFamilyQuery } from '../../../xpert/queries'
import { DISPLAY_PAUSE_KEY } from '../../../chat-conversation/thread-display-pause'
import { RUN_LEASE_KEY } from '../../../chat-conversation/thread-run-lease'

describe('FindThreadHandler', () => {
    afterEach(() => jest.restoreAllMocks())

    function threadFixture() {
        const conversation = Object.assign(new ChatConversation(), {
            id: 'conversation-1',
            threadId: 'primary-thread',
            xpertId: 'assistant-1',
            createdById: 'owner-1'
        })
        const thread = Object.assign(new ChatConversationThread(), {
            threadId: 'branch-1',
            conversation,
            status: 'paused',
            parentThreadId: 'primary-thread',
            forkedFromMessageId: 'message-1',
            runControl: { executionId: 'run-1', state: 'paused', pauseId: 'pause-1' },
            operation: { type: 'tool', tasks: [] }
        })
        const threads = Object.create(ChatConversationThreadService.prototype) as ChatConversationThreadService
        threads.requireByThreadId = jest.fn().mockResolvedValue(thread)
        const queryBus = Object.create(QueryBus.prototype) as QueryBus
        queryBus.execute = jest.fn(async (query: object) => {
            if (query instanceof ReadThreadControlViewQuery) return { thread, controlView: undefined }
            if (query instanceof CopilotCheckpointGetTupleQuery) {
                throw new Error('The large checkpoint must not be read')
            }
            return undefined
        })
        return { conversation, thread, queryBus, threads, handler: new FindThreadHandler(queryBus, threads) }
    }

    it('returns branch control and metadata without reading or exposing checkpoint values', async () => {
        const { handler, queryBus, threads } = threadFixture()
        const result = await handler.execute(new FindThreadQuery('branch-1'))
        const response = JSON.parse(JSON.stringify(instanceToPlain(result)))
        expect(response).toMatchObject({
            thread_id: 'branch-1',
            status: 'paused',
            runControl: { executionId: 'run-1', state: 'paused', pauseId: 'pause-1' },
            operation: { type: 'tool', tasks: [] },
            metadata: {
                conversation_id: 'conversation-1',
                assistant_id: 'assistant-1',
                parent_thread_id: 'primary-thread',
                forked_from_message_id: 'message-1'
            }
        })
        expect(response).not.toHaveProperty('values')
        expect(threads.requireByThreadId).toHaveBeenCalledWith('branch-1')
        expect(queryBus.execute).toHaveBeenCalledWith(new AssertChatConversationAccessQuery({ id: 'conversation-1' }))
        expect(queryBus.execute).not.toHaveBeenCalledWith(expect.any(CopilotCheckpointGetTupleQuery))
    })

    it('enforces conversation access for thread reads', async () => {
        const { handler, queryBus } = threadFixture()
        queryBus.execute = jest.fn().mockRejectedValue(new ForbiddenException())
        await expect(handler.execute(new FindThreadQuery('branch-1'))).rejects.toThrow(ForbiddenException)
        expect(queryBus.execute).not.toHaveBeenCalledWith(expect.any(CopilotCheckpointGetTupleQuery))
    })

    it('preserves the full public contract except values and strips private metadata', async () => {
        const { handler, queryBus, thread } = threadFixture()
        thread.createdAt = new Date('2026-10-16T01:00:00Z')
        thread.updatedAt = new Date('2026-10-16T02:00:00Z')
        thread.metadata = {
            purpose: ChatThreadPurpose.MessageEdit,
            [DISPLAY_PAUSE_KEY]: { snapshot: 'private transcript' },
            [RUN_LEASE_KEY]: { owner: 'private replica' }
        }
        const response = JSON.parse(
            JSON.stringify(instanceToPlain(await handler.execute(new FindThreadQuery('branch-1'))))
        )
        expect(queryBus.execute).not.toHaveBeenCalledWith(expect.any(CopilotCheckpointGetTupleQuery))
        expect(response).not.toHaveProperty('values')
        expect(response.created_at).toBe('2026-10-16T01:00:00.000Z')
        expect(response.updated_at).toBe('2026-10-16T02:00:00.000Z')
        expect(response.metadata.purpose).toBe(ChatThreadPurpose.MessageEdit)
        expect(response.metadata).not.toHaveProperty(DISPLAY_PAUSE_KEY)
        expect(response.metadata).not.toHaveProperty(RUN_LEASE_KEY)
    })

    it.each(['idle', 'busy', 'pausing', 'paused', 'interrupted', 'error'] as const)(
        'preserves branch status %s when no run-control or operation exists',
        async (status) => {
            const { handler, thread, queryBus } = threadFixture()
            thread.status = status
            thread.runControl = null
            thread.operation = null
            await expect(handler.execute(new FindThreadQuery('branch-1'))).resolves.toMatchObject({
                status,
                runControl: null,
                operation: null,
                values: undefined
            })
            expect(queryBus.execute).not.toHaveBeenCalledWith(expect.any(CopilotCheckpointGetTupleQuery))
        }
    )

    it('propagates a missing thread without querying checkpoints or another conversation', async () => {
        const { handler, threads, queryBus } = threadFixture()
        threads.requireByThreadId = jest.fn().mockRejectedValue(new NotFoundException())
        await expect(handler.execute(new FindThreadQuery('missing'))).rejects.toThrow(NotFoundException)
        expect(queryBus.execute).not.toHaveBeenCalled()
    })

    it('supports the conversation lookup path without hydrating a checkpoint', async () => {
        const { queryBus, conversation } = threadFixture()
        queryBus.execute = jest.fn(async (query: object) => {
            if (query instanceof GetChatConversationQuery) return conversation
            if (query instanceof AssertChatConversationAccessQuery) return undefined
            throw new Error('Unexpected query')
        })
        const handler = new FindThreadHandler(queryBus)
        await expect(handler.execute(new FindThreadQuery('primary-thread', ['xpert']))).resolves.toMatchObject({
            threadId: 'primary-thread',
            metadata: { id: 'conversation-1' },
            values: undefined
        })
        expect(queryBus.execute).toHaveBeenCalledWith(
            new GetChatConversationQuery({ threadId: 'primary-thread' }, ['xpert'])
        )
        expect(queryBus.execute).toHaveBeenCalledTimes(2)
    })

    describe.each([SecretTokenBindingType.ENTERPRISE_XPERT, SecretTokenBindingType.PUBLIC_XPERT])(
        '%s thread scope',
        (binding) => {
            beforeEach(() => {
                jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
                    principalType: 'client_secret',
                    clientSecretBindingType: binding,
                    resourceScope: { kind: 'assistant', xpertId: 'assistant-1' }
                } as ReturnType<typeof RequestContext.currentApiPrincipal>)
                jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner-1')
            })

            it('allows the bound assistant and owner', async () => {
                const { handler } = threadFixture()
                await expect(handler.execute(new FindThreadQuery('branch-1'))).resolves.toMatchObject({
                    threadId: 'branch-1',
                    values: undefined
                })
            })

            it.each([false, true])('respects assistant family access = %s', async (sameFamily) => {
                const { handler, conversation, queryBus, thread } = threadFixture()
                conversation.xpertId = 'assistant-previous'
                queryBus.execute = jest.fn(async (query: object) => {
                    if (query instanceof AssertChatConversationAccessQuery) return undefined
                    if (query instanceof ReadThreadControlViewQuery) return { thread, controlView: undefined }
                    if (query instanceof IsPublishedXpertInFamilyQuery) return sameFamily
                    throw new Error('Unexpected query')
                })
                const result = handler.execute(new FindThreadQuery('branch-1'))
                if (sameFamily) {
                    await expect(result).resolves.toMatchObject({ threadId: 'branch-1', values: undefined })
                } else {
                    await expect(result).rejects.toThrow(ForbiddenException)
                }
                expect(queryBus.execute).toHaveBeenCalledWith(
                    new IsPublishedXpertInFamilyQuery('assistant-previous', 'assistant-1')
                )
                expect(queryBus.execute).not.toHaveBeenCalledWith(expect.any(CopilotCheckpointGetTupleQuery))
            })
        }
    )

    it('enforces restricted client-secret ownership before returning thread information', async () => {
        const { handler, queryBus } = threadFixture()
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.ENTERPRISE_XPERT,
            resourceScope: { kind: 'assistant', xpertId: 'assistant-1' }
        } as ReturnType<typeof RequestContext.currentApiPrincipal>)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('another-user')
        await expect(handler.execute(new FindThreadQuery('branch-1'))).rejects.toThrow(ForbiddenException)
        expect(queryBus.execute).not.toHaveBeenCalledWith(expect.any(CopilotCheckpointGetTupleQuery))
    })

    it.each([undefined, { checkpoint: { channel_values: { messages: [{ id: 'message-1' }] } } }])(
        'returns metadata independently of persisted checkpoint state: %j',
        async (checkpoint) => {
            const queryBus = Object.create(QueryBus.prototype) as QueryBus
            queryBus.execute = jest.fn(async (query: object) => {
                if (query instanceof GetChatConversationQuery) {
                    return { id: 'conversation-1', threadId: 'thread-1', status: 'idle', xpertId: 'xpert-1' }
                }
                if (query instanceof CopilotCheckpointGetTupleQuery) return checkpoint
                return undefined
            })
            const handler = new FindThreadHandler(queryBus)
            const response = JSON.parse(
                JSON.stringify(instanceToPlain(await handler.execute(new FindThreadQuery('thread-1'))))
            )
            expect(response).toMatchObject({
                thread_id: 'thread-1',
                status: 'idle',
                metadata: { assistant_id: 'xpert-1' }
            })
            expect(response).not.toHaveProperty('values')
            expect(queryBus.execute).not.toHaveBeenCalledWith(expect.any(CopilotCheckpointGetTupleQuery))
        }
    )
})
