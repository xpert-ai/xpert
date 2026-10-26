import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { mcpInputSchema } from './mcp-input-schema'
import { installTaskToolDispatch, PublicationToolCall } from './mcp-task-tool-dispatch'

describe('mixed task and synchronous tools through the SDK HTTP dispatcher', () => {
    const inputSchema = mcpInputSchema({
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query']
    })
    const outputJsonSchema = { type: 'object', properties: { complete: { type: 'boolean' } }, required: ['complete'] }
    const invoke = jest.fn<ReturnType<PublicationToolCall['invoke']>, Parameters<PublicationToolCall['invoke']>>()
    const handler = createMcpHandler(() => {
        const server = new McpServer({ name: 'dispatch-test', version: '1' })
        const tools: PublicationToolCall[] = ['task', 'sync'].map((name) => ({
            name,
            taskMode: name === 'task' ? 'required' : undefined,
            inputSchema,
            outputSchema: mcpInputSchema(outputJsonSchema),
            outputJsonSchema,
            invoke
        }))
        for (const tool of tools)
            server.registerTool(tool.name, { inputSchema, outputSchema: tool.outputSchema }, invoke)
        installTaskToolDispatch(server, tools)
        return server
    })
    afterAll(() => handler.close())
    beforeEach(() => invoke.mockReset())
    async function call(name: string, args: unknown = { query: 'work' }) {
        const response = await handler.fetch(
            new Request('http://localhost/mcp', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    accept: 'application/json, text/event-stream',
                    'mcp-protocol-version': '2026-07-28',
                    'mcp-method': 'tools/call',
                    'mcp-name': name
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'tools/call',
                    params: {
                        name,
                        arguments: args,
                        _meta: {
                            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                            'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
                            'io.modelcontextprotocol/clientCapabilities': { elicitation: { form: {} } }
                        }
                    }
                })
            })
        )
        return response.json()
    }
    it('rejects invalid arguments before business invocation', async () => {
        expect((await call('task', {})).result.isError).toBe(true)
        expect(invoke).not.toHaveBeenCalled()
    })
    it('still validates synchronous outputs in a publication containing tasks', async () => {
        invoke.mockResolvedValue({ content: [], structuredContent: { unexpected: true } })
        expect((await call('sync')).result.isError).toBe(true)
        invoke.mockResolvedValue({ content: [], structuredContent: { complete: true } })
        expect((await call('sync')).result.structuredContent).toEqual({ complete: true })
    })
    it('does not validate an input interrupt as a final business output', async () => {
        invoke.mockResolvedValue({
            resultType: 'input_required',
            inputRequests: {
                input: {
                    method: 'elicitation/create',
                    params: { message: 'Confirm', requestedSchema: { type: 'object', properties: {} } }
                }
            }
        })
        expect((await call('sync')).result.resultType).toBe('input_required')
    })
})
