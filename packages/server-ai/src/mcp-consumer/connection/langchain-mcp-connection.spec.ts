import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { applicationTracing } from '../../tracing/application-tracing'
import { LangChainMcpConnection } from './langchain-mcp-connection'
import { mcpTaskResultSchema } from '../tasks/task-schemas'

describe('LangChainMcpConnection', () => {
    const originalFetch = global.fetch

    afterEach(() => {
        global.fetch = originalFetch
        jest.restoreAllMocks()
    })

    it('sends modern task routing, API key, protocol and per-request envelope over Streamable HTTP', async () => {
        jest.spyOn(applicationTracing, 'injectContext').mockReturnValue({
            traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
            baggage: 'workspace.id=workspace-1'
        })
        const fetchMock = jest.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'response-1',
                    result: {
                        resultType: 'complete',
                        taskId: 'task-1',
                        status: 'completed',
                        createdAt: '2026-08-20T00:00:00.000Z',
                        lastUpdatedAt: '2026-08-20T00:00:01.000Z',
                        ttlMs: 59_000,
                        result: { ok: true }
                    }
                }),
                { status: 200, headers: { 'content-type': 'application/json' } }
            )
        )
        global.fetch = fetchMock
        const connection = new LangChainMcpConnection(createAdapter())

        await connection.requestExtension(
            'generic',
            { method: 'tasks/get', params: { taskId: 'task-1' } },
            mcpTaskResultSchema,
            { routing: { method: 'tasks/get', name: 'task-1' } }
        )

        const [, init] = fetchMock.mock.calls[0]
        const headers = new Headers(init.headers)
        expect(headers.get('Authorization')).toBe('Bearer generic-key')
        expect(headers.get('MCP-Protocol-Version')).toBe('2026-07-28')
        expect(headers.get('Mcp-Method')).toBe('tasks/get')
        expect(headers.get('Mcp-Name')).toBe('task-1')
        expect(headers.get('Mcp-Session-Id')).toBeNull()
        const envelope = JSON.parse(String(init.body))
        expect(headers.get('X-Request-Id')).toBe(envelope.id)
        expect(envelope).toEqual(
            expect.objectContaining({
                method: 'tasks/get',
                params: expect.objectContaining({
                    taskId: 'task-1',
                    _meta: {
                        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
                        baggage: 'workspace.id=workspace-1',
                        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                        'io.modelcontextprotocol/clientInfo': {
                            name: 'xpert-mcp-consumer',
                            version: '1.0.0'
                        },
                        'io.modelcontextprotocol/clientCapabilities': {
                            elicitation: { form: {}, url: {} },
                            extensions: {
                                'io.modelcontextprotocol/ui': {
                                    mimeTypes: ['text/html;profile=mcp-app']
                                }
                            }
                        }
                    }
                })
            })
        )
    })

    it('uses a runtime OAuth provider without serializing its circular service graph', async () => {
        const serviceGraph: { manager?: object } = {}
        serviceGraph.manager = serviceGraph
        const provider = {
            serviceGraph,
            redirectUrl: 'http://localhost/oauth/callback',
            clientMetadata: {
                redirect_uris: ['http://localhost/oauth/callback']
            },
            state: jest.fn(() => 'state'),
            clientInformation: jest.fn(),
            saveClientInformation: jest.fn(),
            tokens: jest.fn().mockResolvedValue({ access_token: 'oauth-token', token_type: 'Bearer' }),
            saveTokens: jest.fn(),
            redirectToAuthorization: jest.fn(),
            saveCodeVerifier: jest.fn(),
            codeVerifier: jest.fn()
        } satisfies OAuthClientProvider & { serviceGraph: typeof serviceGraph }
        const adapter = new MultiServerMCPClient({
            mcpServers: {
                generic: {
                    transport: 'http',
                    url: 'https://mcp.example.test/rpc',
                    authProvider: provider
                }
            }
        })
        expect(() => adapter.config).toThrow('Converting circular structure to JSON')
        global.fetch = jest.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'response-1',
                    result: {
                        resultType: 'complete',
                        taskId: 'task-1',
                        status: 'completed',
                        createdAt: '2026-08-20T00:00:00.000Z',
                        lastUpdatedAt: '2026-08-20T00:00:01.000Z',
                        ttlMs: 59_000,
                        result: { ok: true }
                    }
                }),
                { status: 200, headers: { 'content-type': 'application/json' } }
            )
        )
        const connection = new LangChainMcpConnection(adapter)

        await connection.requestExtension(
            'generic',
            { method: 'tasks/get', params: { taskId: 'task-1' } },
            mcpTaskResultSchema,
            { routing: { method: 'tasks/get', name: 'task-1' } }
        )

        const [, init] = jest.mocked(global.fetch).mock.calls[0]
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer oauth-token')
    })

    it('parses subscription notifications from an SSE response', async () => {
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(
                    new TextEncoder().encode(
                        'data: {"jsonrpc":"2.0","method":"notifications/tasks","params":{"taskId":"task-1"}}\n\n'
                    )
                )
                controller.close()
            }
        })
        global.fetch = jest
            .fn()
            .mockResolvedValue(new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }))
        const connection = new LangChainMcpConnection(createAdapter())
        const signal = new AbortController().signal
        const notifications = await connection.listenExtension(
            'generic',
            { method: 'subscriptions/listen', params: { notifications: { taskIds: ['task-1'] } } },
            { routing: { method: 'subscriptions/listen' }, signal }
        )

        const received = []
        for await (const notification of notifications) received.push(notification)
        expect(received).toEqual([{ method: 'notifications/tasks', params: { taskId: 'task-1' } }])
    })

    it('rejects an oversized subscription event without limiting the lifetime of the stream', async () => {
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(
                    new TextEncoder().encode(
                        `data: ${JSON.stringify({
                            jsonrpc: '2.0',
                            method: 'notifications/tasks',
                            params: { taskId: 'task-1', statusMessage: 'x'.repeat(4 * 1024 * 1024) }
                        })}\n\n`
                    )
                )
                controller.close()
            }
        })
        global.fetch = jest
            .fn()
            .mockResolvedValue(new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }))
        const connection = new LangChainMcpConnection(createAdapter())
        const notifications = await connection.listenExtension(
            'generic',
            { method: 'subscriptions/listen', params: { notifications: { taskIds: ['task-1'] } } },
            { routing: { method: 'subscriptions/listen' }, signal: new AbortController().signal }
        )

        await expect(
            (async () => {
                for await (const _notification of notifications) {
                    // The stream must fail before yielding the oversized event.
                }
            })()
        ).rejects.toThrow('MCP subscription event exceeds the maximum allowed size')
    })

    it('accepts a regular modern request result delivered over an event stream', async () => {
        global.fetch = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            const request = JSON.parse(String(init?.body))
            const stream = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(
                        new TextEncoder().encode(
                            `data: ${JSON.stringify({
                                jsonrpc: '2.0',
                                id: request.id,
                                result: {
                                    resultType: 'complete',
                                    taskId: 'task-1',
                                    status: 'completed',
                                    createdAt: '2026-08-20T00:00:00.000Z',
                                    lastUpdatedAt: '2026-08-20T00:00:01.000Z',
                                    ttlMs: 59_000,
                                    result: { ok: true }
                                }
                            })}\n\n`
                        )
                    )
                    controller.close()
                }
            })
            return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
        })
        const connection = new LangChainMcpConnection(createAdapter())

        await expect(
            connection.requestExtension(
                'generic',
                { method: 'tasks/get', params: { taskId: 'task-1' } },
                mcpTaskResultSchema,
                { routing: { method: 'tasks/get', name: 'task-1' } }
            )
        ).resolves.toEqual(expect.objectContaining({ taskId: 'task-1', status: 'completed' }))
    })

    it('discovers a modern HTTP server without initializing the legacy SDK client', async () => {
        global.fetch = jest.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'response-1',
                    result: {
                        resultType: 'complete',
                        supportedVersions: ['2026-07-28'],
                        capabilities: { tools: { listChanged: true } },
                        instructions: 'Use generic tools',
                        _meta: {
                            'io.modelcontextprotocol/serverInfo': { name: 'generic-server', version: '2.0.0' }
                        }
                    }
                }),
                { status: 200, headers: { 'content-type': 'application/json' } }
            )
        )
        const adapter = createAdapter()
        adapter.getClient = jest.fn().mockRejectedValue(new Error('legacy initialize is unsupported'))
        const connection = new LangChainMcpConnection(adapter)

        await expect(connection.describeServer('generic')).resolves.toEqual({
            supportedVersions: ['2026-07-28'],
            capabilities: { tools: { listChanged: true } },
            instructions: 'Use generic tools',
            serverInfo: { name: 'generic-server', version: '2.0.0' }
        })
        expect(adapter.getClient).not.toHaveBeenCalled()
    })

    it('falls back to the legacy SDK only when server discovery is unsupported', async () => {
        global.fetch = jest.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'response-1',
                    error: { code: -32601, message: 'Method not found' }
                }),
                { status: 200, headers: { 'content-type': 'application/json' } }
            )
        )
        const adapter = createAdapter()
        const connection = new LangChainMcpConnection(adapter)

        await connection.negotiateHttpProtocols()

        expect(connection.usesModernHttp('generic')).toBe(false)
        await expect(connection.getLangChainTools(['generic'])).resolves.toEqual([])
        expect(adapter.getTools).toHaveBeenCalledWith('generic')
    })

    it('does not hide authentication failures as legacy protocol fallback', async () => {
        global.fetch = jest.fn().mockResolvedValue(
            new Response('', {
                status: 401,
                headers: { 'www-authenticate': 'Bearer resource_metadata="https://mcp.example.test/.well-known"' }
            })
        )
        const connection = new LangChainMcpConnection(createAdapter())

        await expect(connection.negotiateHttpProtocols()).rejects.toMatchObject({ status: 401 })
    })
})

function createAdapter() {
    const sdkClient = { transport: { sessionId: 'session-1' } } as unknown as Client
    return {
        config: {
            mcpServers: {
                generic: {
                    transport: 'http',
                    url: 'https://mcp.example.test/rpc',
                    headers: { Authorization: 'Bearer generic-key' }
                }
            }
        },
        getClient: jest.fn().mockResolvedValue(sdkClient),
        getTools: jest.fn().mockResolvedValue([])
    } as unknown as MultiServerMCPClient
}
