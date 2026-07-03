import { Observable, of } from 'rxjs'
import { ApiKeyBindingType } from '@xpert-ai/contracts'
import { AGENT_CHAT_DISPATCH_MESSAGE_TYPE, RequestContext } from '@xpert-ai/plugin-sdk'
import { AgentChatDispatchHandoffProcessor } from './agent-chat-dispatch.processor'
import { AgentChatCallbackNoopHandoffProcessor } from './agent-chat-callback-noop.processor'

describe('AgentChatDispatchHandoffProcessor', () => {
    const createContext = () => ({
        runId: 'run-id',
        traceId: 'trace-id',
        abortSignal: new AbortController().signal
    })

    const createMessage = (payload: Record<string, unknown>) => ({
        id: 'message-id',
        type: AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
        version: 1,
        tenantId: 'tenant-id',
        sessionKey: 'session-id',
        businessKey: 'business-id',
        attempt: 1,
        maxAttempts: 1,
        enqueuedAt: Date.now(),
        traceId: 'trace-id',
        payload,
        headers: {
            source: 'lark'
        }
    })

    const createProcessor = (overrides?: {
        commandBus?: { execute: jest.Mock }
        handoffQueueService?: { enqueue: jest.Mock }
        agentChatRealtime?: { publish: jest.Mock }
        moduleRef?: { get: jest.Mock }
    }) => {
        const commandBus = overrides?.commandBus ?? { execute: jest.fn() }
        const handoffQueueService = overrides?.handoffQueueService ?? { enqueue: jest.fn() }
        const agentChatRealtime = overrides?.agentChatRealtime ?? { publish: jest.fn() }
        return new AgentChatDispatchHandoffProcessor(
            commandBus as any,
            handoffQueueService as any,
            agentChatRealtime as any,
            overrides?.moduleRef as any
        )
    }

    it('returns dead when required payload fields are missing', async () => {
        const commandBus = { execute: jest.fn() }
        const handoffQueueService = { enqueue: jest.fn() }
        const agentChatRealtime = { publish: jest.fn() }
        const processor = new AgentChatDispatchHandoffProcessor(
            commandBus as any,
            handoffQueueService as any,
            agentChatRealtime as any
        )

        const result = await processor.process(
            createMessage({
                options: { xpertId: 'xpert-id' },
                callback: { messageType: 'channel.lark.chat_stream_event.v1' }
            }) as any,
            createContext() as any
        )

        expect(result).toEqual({
            status: 'dead',
            reason: 'Missing request in agent chat dispatch payload'
        })
    })

    it('returns dead when a send request is missing message.input', async () => {
        const commandBus = { execute: jest.fn() }
        const handoffQueueService = { enqueue: jest.fn() }
        const agentChatRealtime = { publish: jest.fn() }
        const processor = new AgentChatDispatchHandoffProcessor(
            commandBus as any,
            handoffQueueService as any,
            agentChatRealtime as any
        )

        const result = await processor.process(
            createMessage({
                request: {
                    action: 'send',
                    message: null
                },
                options: { xpertId: 'xpert-id' },
                callback: { messageType: 'channel.lark.chat_stream_event.v1' }
            }) as any,
            createContext() as any
        )

        expect(result).toEqual({
            status: 'dead',
            reason: 'Invalid send request in agent chat dispatch payload: message.input is required'
        })
        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it('runs assistant runtime principal as the target xpert technical user', async () => {
        const commandBus = { execute: jest.fn() }
        const handoffQueueService = { enqueue: jest.fn().mockResolvedValue({ id: 'callback-job-id' }) }
        const agentChatRealtime = { publish: jest.fn() }
        const xpertPrincipalService = {
            ensurePrincipalUserByXpertId: jest.fn().mockResolvedValue({
                xpert: {
                    id: 'xpert-id',
                    tenantId: 'tenant-id',
                    organizationId: 'org-1',
                    createdById: 'owner-user'
                },
                user: {
                    id: 'assistant-tech-user',
                    tenantId: 'tenant-id',
                    type: 'communication'
                }
            })
        }
        const moduleRef = { get: jest.fn().mockReturnValue(xpertPrincipalService) }
        const processor = createProcessor({
            commandBus,
            handoffQueueService,
            agentChatRealtime,
            moduleRef
        })
        let capturedUser: any
        let capturedHeaders: any
        let capturedCommand: any
        commandBus.execute.mockImplementation((command) => {
            capturedCommand = command
            capturedUser = RequestContext.currentUser()
            capturedHeaders = RequestContext.currentRequest()?.headers
            return of()
        })

        const message = createMessage({
            request: { input: { input: 'hello world' } },
            options: {
                xpertId: 'xpert-id',
                runtimePrincipal: {
                    type: 'assistant',
                    sourceIntegrationId: 'integration-1'
                },
                sourceMessageLogIds: ['log-1', 'log-2']
            },
            callback: {
                messageType: 'channel.lark.chat_stream_event.v1',
                context: {
                    currentInboundLogIds: ['log-2', 'log-3']
                }
            }
        }) as any
        message.headers = {
            ...message.headers,
            organizationId: 'wrong-org',
            userId: 'legacy-user',
            language: 'zh-Hans'
        }

        const result = await processor.process(message, createContext() as any)

        expect(result).toEqual({ status: 'ok' })
        expect(xpertPrincipalService.ensurePrincipalUserByXpertId).toHaveBeenCalledWith({
            xpertId: 'xpert-id',
            tenantId: 'tenant-id'
        })
        expect(capturedUser).toEqual(
            expect.objectContaining({
                id: 'assistant-tech-user',
                tenantId: 'tenant-id',
                principalType: 'api_key',
                ownerUserId: 'owner-user',
                apiKeyUserId: 'assistant-tech-user',
                requestedOrganizationId: 'org-1',
                apiKey: expect.objectContaining({
                    type: ApiKeyBindingType.ASSISTANT,
                    entityId: 'xpert-id',
                    userId: 'assistant-tech-user',
                    organizationId: 'org-1'
                })
            })
        )
        expect(capturedHeaders).toEqual(
            expect.objectContaining({
                'tenant-id': 'tenant-id',
                'organization-id': 'org-1',
                'x-scope-level': 'organization',
                language: 'zh-Hans'
            })
        )
        expect(capturedCommand.options).toEqual(
            expect.objectContaining({
                sourceIntegrationId: 'integration-1',
                integrationId: 'integration-1',
                sourceMessageLogIds: ['log-1', 'log-2', 'log-3'],
                handoffMessageId: 'message-id',
                handoffTraceId: 'trace-id'
            })
        )
    })

    it('rejects assistant runtime principal when the principal xpert differs from the dispatch xpert', async () => {
        const commandBus = { execute: jest.fn() }
        const handoffQueueService = { enqueue: jest.fn().mockResolvedValue({ id: 'callback-job-id' }) }
        const processor = createProcessor({
            commandBus,
            handoffQueueService
        })

        const result = await processor.process(
            createMessage({
                request: { input: { input: 'hello world' } },
                options: {
                    xpertId: 'xpert-id',
                    runtimePrincipal: {
                        type: 'assistant',
                        xpertId: 'other-xpert-id'
                    }
                },
                callback: {
                    messageType: 'channel.wechat.chat_final_event.v1'
                }
            }) as any,
            createContext() as any
        )

        expect(result).toEqual({
            status: 'dead',
            reason: 'Assistant runtime principal xpertId must match dispatch xpertId'
        })
        expect(commandBus.execute).not.toHaveBeenCalled()
        expect(handoffQueueService.enqueue).toHaveBeenCalledWith(
            expect.objectContaining({
                payload: expect.objectContaining({
                    kind: 'error',
                    error: 'Assistant runtime principal xpertId must match dispatch xpertId'
                })
            })
        )
    })

    it('keeps legacy header userId behavior when runtimePrincipal is absent', async () => {
        const commandBus = { execute: jest.fn() }
        const processor = createProcessor({
            commandBus,
            handoffQueueService: { enqueue: jest.fn().mockResolvedValue({ id: 'callback-job-id' }) }
        })
        let capturedUser: any
        commandBus.execute.mockImplementation(() => {
            capturedUser = RequestContext.currentUser()
            return of()
        })
        const message = createMessage({
            request: { input: { input: 'hello world' } },
            options: { xpertId: 'xpert-id' },
            callback: {
                messageType: 'channel.lark.chat_stream_event.v1'
            }
        }) as any
        message.headers = {
            ...message.headers,
            userId: 'legacy-user',
            organizationId: 'org-1'
        }

        const result = await processor.process(message, createContext() as any)

        expect(result).toEqual({ status: 'ok' })
        expect(capturedUser).toEqual({
            id: 'legacy-user',
            tenantId: 'tenant-id'
        })
    })

    it('converts stream events to callback messages with increasing sequence', async () => {
        const commandBus = { execute: jest.fn() }
        const handoffQueueService = { enqueue: jest.fn().mockResolvedValue({ id: 'callback-job-id' }) }
        const agentChatRealtime = { publish: jest.fn() }
        const processor = new AgentChatDispatchHandoffProcessor(
            commandBus as any,
            handoffQueueService as any,
            agentChatRealtime as any
        )

        commandBus.execute.mockResolvedValue(
            of(
                { data: { type: 'message', data: 'hello' } } as MessageEvent,
                { data: { type: 'message', data: 'world' } } as MessageEvent
            )
        )

        const result = await processor.process(
            createMessage({
                request: { input: { input: 'hello world' } },
                options: { xpertId: 'xpert-id' },
                callback: {
                    messageType: 'channel.lark.chat_stream_event.v1',
                    context: { integrationId: 'integration-id' }
                }
            }) as any,
            createContext() as any
        )

        expect(result).toEqual({ status: 'ok' })
        expect(handoffQueueService.enqueue).toHaveBeenCalledTimes(3)

        const callbackPayloads = handoffQueueService.enqueue.mock.calls.map(
            ([callbackMessage]: [{ payload: { sequence: number; kind: string } }]) => callbackMessage.payload
        )
        expect(callbackPayloads.map((payload) => payload.sequence)).toEqual([1, 2, 3])
        expect(callbackPayloads.map((payload) => payload.kind)).toEqual(['stream', 'stream', 'complete'])
    })

    it('heartbeats for handoff callback stream events', async () => {
        const commandBus = { execute: jest.fn() }
        const handoffQueueService = { enqueue: jest.fn().mockResolvedValue({ id: 'callback-job-id' }) }
        const agentChatRealtime = { publish: jest.fn() }
        const processor = new AgentChatDispatchHandoffProcessor(
            commandBus as any,
            handoffQueueService as any,
            agentChatRealtime as any
        )
        const heartbeat = jest.fn()

        commandBus.execute.mockResolvedValue(
            of(
                { data: { type: 'message', data: 'hello' } } as MessageEvent,
                { data: { type: 'message', data: 'world' } } as MessageEvent
            )
        )

        const result = await processor.process(
            createMessage({
                request: { input: { input: 'hello world' } },
                options: { xpertId: 'xpert-id' },
                callback: {
                    messageType: 'channel.lark.chat_stream_event.v1'
                }
            }) as any,
            {
                ...createContext(),
                heartbeat
            } as any
        )

        expect(result).toEqual({ status: 'ok' })
        expect(heartbeat.mock.calls.map(([reason]) => reason)).toEqual([
            'agent_chat_dispatch_stream_start',
            'agent_chat_dispatch_stream_event',
            'agent_chat_dispatch_stream_event',
            'agent_chat_dispatch_stream_complete'
        ])
    })

    it('emits error callback message when source observable fails', async () => {
        const commandBus = { execute: jest.fn() }
        const handoffQueueService = { enqueue: jest.fn().mockResolvedValue({ id: 'callback-job-id' }) }
        const agentChatRealtime = { publish: jest.fn() }
        const processor = new AgentChatDispatchHandoffProcessor(
            commandBus as any,
            handoffQueueService as any,
            agentChatRealtime as any
        )

        commandBus.execute.mockResolvedValue(
            new Observable<MessageEvent>((subscriber) => {
                subscriber.error(new Error('boom'))
            })
        )

        const result = await processor.process(
            createMessage({
                request: { input: { input: 'hello world' } },
                options: { xpertId: 'xpert-id' },
                callback: {
                    messageType: 'channel.lark.chat_stream_event.v1'
                }
            }) as any,
            createContext() as any
        )

        expect(result).toEqual({ status: 'ok' })
        expect(handoffQueueService.enqueue).toHaveBeenCalledTimes(1)
        expect(handoffQueueService.enqueue.mock.calls[0][0].payload.kind).toBe('error')
        expect(handoffQueueService.enqueue.mock.calls[0][0].payload.error).toBe('boom')
    })

    it('publishes stream events to redis pubsub without callback queue messages', async () => {
        const commandBus = { execute: jest.fn() }
        const handoffQueueService = { enqueue: jest.fn() }
        const agentChatRealtime = { publish: jest.fn().mockResolvedValue(undefined) }
        const processor = new AgentChatDispatchHandoffProcessor(
            commandBus as any,
            handoffQueueService as any,
            agentChatRealtime as any
        )

        commandBus.execute.mockResolvedValue(
            of(
                { data: { type: 'message', data: 'hello' } } as MessageEvent,
                { data: { type: 'message', data: 'world' } } as MessageEvent
            )
        )

        const result = await processor.process(
            createMessage({
                request: { input: { input: 'hello world' } },
                options: { xpertId: 'xpert-id' },
                callback: {
                    transport: 'redis-pubsub',
                    context: { requestId: 'request-id' }
                }
            }) as any,
            createContext() as any
        )

        expect(result).toEqual({ status: 'ok' })
        expect(handoffQueueService.enqueue).not.toHaveBeenCalled()
        expect(agentChatRealtime.publish).toHaveBeenCalledTimes(3)
        expect(agentChatRealtime.publish.mock.calls.map(([runId]) => runId)).toEqual([
            'message-id',
            'message-id',
            'message-id'
        ])
        expect(agentChatRealtime.publish.mock.calls.map(([, payload]) => payload.kind)).toEqual([
            'stream',
            'stream',
            'complete'
        ])
        expect(agentChatRealtime.publish.mock.calls.map(([, payload]) => payload.sequence)).toEqual([1, 2, 3])
    })

    it('heartbeats for redis pubsub stream events', async () => {
        const commandBus = { execute: jest.fn() }
        const handoffQueueService = { enqueue: jest.fn() }
        const agentChatRealtime = { publish: jest.fn().mockResolvedValue(undefined) }
        const processor = new AgentChatDispatchHandoffProcessor(
            commandBus as any,
            handoffQueueService as any,
            agentChatRealtime as any
        )
        const heartbeat = jest.fn()

        commandBus.execute.mockResolvedValue(
            of(
                { data: { type: 'message', data: 'hello' } } as MessageEvent,
                { data: { type: 'message', data: 'world' } } as MessageEvent
            )
        )

        const result = await processor.process(
            createMessage({
                request: { input: { input: 'hello world' } },
                options: { xpertId: 'xpert-id' },
                callback: {
                    transport: 'redis-pubsub',
                    context: { requestId: 'request-id' }
                }
            }) as any,
            {
                ...createContext(),
                heartbeat
            } as any
        )

        expect(result).toEqual({ status: 'ok' })
        expect(heartbeat.mock.calls.map(([reason]) => reason)).toEqual([
            'agent_chat_dispatch_stream_start',
            'agent_chat_dispatch_stream_event',
            'agent_chat_dispatch_stream_event',
            'agent_chat_dispatch_stream_complete'
        ])
    })

    it('enqueues abort callback with the dispatcher abort reason', async () => {
        const commandBus = { execute: jest.fn() }
        const handoffQueueService = { enqueue: jest.fn().mockResolvedValue({ id: 'callback-job-id' }) }
        const agentChatRealtime = { publish: jest.fn() }
        const processor = new AgentChatDispatchHandoffProcessor(
            commandBus as any,
            handoffQueueService as any,
            agentChatRealtime as any
        )
        const abortController = new AbortController()
        let markSubscribed!: () => void
        const subscribed = new Promise<void>((resolve) => {
            markSubscribed = resolve
        })

        commandBus.execute.mockResolvedValue(
            new Observable<MessageEvent>(() => {
                markSubscribed()
            })
        )

        const resultPromise = processor.process(
            createMessage({
                request: { input: { input: 'hello world' } },
                options: { xpertId: 'xpert-id' },
                callback: {
                    messageType: 'channel.wechat.chat_final_event.v1',
                    context: { integrationId: 'integration-id' }
                }
            }) as any,
            {
                runId: 'run-id',
                traceId: 'trace-id',
                abortSignal: abortController.signal,
                getAbortReason: () => 'Handoff idle timeout after 120000ms'
            } as any
        )

        await subscribed
        abortController.abort()

        await expect(resultPromise).resolves.toEqual({ status: 'ok' })
        expect(handoffQueueService.enqueue).toHaveBeenCalledTimes(1)
        expect(handoffQueueService.enqueue.mock.calls[0][0].payload).toEqual(
            expect.objectContaining({
                kind: 'error',
                error: 'Agent chat dispatch aborted: Handoff idle timeout after 120000ms'
            })
        )
    })

    it('publishes redis pubsub error when command dispatch fails before stream starts', async () => {
        const commandBus = { execute: jest.fn() }
        const handoffQueueService = { enqueue: jest.fn() }
        const agentChatRealtime = { publish: jest.fn().mockResolvedValue(undefined) }
        const processor = new AgentChatDispatchHandoffProcessor(
            commandBus as any,
            handoffQueueService as any,
            agentChatRealtime as any
        )

        commandBus.execute.mockRejectedValue(new Error('Access denied to workspace'))

        const result = await processor.process(
            createMessage({
                request: { input: { input: 'hello world' } },
                options: { xpertId: 'xpert-id' },
                callback: {
                    transport: 'redis-pubsub',
                    context: { requestId: 'request-id' }
                }
            }) as any,
            createContext() as any
        )

        expect(result).toEqual({
            status: 'dead',
            reason: 'Access denied to workspace'
        })
        expect(handoffQueueService.enqueue).not.toHaveBeenCalled()
        expect(agentChatRealtime.publish).toHaveBeenCalledWith('message-id', {
            kind: 'error',
            sourceMessageId: 'message-id',
            sequence: 1,
            error: 'Access denied to workspace',
            context: { requestId: 'request-id' }
        })
    })

    it('enqueues handoff callback error when command dispatch fails before stream starts', async () => {
        const commandBus = { execute: jest.fn() }
        const handoffQueueService = { enqueue: jest.fn().mockResolvedValue({ id: 'callback-job-id' }) }
        const agentChatRealtime = { publish: jest.fn() }
        const processor = new AgentChatDispatchHandoffProcessor(
            commandBus as any,
            handoffQueueService as any,
            agentChatRealtime as any
        )

        commandBus.execute.mockRejectedValue(new Error('Access denied to workspace'))

        const result = await processor.process(
            createMessage({
                request: { input: { input: 'hello world' } },
                options: { xpertId: 'xpert-id' },
                callback: {
                    messageType: 'channel.wechat.chat_final_event.v1',
                    context: { integrationId: 'integration-id', currentInboundLogIds: ['inbound-log-1'] }
                }
            }) as any,
            createContext() as any
        )

        expect(result).toEqual({
            status: 'dead',
            reason: 'Access denied to workspace'
        })
        expect(handoffQueueService.enqueue).toHaveBeenCalledTimes(1)
        expect(handoffQueueService.enqueue.mock.calls[0][0]).toEqual(
            expect.objectContaining({
                type: 'channel.wechat.chat_final_event.v1',
                parentMessageId: 'message-id',
                payload: expect.objectContaining({
                    kind: 'error',
                    sourceMessageId: 'message-id',
                    sequence: 1,
                    error: 'Access denied to workspace',
                    context: { integrationId: 'integration-id', currentInboundLogIds: ['inbound-log-1'] }
                })
            })
        )
        expect(agentChatRealtime.publish).not.toHaveBeenCalled()
    })
})

describe('AgentChatCallbackNoopHandoffProcessor', () => {
    it.each(['stream', 'complete', 'error'] as const)('returns ok for %s callback envelopes', async (kind) => {
        const processor = new AgentChatCallbackNoopHandoffProcessor()
        const payload =
            kind === 'stream'
                ? {
                      kind,
                      sourceMessageId: 'source-id',
                      sequence: 1,
                      event: { type: 'message', data: 'hello' }
                  }
                : kind === 'error'
                  ? {
                        kind,
                        sourceMessageId: 'source-id',
                        sequence: 1,
                        error: 'boom'
                    }
                  : {
                        kind,
                        sourceMessageId: 'source-id',
                        sequence: 1
                    }

        const result = await processor.process(
            {
                id: 'callback-id',
                type: 'agent.chat_callback.noop.v1',
                version: 1,
                tenantId: 'tenant-id',
                sessionKey: 'session-id',
                businessKey: 'business-id',
                attempt: 1,
                maxAttempts: 1,
                enqueuedAt: Date.now(),
                traceId: 'trace-id',
                payload
            } as any,
            {
                runId: 'run-id',
                traceId: 'trace-id',
                abortSignal: new AbortController().signal
            } as any
        )

        expect(result).toEqual({ status: 'ok' })
    })
})
