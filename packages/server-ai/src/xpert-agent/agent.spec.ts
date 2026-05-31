import { Logger } from '@nestjs/common'
import { ToolMessage } from '@langchain/core/messages'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum, IXpertAgent } from '@xpert-ai/contracts'
import { Subscriber } from 'rxjs'
import { createMapStreamEvents } from './agent'

jest.mock('../shared', () => {
    const streamText = jest.requireActual('../shared/agent/stream-text')

    return {
        AgentStateAnnotation: { State: {} },
        createTextChunk: streamText.createTextChunk
    }
})

describe('createMapStreamEvents', () => {
    const logger = {
        debug: jest.fn(),
        verbose: jest.fn(),
        warn: jest.fn()
    }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('adds execution metadata to streamed text chunks', () => {
        const subscriber = { next: jest.fn() }
        const mapStreamEvent = createMapStreamEvents(
            logger as unknown as Logger,
            subscriber as unknown as Subscriber<MessageEvent>,
            {
                agent: { key: 'Agent_root' } as unknown as IXpertAgent,
                unmutes: []
            }
        )

        const chunk = mapStreamEvent({
            event: 'on_chat_model_stream',
            tags: [],
            data: {
                chunk: {
                    id: 'message-stream-1',
                    content: 'Hello from child',
                    tool_call_chunks: [],
                    additional_kwargs: {}
                }
            },
            metadata: {
                agentKey: 'Agent_child',
                xpertName: 'Child Agent',
                executionId: 'child-execution',
                parentExecutionId: 'root-execution'
            },
            run_id: 'langgraph-run-1'
        })

        expect(chunk).toMatchObject({
            type: 'text',
            id: 'message-stream-1',
            text: 'Hello from child',
            agentKey: 'Agent_child',
            xpertName: 'Child Agent',
            executionId: 'child-execution',
            parentExecutionId: 'root-execution',
            runId: 'langgraph-run-1'
        })
    })

    it('adds execution metadata to reasoning chunks', () => {
        const subscriber = { next: jest.fn() }
        const mapStreamEvent = createMapStreamEvents(
            logger as unknown as Logger,
            subscriber as unknown as Subscriber<MessageEvent>,
            {
                agent: { key: 'Agent_root' } as unknown as IXpertAgent,
                unmutes: []
            }
        )

        const chunk = mapStreamEvent({
            event: 'on_chat_model_stream',
            tags: [],
            data: {
                chunk: {
                    id: 'reasoning-stream-1',
                    content: '',
                    tool_call_chunks: [],
                    additional_kwargs: {
                        reasoning_content: 'Thinking inside child'
                    }
                }
            },
            metadata: {
                agentKey: 'Agent_child',
                executionId: 'child-execution',
                parentExecutionId: 'root-execution'
            },
            run_id: 'langgraph-run-2'
        })

        expect(chunk).toMatchObject({
            type: 'reasoning',
            id: 'reasoning-stream-1',
            text: 'Thinking inside child',
            agentKey: 'Agent_child',
            executionId: 'child-execution',
            parentExecutionId: 'root-execution',
            runId: 'langgraph-run-2'
        })
    })

    it('adds execution metadata to tool start components', () => {
        const subscriber = { next: jest.fn() }
        const mapStreamEvent = createMapStreamEvents(
            logger as unknown as Logger,
            subscriber as unknown as Subscriber<MessageEvent>,
            {
                agent: { key: 'Agent_root' } as unknown as IXpertAgent,
                unmutes: []
            }
        )

        mapStreamEvent({
            event: 'on_tool_start',
            name: 'read_file',
            tags: [],
            data: {
                id: 'tool-call-1',
                input: { path: 'README.md' }
            },
            metadata: {
                agentKey: 'Agent_child',
                xpertName: 'Child Agent',
                executionId: 'child-execution',
                parentExecutionId: 'root-execution',
                toolset: 'filesystem',
                toolsetId: 'toolset-1'
            },
            run_id: 'tool-run-1'
        })

        expect(subscriber.next).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    type: ChatMessageTypeEnum.MESSAGE,
                    data: expect.objectContaining({
                        id: 'tool-call-1',
                        type: 'component',
                        agentKey: 'Agent_child',
                        xpertName: 'Child Agent',
                        executionId: 'child-execution',
                        parentExecutionId: 'root-execution',
                        runId: 'tool-run-1'
                    })
                })
            })
        )
    })

    it('surfaces xpert MCP meta artifacts on tool end components', () => {
        const subscriber = { next: jest.fn() }
        const mapStreamEvent = createMapStreamEvents(
            logger as unknown as Logger,
            subscriber as unknown as Subscriber<MessageEvent>,
            {
                agent: { key: 'Agent_root' } as unknown as IXpertAgent,
                unmutes: []
            }
        )
        const meta = {
            'xpertai/visualization': {
                type: 'uose.mdx.metric_snapshot',
                payload: {
                    resourceId: 'inner-bi'
                }
            }
        }

        mapStreamEvent({
            event: 'on_tool_end',
            name: 'query_data_xpert',
            tags: [],
            data: {
                output: new ToolMessage({
                    content: '{"ok":true}',
                    tool_call_id: 'tool-call-1',
                    artifact: meta
                })
            },
            metadata: {
                toolset: 'data-xpert',
                toolsetId: 'toolset-1'
            },
            run_id: 'tool-run-1'
        })

        expect(subscriber.next).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    type: ChatMessageTypeEnum.MESSAGE,
                    data: expect.objectContaining({
                        id: 'tool-call-1',
                        type: 'component',
                        data: expect.objectContaining({
                            status: 'success',
                            output: '{"ok":true}',
                            artifact: meta,
                            _meta: meta
                        })
                    })
                })
            })
        )
    })

    it('forwards middleware chat events without LangGraph envelope or agent identity', () => {
        const subscriber = { next: jest.fn() }
        const mapStreamEvent = createMapStreamEvents(
            logger as unknown as Logger,
            subscriber as unknown as Subscriber<MessageEvent>,
            {
                agent: { key: 'Agent_root' } as unknown as IXpertAgent,
                unmutes: []
            }
        )

        mapStreamEvent({
            event: 'on_custom_event',
            name: ChatMessageEventTypeEnum.ON_CHAT_EVENT,
            tags: ['thread-1', 'xpert-1', 'Agent_root'],
            run_id: 'langgraph-run-1',
            data: {
                type: 'middleware_event',
                middlewareName: 'ModelFallbackMiddleware',
                middlewareKey: 'Middleware_1',
                title: 'Model fallback',
                phase: 'fallback_started',
                message: 'Trying fallback model 1/1',
                status: 'running',
                executionId: 'execution-1',
                threadId: 'thread-1',
                created_date: '2026-05-31T11:11:52.310Z',
                agentKey: 'Agent_root',
                runId: 'langgraph-run-1',
                metadata: { agentKey: 'Agent_root' }
            },
            metadata: {
                agentKey: 'Agent_root',
                executionId: 'execution-1'
            }
        })

        expect(subscriber.next).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    type: ChatMessageTypeEnum.EVENT,
                    event: ChatMessageEventTypeEnum.ON_CHAT_EVENT,
                    data: expect.objectContaining({
                        type: 'middleware_event',
                        middlewareName: 'ModelFallbackMiddleware',
                        middlewareKey: 'Middleware_1',
                        title: 'Model fallback',
                        phase: 'fallback_started',
                        message: 'Trying fallback model 1/1',
                        status: 'running',
                        executionId: 'execution-1',
                        threadId: 'thread-1',
                        created_date: '2026-05-31T11:11:52.310Z'
                    })
                })
            })
        )
        const eventData = (subscriber.next as jest.Mock).mock.calls[0][0].data.data
        expect(eventData).not.toHaveProperty('agentKey')
        expect(eventData).not.toHaveProperty('runId')
        expect(eventData).not.toHaveProperty('run_id')
        expect(eventData).not.toHaveProperty('metadata')
        expect(eventData).not.toHaveProperty('tags')
        expect(eventData).not.toHaveProperty('name')
    })
})
