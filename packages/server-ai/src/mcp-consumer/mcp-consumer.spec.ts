import type { DynamicStructuredTool } from '@langchain/core/tools'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { MCP_APP_RESOURCE_MIME_TYPE } from '@xpert-ai/contracts'
import { z } from 'zod'
import {
    McpConsumerConnection,
    McpConsumerExtensionRequest,
    McpConsumerNotification,
    McpConsumerRoutingHeaders
} from './connection/mcp-consumer-connection'
import { McpConsumer } from './mcp-consumer'

class FakeConnection implements McpConsumerConnection {
    readonly extensionCalls: Array<{
        serverName?: string
        request: McpConsumerExtensionRequest
        routing?: McpConsumerRoutingHeaders
    }> = []
    taskGetResponses: object[] = []
    extensionResponses: object[] = []

    constructor(
        readonly sdkClient: FakeSdkClient,
        private readonly names = ['generic'],
        private readonly modernHttp = false
    ) {}

    serverNames() {
        return [...this.names]
    }

    resolveServerName(serverName?: string) {
        if (serverName) return serverName
        if (this.names.length !== 1) throw new Error('server name required')
        return this.names[0]
    }

    usesModernHttp() {
        return this.modernHttp
    }

    formatToolName(serverName: string, toolName: string) {
        return `${serverName}__${toolName}`
    }

    async describeServer() {
        return {
            supportedVersions: this.modernHttp ? ['2026-07-28'] : [],
            capabilities: {},
            serverInfo: { name: 'generic', version: '1.0.0' }
        }
    }

    async getClient() {
        return this.sdkClient as unknown as Client
    }

    async getLangChainTools() {
        return [{ name: 'generic_echo' }] as unknown as DynamicStructuredTool[]
    }

    async requestExtension<TSchema extends z.ZodType<object>>(
        serverName: string | undefined,
        request: McpConsumerExtensionRequest,
        resultSchema: TSchema,
        options?: { routing?: McpConsumerRoutingHeaders }
    ): Promise<z.infer<TSchema>> {
        this.extensionCalls.push({ serverName, request, routing: options?.routing })
        const extensionResponse = this.extensionResponses.shift()
        if (extensionResponse) return resultSchema.parse(extensionResponse)
        const taskId = request.method === 'tools/call' ? 'task-1' : readTaskId(request.params)
        const queuedResponse = request.method === 'tasks/get' ? this.taskGetResponses.shift() : undefined
        return resultSchema.parse(
            queuedResponse ??
                (request.method === 'tools/call'
                    ? {
                          resultType: 'task',
                          taskId,
                          status: 'working',
                          createdAt: new Date().toISOString(),
                          lastUpdatedAt: new Date().toISOString(),
                          ttlMs: 60_000,
                          pollIntervalMs: 1,
                          content: []
                      }
                    : request.method === 'tasks/update' || request.method === 'tasks/cancel'
                      ? { resultType: 'complete' }
                      : {
                            resultType: 'complete',
                            taskId,
                            status: request.method === 'tasks/cancel' ? 'cancelled' : 'completed',
                            createdAt: '2026-08-20T00:00:00.000Z',
                            lastUpdatedAt: '2026-08-20T00:00:01.000Z',
                            ttlMs: 59_000,
                            result: { ok: true }
                        })
        )
    }

    async listenExtension(): Promise<AsyncIterable<McpConsumerNotification>> {
        return (async function* () {
            yield { method: 'notifications/tasks', params: { taskId: 'task-1', status: 'working' } }
        })()
    }
}

type FakeSdkClient = {
    fallbackRequestHandler?: (request: unknown) => Promise<object>
    listTools: jest.Mock
    callTool: jest.Mock
    listResources: jest.Mock
    listResourceTemplates: jest.Mock
    readResource: jest.Mock
    subscribeResource: jest.Mock
    unsubscribeResource: jest.Mock
    listPrompts: jest.Mock
    getPrompt: jest.Mock
    complete: jest.Mock
}

function createSdkClient(): FakeSdkClient {
    return {
        listTools: jest.fn().mockResolvedValue({
            tools: [
                {
                    name: 'generic_echo',
                    title: 'Generic Echo',
                    inputSchema: { type: 'object' },
                    _meta: { ui: { resourceUri: 'ui://generic/echo' } }
                }
            ]
        }),
        callTool: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
        listResources: jest.fn().mockResolvedValue({ resources: [{ uri: 'data://generic/readme', name: 'Readme' }] }),
        listResourceTemplates: jest.fn().mockResolvedValue({ resourceTemplates: [] }),
        readResource: jest.fn().mockResolvedValue({
            contents: [
                {
                    uri: 'ui://generic/echo',
                    mimeType: MCP_APP_RESOURCE_MIME_TYPE,
                    text: '<html></html>'
                }
            ]
        }),
        subscribeResource: jest.fn().mockResolvedValue({}),
        unsubscribeResource: jest.fn().mockResolvedValue({}),
        listPrompts: jest.fn().mockResolvedValue({ prompts: [{ name: 'generic_prompt' }] }),
        getPrompt: jest.fn().mockResolvedValue({ messages: [{ role: 'user', content: { type: 'text', text: 'go' } }] }),
        complete: jest.fn().mockResolvedValue({ completion: { values: ['alpha'] } })
    }
}

describe('McpConsumer', () => {
    it('exposes all standard capabilities independently of LangChain and Cut', async () => {
        const connection = new FakeConnection(createSdkClient())
        const consumer = new McpConsumer(connection)

        await expect(consumer.tools.asLangChain()).resolves.toEqual([{ name: 'generic_echo' }])
        await expect(consumer.tools.list()).resolves.toEqual(
            expect.arrayContaining([expect.objectContaining({ name: 'generic_echo' })])
        )
        await expect(consumer.resources.list()).resolves.toEqual([
            expect.objectContaining({ uri: 'data://generic/readme' })
        ])
        await expect(consumer.prompts.list()).resolves.toEqual([expect.objectContaining({ name: 'generic_prompt' })])
        await expect(
            consumer.completion.complete({ type: 'prompt', name: 'generic_prompt' }, { name: 'topic', value: 'a' })
        ).resolves.toEqual({ completion: { values: ['alpha'] } })

        const apps = await consumer.apps.list()
        expect(apps).toEqual([
            {
                serverName: 'generic',
                toolName: 'generic_echo',
                title: 'Generic Echo',
                resourceUri: 'ui://generic/echo'
            }
        ])
        await expect(consumer.apps.read(apps[0])).resolves.toEqual(
            expect.objectContaining({ contents: expect.any(Array) })
        )
    })

    it('uses the task extension and required HTTP routing metadata', async () => {
        const connection = new FakeConnection(createSdkClient())
        const consumer = new McpConsumer(connection)

        const started = await consumer.tasks.start('generic_echo', { text: 'hello' })
        await consumer.tasks.update(started.taskId, { 'input-1': { action: 'accept', content: { ok: true } } })
        await consumer.tasks.cancel(started.taskId)

        expect(connection.extensionCalls.map(({ request, routing }) => ({ method: request.method, routing }))).toEqual([
            { method: 'tools/call', routing: { method: 'tools/call', name: 'generic_echo' } },
            { method: 'tasks/update', routing: { method: 'tasks/update', name: 'task-1' } },
            { method: 'tasks/get', routing: { method: 'tasks/get', name: 'task-1' } },
            { method: 'tasks/cancel', routing: { method: 'tasks/cancel', name: 'task-1' } },
            { method: 'tasks/get', routing: { method: 'tasks/get', name: 'task-1' } }
        ])
        expect(connection.extensionCalls[0].request.params).toEqual(
            expect.objectContaining({
                _meta: {
                    'io.modelcontextprotocol/clientCapabilities': {
                        extensions: { 'io.modelcontextprotocol/tasks': {} }
                    }
                }
            })
        )
    })

    it('waits for tasks, resumes input requests, and returns the completed result', async () => {
        const connection = new FakeConnection(createSdkClient())
        connection.taskGetResponses.push({
            resultType: 'complete',
            taskId: 'task-1',
            status: 'input_required',
            createdAt: '2026-08-20T00:00:00.000Z',
            lastUpdatedAt: '2026-08-20T00:00:01.000Z',
            ttlMs: null,
            pollIntervalMs: 1,
            inputRequests: { approval: { message: 'Continue?' } }
        })
        const consumer = new McpConsumer(connection)
        const statuses: string[] = []
        const started = await consumer.tasks.start('generic_echo', { text: 'hello' })
        const completed = await consumer.tasks.wait(started, {
            maxWaitMs: 1_000,
            defaultPollIntervalMs: 1,
            onStatus: (task) => {
                statuses.push(task.status)
            },
            onInputRequired: async () => ({ approval: { action: 'accept', content: { ok: true } } })
        })

        expect(completed).toEqual(expect.objectContaining({ status: 'completed', result: { ok: true } }))
        expect(consumer.tasks.result(completed)).toEqual({ ok: true })
        expect(statuses).toEqual(['working', 'input_required', 'completed'])
        expect(connection.extensionCalls.map(({ request }) => request.method)).toEqual([
            'tools/call',
            'tasks/get',
            'tasks/update',
            'tasks/get'
        ])
    })

    it('routes form and URL elicitation through a host handler and restores the prior handler', async () => {
        const sdkClient = createSdkClient()
        const previous = jest.fn().mockResolvedValue({ legacy: true })
        sdkClient.fallbackRequestHandler = previous
        const consumer = new McpConsumer(new FakeConnection(sdkClient))
        const handler = jest.fn().mockResolvedValue({ action: 'accept', content: { approved: true } })
        const uninstall = await consumer.elicitation.install(handler)

        await expect(
            sdkClient.fallbackRequestHandler?.({
                method: 'elicitation/create',
                params: {
                    mode: 'form',
                    message: 'Approve?',
                    requestedSchema: { type: 'object', properties: { approved: { type: 'boolean' } } }
                }
            })
        ).resolves.toEqual({ action: 'accept', content: { approved: true } })
        expect(handler).toHaveBeenCalledWith(expect.objectContaining({ message: 'Approve?' }))

        uninstall()
        await sdkClient.fallbackRequestHandler?.({ method: 'legacy/request' })
        expect(previous).toHaveBeenCalled()
    })

    it('uses modern HTTP for standard tools and completes an in-band elicitation round', async () => {
        const connection = new FakeConnection(createSdkClient(), ['generic'], true)
        connection.extensionResponses.push(
            { resultType: 'complete', tools: [{ name: 'modern_search', inputSchema: { type: 'object' } }] },
            {
                resultType: 'input_required',
                inputRequests: {
                    confirmation: {
                        method: 'elicitation/create',
                        params: {
                            message: 'Continue?',
                            requestedSchema: {
                                type: 'object',
                                properties: { approved: { type: 'boolean' } },
                                required: ['approved']
                            }
                        }
                    }
                },
                requestState: 'signed-state'
            },
            {
                resultType: 'complete',
                content: [{ type: 'text', text: 'completed' }],
                structuredContent: { approved: true }
            }
        )
        const consumer = new McpConsumer(connection)
        const uninstall = await consumer.elicitation.install(async () => ({
            action: 'accept',
            content: { approved: true }
        }))

        await expect(consumer.tools.list()).resolves.toEqual([expect.objectContaining({ name: 'modern_search' })])
        await expect(consumer.tools.call('modern_search', { query: 'MCP' })).resolves.toEqual(
            expect.objectContaining({
                content: [{ type: 'text', text: 'completed' }],
                structuredContent: { approved: true }
            })
        )
        expect(connection.extensionCalls.map(({ request }) => request.method)).toEqual([
            'tools/list',
            'tools/call',
            'tools/call'
        ])
        expect(connection.extensionCalls[2].request.params).toEqual(
            expect.objectContaining({
                requestState: 'signed-state',
                inputResponses: {
                    confirmation: { action: 'accept', content: { approved: true } }
                }
            })
        )
        uninstall()
    })

    it('adapts modern HTTP tools to LangChain without initializing the legacy client', async () => {
        const connection = new FakeConnection(createSdkClient(), ['generic'], true)
        connection.extensionResponses.push(
            {
                resultType: 'complete',
                tools: [
                    {
                        name: 'modern_search',
                        description: 'Search modern data',
                        inputSchema: {
                            type: 'object',
                            properties: { query: { type: 'string' } },
                            required: ['query']
                        },
                        _meta: {
                            ui: {
                                resourceUri: 'ui://modern/search',
                                visibility: ['model', 'app']
                            }
                        }
                    }
                ]
            },
            {
                resultType: 'complete',
                content: [
                    { type: 'text', text: 'found' },
                    {
                        type: 'resource_link',
                        uri: 'data://modern/result/1',
                        name: 'Result 1',
                        mimeType: 'application/json'
                    }
                ],
                structuredContent: { count: 1 },
                _meta: { trace: 'trace-1' }
            }
        )
        const consumer = new McpConsumer(connection)

        const tools = await consumer.tools.asLangChain()
        expect(tools).toHaveLength(1)
        expect(tools[0]).toEqual(
            expect.objectContaining({
                name: 'generic__modern_search',
                description: 'Search modern data',
                metadata: expect.objectContaining({
                    mcpApp: expect.objectContaining({
                        serverName: 'generic',
                        name: 'modern_search',
                        displayName: 'generic__modern_search',
                        visibility: ['model', 'app'],
                        ui: expect.objectContaining({ resourceUri: 'ui://modern/search' })
                    })
                })
            })
        )
        await expect(tools[0].func({ query: 'MCP' })).resolves.toEqual([
            'found',
            [
                {
                    type: 'resource_link',
                    uri: 'data://modern/result/1',
                    name: 'Result 1',
                    mimeType: 'application/json'
                },
                { structuredContent: { count: 1 }, _meta: { trace: 'trace-1' } }
            ]
        ])
        expect(connection.extensionCalls.map(({ request }) => request.method)).toEqual(['tools/list', 'tools/call'])
    })

    it('routes modern LangChain tool elicitation through the execution host input API', async () => {
        const connection = new FakeConnection(createSdkClient(), ['generic'], true)
        connection.extensionResponses.push(
            { resultType: 'complete', tools: [{ name: 'modern_form', inputSchema: { type: 'object' } }] },
            {
                resultType: 'input_required',
                inputRequests: {
                    details: {
                        method: 'elicitation/create',
                        params: {
                            mode: 'form',
                            message: 'Provide details',
                            requestedSchema: {
                                type: 'object',
                                properties: { topic: { type: 'string' } },
                                required: ['topic']
                            }
                        }
                    }
                },
                requestState: 'state-1'
            },
            { resultType: 'complete', content: [{ type: 'text', text: 'accepted' }] }
        )
        const requestInput = jest.fn().mockResolvedValue({ topic: 'MCP' })
        const [tool] = await new McpConsumer(connection).tools.asLangChain()

        await expect(
            tool.func({}, undefined, {
                configurable: {
                    toolExecutionContext: { host: { input: { request: requestInput } } }
                }
            })
        ).resolves.toEqual(['accepted', []])
        expect(requestInput).toHaveBeenCalledWith({
            type: 'form',
            title: 'Provide details',
            schema: expect.objectContaining({ type: 'object' })
        })
        expect(connection.extensionCalls[2].request.params).toEqual(
            expect.objectContaining({
                requestState: 'state-1',
                inputResponses: {
                    details: { action: 'accept', content: { topic: 'MCP' } }
                }
            })
        )
    })

    it('runs task-required modern LangChain tools through the task lifecycle', async () => {
        const connection = new FakeConnection(createSdkClient(), ['generic'], true)
        connection.extensionResponses.push({
            resultType: 'complete',
            tools: [
                {
                    name: 'long_report',
                    inputSchema: { type: 'object' },
                    execution: { taskSupport: 'required' }
                }
            ]
        })
        connection.taskGetResponses.push({
            resultType: 'complete',
            taskId: 'task-1',
            status: 'completed',
            createdAt: '2026-08-20T00:00:00.000Z',
            lastUpdatedAt: '2026-08-20T00:00:01.000Z',
            ttlMs: 59_000,
            result: {
                resultType: 'complete',
                content: [{ type: 'text', text: 'report ready' }],
                structuredContent: { reportId: 'report-1' }
            }
        })
        const [tool] = await new McpConsumer(connection).tools.asLangChain()

        await expect(tool.func({})).resolves.toEqual([
            'report ready',
            [{ structuredContent: { reportId: 'report-1' } }]
        ])
        expect(connection.extensionCalls.map(({ request }) => request.method)).toEqual([
            'tools/list',
            'tools/call',
            'tasks/get'
        ])
        expect(connection.extensionCalls[1].request.params).toEqual(
            expect.objectContaining({
                _meta: {
                    'io.modelcontextprotocol/clientCapabilities': {
                        extensions: { 'io.modelcontextprotocol/tasks': {} }
                    }
                }
            })
        )
    })

    it('routes modern HTTP resources, prompts, and completion without the legacy client adapter', async () => {
        const connection = new FakeConnection(createSdkClient(), ['generic'], true)
        connection.extensionResponses.push(
            { resultType: 'complete', resources: [{ uri: 'data://modern/status', name: 'Status' }] },
            {
                resultType: 'complete',
                resourceTemplates: [{ uriTemplate: 'data://modern/{id}', name: 'Record' }]
            },
            {
                resultType: 'complete',
                contents: [{ uri: 'data://modern/status', mimeType: 'application/json', text: '{"ok":true}' }]
            },
            { resultType: 'complete', prompts: [{ name: 'modern_prompt' }] },
            {
                resultType: 'complete',
                messages: [{ role: 'user', content: { type: 'text', text: 'summarize' } }]
            },
            { resultType: 'complete', completion: { values: ['alpha'], hasMore: false } }
        )
        const consumer = new McpConsumer(connection)

        await expect(consumer.resources.list()).resolves.toEqual([
            expect.objectContaining({ uri: 'data://modern/status' })
        ])
        await expect(consumer.resources.listTemplates()).resolves.toEqual([
            expect.objectContaining({ uriTemplate: 'data://modern/{id}' })
        ])
        await expect(consumer.resources.read('data://modern/status')).resolves.toEqual(
            expect.objectContaining({ contents: expect.any(Array) })
        )
        await expect(consumer.prompts.list()).resolves.toEqual([expect.objectContaining({ name: 'modern_prompt' })])
        await expect(consumer.prompts.get('modern_prompt')).resolves.toEqual(
            expect.objectContaining({ messages: expect.any(Array) })
        )
        await expect(
            consumer.completion.complete({ type: 'prompt', name: 'modern_prompt' }, { name: 'topic', value: 'a' })
        ).resolves.toEqual({ resultType: 'complete', completion: { values: ['alpha'], hasMore: false } })
        expect(connection.extensionCalls.map(({ request }) => request.method)).toEqual([
            'resources/list',
            'resources/templates/list',
            'resources/read',
            'prompts/list',
            'prompts/get',
            'completion/complete'
        ])
    })
})

function readTaskId(params?: object) {
    if (!params) return 'task-1'
    const taskId = Reflect.get(params, 'taskId')
    return typeof taskId === 'string' ? taskId : 'task-1'
}
