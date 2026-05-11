import { Logger } from '@nestjs/common'
import { ChatMessageTypeEnum, IXpertAgent } from '@xpert-ai/contracts'
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
})
