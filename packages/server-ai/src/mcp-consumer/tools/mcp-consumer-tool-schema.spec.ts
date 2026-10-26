import { loadMcpTools } from '@langchain/mcp-adapters'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListToolsResultSchema,
    McpError
} from '@modelcontextprotocol/sdk/types.js'
import { installMcpToolSchemaBridge, mcpConsumerListToolsResultSchema } from './mcp-consumer-tool-schema'
import { MCP_EXECUTION_CONTROL_EXTENSION_ID } from '@xpert-ai/contracts'

const nullableAccount = {
    type: ['object', 'null'],
    properties: { login: { type: 'string' } },
    required: ['login']
}
const tool = {
    name: 'get_me',
    description: 'Read the current account',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: nullableAccount,
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri: 'ui://github/account' } }
}

describe('MCP tool output schema compatibility', () => {
    it.each([undefined, { taskSupport: 'optional' }])(
        'retains required tasks for legacy metadata consumers: %j',
        (execution) => {
            const declaration = {
                ...tool,
                execution,
                _meta: { ...tool._meta, [MCP_EXECUTION_CONTROL_EXTENSION_ID]: { version: 1, taskSupport: 'required' } }
            }
            const parsed = mcpConsumerListToolsResultSchema.parse({ tools: [declaration] }).tools[0]
            expect(parsed.execution).toEqual({ taskSupport: 'required' })
            expect(parsed._meta).toEqual(declaration._meta)
            expect(parsed.outputSchema).toEqual(nullableAccount)
        }
    )
    it.each([
        nullableAccount,
        { type: ['null', 'object'], properties: { login: { type: 'string' } } },
        { type: ['null', 'array'], items: { type: 'string' } },
        { type: 'array', items: { type: 'string' } },
        { type: 'string' },
        { anyOf: [{ type: 'object' }, { type: 'null' }] },
        { $ref: '#/$defs/account', $defs: { account: nullableAccount } },
        { type: 'object', properties: { login: { type: 'string' } } }
    ])('preserves a valid output schema and tool metadata: %j', (outputSchema) => {
        const result = { tools: [{ ...tool, outputSchema }], nextCursor: 'page-2', _meta: { revision: 2 } }
        expect(mcpConsumerListToolsResultSchema.parse(result)).toEqual(result)
    })

    it.each([
        { ...tool, inputSchema: { type: 'array' } },
        { ...tool, inputSchema: null },
        { ...tool, name: 42 },
        { ...tool, annotations: { readOnlyHint: 'true' } },
        { ...tool, outputSchema: null },
        { ...tool, outputSchema: { type: 'not-a-json-schema-type' } },
        { ...tool, outputSchema: { type: [] } },
        { ...tool, outputSchema: { type: ['object', 42] } },
        { ...tool, outputSchema: { required: 'login' } },
        { ...tool, outputSchema: { properties: [] } }
    ])('still rejects malformed tool declarations: %j', (declaration) => {
        expect(() => mcpConsumerListToolsResultSchema.parse({ tools: [declaration] })).toThrow()
    })
})

describe('SDK and LangChain tool discovery', () => {
    let client: Client
    let server: Server
    let result: { content: { type: 'text'; text: string }[]; structuredContent: object }

    beforeEach(async () => {
        installMcpToolSchemaBridge()
        installMcpToolSchemaBridge()
        client = new Client({ name: 'compatibility-test', version: '1' })
        server = new Server({ name: 'fixture', version: '1' }, { capabilities: { tools: {} } })
        server.setRequestHandler(ListToolsRequestSchema, async ({ params }) => ({
            tools: params?.cursor
                ? [{ ...tool, name: 'search_repositories', outputSchema: { anyOf: [nullableAccount] } }]
                : [tool],
            ...(params?.cursor ? {} : { nextCursor: 'page-2' })
        }))
        result = { content: [{ type: 'text', text: '{"login":"fixture"}' }], structuredContent: { login: 'fixture' } }
        server.setRequestHandler(CallToolRequestSchema, async () => result)
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
        await server.connect(serverTransport)
        await client.connect(clientTransport)
    })

    afterEach(async () => {
        await client.close()
        await server.close()
    })

    it('loads all pages through the real adapter and executes a discovered tool', async () => {
        const tools = await loadMcpTools('github', client, { prefixToolNameWithServerName: false })
        expect(tools.map(({ name }) => name)).toEqual(['get_me', 'search_repositories'])
        await expect(tools[0].invoke({})).resolves.toContain('"login":"fixture"')
    })

    it('retains the original SDK output validator for nullable output schemas', async () => {
        const response = await client.listTools()
        expect(response.tools[0]).toEqual(tool)
        await expect(client.callTool({ name: 'get_me' })).resolves.toMatchObject({
            structuredContent: { login: 'fixture' }
        })
        result.structuredContent = { login: 42 }
        await expect(client.callTool({ name: 'get_me' })).rejects.toThrow('output schema')
    })

    it('does not replace explicitly supplied result schemas', async () => {
        await expect(client.request({ method: 'tools/list' }, ListToolsResultSchema.extend({}))).rejects.toThrow()
    })

    it('propagates server authorization errors without retrying or hiding them', async () => {
        const handler = jest.fn(async () => {
            throw new McpError(-32001, 'Not authorized')
        })
        server.setRequestHandler(ListToolsRequestSchema, handler)
        await expect(client.listTools()).rejects.toThrow('Not authorized')
        expect(handler).toHaveBeenCalledTimes(1)
    })
})
