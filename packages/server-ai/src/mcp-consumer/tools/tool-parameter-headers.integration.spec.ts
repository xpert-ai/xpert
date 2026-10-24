import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import { LangChainMcpConnection } from '../connection/langchain-mcp-connection'
import { McpConsumerTools } from './mcp-consumer-tools'

describe('modern MCP tools with schema-annotated HTTP parameters', () => {
    const originalFetch = global.fetch
    afterEach(() => {
        global.fetch = originalFetch
        jest.restoreAllMocks()
    })

    it('discovers schemas on direct calls and sends fresh headers for repository reads', async () => {
        const calls: { method: string; headers: Headers; args?: object }[] = []
        global.fetch = jest.fn(async (_url, init) => {
            const body = JSON.parse(String(init?.body))
            const headers = new Headers(init?.headers)
            calls.push({ method: body.method, headers, args: body.params.arguments })
            const result =
                body.method === 'server/discover'
                    ? { supportedVersions: ['2026-07-28'], capabilities: {} }
                    : body.method === 'tools/list'
                      ? {
                            tools: [
                                {
                                    name: 'get_file_contents',
                                    inputSchema: {
                                        type: 'object',
                                        properties: {
                                            owner: { type: 'string', 'x-mcp-header': 'owner' },
                                            repo: { type: 'string', 'x-mcp-header': 'repo' },
                                            path: { type: 'string' }
                                        }
                                    }
                                },
                                {
                                    name: 'invalid',
                                    inputSchema: {
                                        type: 'object',
                                        properties: {
                                            owner: { type: 'number', 'x-mcp-header': 'owner' }
                                        }
                                    }
                                }
                            ]
                        }
                      : { content: [{ type: 'text', text: '# Xpert' }] }
            // Model the remote server's HeaderMismatch rejection.
            const mismatch =
                body.method === 'tools/call' &&
                ['owner', 'repo'].some(
                    (name) => headers.get(`Mcp-Param-${name}`) !== (body.params.arguments[name] ?? null)
                )
            return new Response(
                JSON.stringify(
                    mismatch
                        ? { jsonrpc: '2.0', id: body.id, error: { code: -32020, message: 'Header mismatch' } }
                        : { jsonrpc: '2.0', id: body.id, result }
                ),
                {
                    status: mismatch ? 400 : 200,
                    headers: { 'content-type': 'application/json' }
                }
            )
        })
        const connection = new LangChainMcpConnection(
            new MultiServerMCPClient({
                mcpServers: {
                    github: {
                        transport: 'http',
                        url: 'https://mcp.example.test',
                        headers: { Authorization: 'Bearer test', 'Mcp-Param-owner': 'stale' }
                    }
                }
            })
        )
        await connection.describeServer('github')
        const tools = new McpConsumerTools(connection)
        await expect(
            tools.call('get_file_contents', { owner: 'xpert-ai', repo: 'xpert', path: 'README.md' }, 'github')
        ).resolves.toMatchObject({ content: [{ text: '# Xpert' }] })
        await tools.call('get_file_contents', { owner: 'other', repo: null, path: 'README.md' }, 'github')
        const toolCalls = calls.filter((call) => call.method === 'tools/call')
        expect(toolCalls[0].headers.get('Mcp-Param-owner')).toBe('xpert-ai')
        expect(toolCalls[0].headers.get('Mcp-Param-repo')).toBe('xpert')
        expect(toolCalls[0].headers.get('Mcp-Param-path')).toBeNull()
        expect(toolCalls[0].headers.get('Authorization')).toBe('Bearer test')
        expect(toolCalls[1].headers.get('Mcp-Param-owner')).toBe('other')
        expect(toolCalls[1].headers.get('Mcp-Param-repo')).toBeNull()
        expect(calls.filter((call) => call.method === 'tools/list')).toHaveLength(1)
        await expect(tools.call('invalid', {}, 'github')).rejects.toThrow('invalid parameter header')
        expect(calls.filter((call) => call.method === 'tools/call')).toHaveLength(2)
    })
})
