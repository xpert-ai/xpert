import { Logger } from '@nestjs/common'
import { ToolMessage } from '@langchain/core/messages'
import { RunnableLambda } from '@langchain/core/runnables'
import { tool } from '@langchain/core/tools'
import { z } from 'zod/v3'
import {
    appendMessageContent,
    ChatMessageEventTypeEnum,
    ChatMessageTypeEnum,
    type CopilotChatMessage,
    IXpertAgent
} from '@xpert-ai/contracts'
import { Subscriber } from 'rxjs'
import { createMapStreamEvents } from './agent'
import { runtimeMessageContent } from '../ai/runtime-presentation'

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

    it('captures declared previews once for the owning tool, including failure and missing start metadata', () => {
        const next = jest.fn()
        const map = createMapStreamEvents(
            new Logger(),
            new Subscriber({ next, error: jest.fn(), complete: jest.fn() }),
            { unmutes: [] }
        )
        const publicToolPresentation = {
            tool: 'weather',
            input: () => ({ city: 'ZRH' }),
            output: () => false,
            error: () => 'station offline'
        }
        const start = (id: string, name: string) =>
            map({
                event: 'on_tool_start',
                name,
                tags: [],
                data: { id, input: { key: 'private' } },
                metadata: { publicToolPresentation },
                run_id: id
            })
        start('call', 'weather')
        expect(next.mock.lastCall[0].data.data.data.input).toEqual({ city: 'ZRH' })
        start('inner', 'nested')
        expect(next.mock.lastCall[0].data.data.data.input).toBeUndefined()
        map({
            event: 'on_tool_end',
            name: 'weather',
            tags: [],
            data: { id: 'call', output: 'private-output' },
            metadata: {},
            run_id: 'call'
        })
        expect(next.mock.lastCall[0].data.data.data.output).toBe(false)
        start('retry', 'weather')
        map({
            event: 'on_custom_event',
            name: ChatMessageEventTypeEnum.ON_TOOL_ERROR,
            tags: [],
            data: {
                toolCall: { id: 'retry', name: 'weather' },
                error: 'private-error'
            },
            metadata: {},
            run_id: 'retry'
        })
        expect(next.mock.lastCall[0].data.data.data.error).toBe('station offline')
        expect(JSON.stringify(next.mock.calls)).not.toMatch(/private|publicInput|publicOutput|publicError/)
    })

    it('sends the registered tool’s public fields directly from a LangChain invocation', async () => {
        const lookup = tool(async ({ token }) => `private result: ${token}`, {
            name: 'lookup',
            description: 'Look up a record',
            schema: z.object({ token: z.string(), page: z.number() }),
            metadata: {
                toolName: 'Lookup',
                toolIcon: { type: 'emoji', value: '🔎' },
                publicToolPresentation: {
                    tool: 'lookup',
                    input: ({ page }) => ({ page }),
                    output: () => ({ count: 1 })
                }
            }
        })
        let modelResult: unknown
        const runner = RunnableLambda.from(async (args: { token: string; page: number }, config) => {
            const message = await lookup.invoke({ type: 'tool_call', name: lookup.name, id: 'call', args }, config)
            modelResult = message.content
            return message
        })
        const next = jest.fn()
        const dispatch = createMapStreamEvents(
            new Logger(),
            new Subscriber({ next, error: jest.fn(), complete: jest.fn() }),
            { unmutes: [] }
        )
        for await (const event of runner.streamEvents(
            { token: 'private token', page: 2 },
            {
                version: 'v2',
                metadata: { tool_call_id: 'call' }
            }
        ))
            dispatch(event)
        expect(modelResult).toBe('private result: private token')
        const rows = next.mock.calls.map(([event]) => event.data.data)
        expect(rows).toMatchObject([
            {
                id: 'call',
                data: { tool: 'lookup', title: 'Lookup', icon: { type: 'emoji', value: '🔎' }, input: { page: 2 } }
            },
            { id: 'call', data: { tool: 'lookup', status: 'success', output: { count: 1 } } }
        ])
        expect(JSON.stringify(rows)).not.toContain('private')
    })

    it('publishes declared failure details without modifying the result used by the model', () => {
        const next = jest.fn()
        const map = createMapStreamEvents(
            new Logger(),
            new Subscriber({ next, error: jest.fn(), complete: jest.fn() }),
            { unmutes: [] }
        )
        const output = new ToolMessage({
            content: 'private result',
            status: 'error',
            tool_call_id: 'x',
            artifact: { token: 'private token' }
        })
        const policy = { tool: 'lookup', output: () => null, error: () => 'retry later' }
        map({
            event: 'on_tool_end',
            name: 'lookup',
            data: { output },
            tags: [],
            metadata: { publicToolPresentation: policy },
            run_id: 'run'
        })
        expect(next).toHaveBeenCalledTimes(1)
        expect(next.mock.lastCall[0].data.data.data).toMatchObject({
            status: 'fail',
            error: 'retry later',
            output: null
        })
        expect(JSON.stringify(next.mock.calls)).not.toContain('private')
        expect(output.content).toBe('private result')
        expect(output.artifact).toEqual({ token: 'private token' })
    })

    it('keeps widget payloads out of the saved tool row when both originate from the same call', () => {
        const history = { id: 'reply', role: 'ai', content: '' } as CopilotChatMessage
        const next = ({ data }) => appendMessageContent(history, data.data)
        const map = createMapStreamEvents(
            new Logger(),
            new Subscriber({ next, error: jest.fn(), complete: jest.fn() }),
            { unmutes: [] }
        )
        const call = { tags: [], run_id: 'run', metadata: { tool_call_id: 'call' } }
        map({ ...call, event: 'on_tool_start', name: 'inspect', data: { input: 'private arguments' } })
        map({
            ...call,
            event: 'on_custom_event',
            name: ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            data: {
                id: 'call',
                category: 'Dashboard',
                type: 'McpApp',
                toolPresentation: 'redacted',
                data: { token: 'private token' }
            }
        })
        map({ ...call, event: 'on_tool_end', name: 'inspect', data: { output: 'private result' } })
        const published = runtimeMessageContent(history.content)
        expect(published).toMatchObject([{ id: 'call', data: { tool: 'inspect', status: 'success' } }])
        expect(JSON.stringify(published)).not.toContain('private')
    })

    it('does not publish raw custom tool output or fall back when a declaration fails', () => {
        const next = jest.fn()
        const map = createMapStreamEvents(
            new Logger(),
            new Subscriber({ next, error: jest.fn(), complete: jest.fn() }),
            { unmutes: [] }
        )
        map({
            event: 'on_custom_event',
            name: ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            tags: [],
            data: {
                id: 'x',
                category: 'Tool',
                type: 'Program',
                tool: 'shell',
                status: 'running',
                data: { code: 'private-command' },
                input: 'private-input',
                output: 'private-output'
            },
            metadata: {
                publicToolPresentation: {
                    tool: 'shell',
                    input: () => {
                        throw Error('private error')
                    }
                }
            },
            run_id: 'run'
        })
        expect(next).toHaveBeenCalledTimes(1)
        expect(next.mock.lastCall[0].data.data.data).toMatchObject({ tool: 'shell', toolPresentation: 'redacted' })
        expect(JSON.stringify(next.mock.calls)).not.toContain('private')
    })

    it.each(['text', 'reasoning'])('suppresses internal %s events during streaming and completion', (contentType) => {
        const subscriber = { next: jest.fn() }
        const mapStreamEvent = createMapStreamEvents(
            logger as unknown as Logger,
            subscriber as unknown as Subscriber<MessageEvent>,
            {
                agent: { key: 'Agent_root' } as unknown as IXpertAgent,
                unmutes: []
            }
        )

        const message = {
            id: 'message-stream-1',
            content: contentType === 'text' ? '{"outcome":"passed"}' : '',
            tool_call_chunks: [],
            additional_kwargs: contentType === 'reasoning' ? { reasoning_content: 'Internal summary reasoning.' } : {}
        }
        for (const event of ['on_chat_model_start', 'on_chat_model_stream', 'on_chat_model_end']) {
            const chunk = mapStreamEvent({
                event,
                tags: [],
                data: { chunk: message, output: message },
                metadata: { internal: true },
                run_id: 'langgraph-run-1'
            })

            expect(chunk).toBeNull()
        }
        expect(subscriber.next).not.toHaveBeenCalled()
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

    it('adds execution metadata, resolves localized titles and hides changeSummary on tool start', () => {
        const subscriber = { next: jest.fn() }
        const mapStreamEvent = createMapStreamEvents(
            logger as unknown as Logger,
            subscriber as unknown as Subscriber<MessageEvent>,
            {
                agent: { key: 'Agent_root' } as unknown as IXpertAgent,
                unmutes: [],
                language: 'zh-Hans'
            }
        )

        mapStreamEvent({
            event: 'on_tool_start',
            name: 'read_file',
            tags: [],
            data: {
                id: 'tool-call-1',
                input: { path: 'README.md', changeSummary: '模型生成的冗长摘要' }
            },
            metadata: {
                agentKey: 'Agent_child',
                xpertName: 'Child Agent',
                executionId: 'child-execution',
                parentExecutionId: 'root-execution',
                publicToolPresentation: { tool: 'read_file', input: ({ path }) => ({ path }) },
                toolset: 'filesystem',
                toolsetId: 'toolset-1',
                toolName: {
                    en_US: 'Read governed file',
                    zh_Hans: '读取受控文件'
                },
                toolIcon: {
                    type: 'svg',
                    value: '<svg viewBox="0 0 24 24" data-icon="eye"></svg>'
                },
                middlewareIcon: {
                    type: 'emoji',
                    value: '🧰'
                }
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
                        executionId: 'child-execution',
                        parentExecutionId: 'root-execution',
                        runId: 'tool-run-1',
                        data: expect.objectContaining({
                            title: '读取受控文件',
                            icon: {
                                type: 'svg',
                                value: '<svg viewBox="0 0 24 24" data-icon="eye"></svg>'
                            },
                            input: { path: 'README.md' }
                        })
                    })
                })
            })
        )

        subscriber.next.mockClear()
        mapStreamEvent({
            event: 'on_tool_start',
            name: 'middleware_default_tool',
            tags: [],
            data: {
                id: 'tool-call-2',
                input: {}
            },
            metadata: {
                middlewareIcon: {
                    type: 'emoji',
                    value: '🧰'
                }
            },
            run_id: 'tool-run-2'
        })

        expect(subscriber.next).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    data: expect.objectContaining({
                        data: expect.objectContaining({
                            icon: {
                                type: 'emoji',
                                value: '🧰'
                            }
                        })
                    })
                })
            })
        )
    })

    it('hides changeSummary from custom tool messages before emitting them', () => {
        const subscriber = { next: jest.fn() }
        const mapStreamEvent = createMapStreamEvents(
            logger as unknown as Logger,
            subscriber as unknown as Subscriber<MessageEvent>,
            { agent: { key: 'Agent_root' } as unknown as IXpertAgent, unmutes: [] }
        )

        mapStreamEvent({
            event: 'on_custom_event',
            name: ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            tags: [],
            data: {
                id: 'custom-tool-call-1',
                tool: 'save_evidence',
                category: 'Tool',
                title: '保存需求证据',
                input: { caseId: 'case-1', changeSummary: '不要发给 ChatKit' }
            },
            metadata: { publicToolPresentation: { tool: 'save_evidence', input: ({ caseId }) => ({ caseId }) } },
            run_id: 'custom-tool-run-1'
        })

        expect(subscriber.next).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    data: expect.objectContaining({
                        data: expect.objectContaining({
                            title: '保存需求证据',
                            input: { caseId: 'case-1' }
                        })
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

        const publicRow = subscriber.next.mock.calls[0][0].data.data
        expect(publicRow).toMatchObject({
            id: 'tool-call-1',
            data: { tool: 'query_data_xpert', toolPresentation: 'redacted' }
        })
        expect(publicRow.data).not.toHaveProperty('output')
        expect(publicRow.data).not.toHaveProperty('artifact')
        expect(subscriber.next).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    type: ChatMessageTypeEnum.MESSAGE,
                    data: expect.objectContaining({
                        id: 'native:tool-call-1',
                        type: 'component',
                        data: expect.objectContaining({
                            tool: 'query_data_xpert',
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
