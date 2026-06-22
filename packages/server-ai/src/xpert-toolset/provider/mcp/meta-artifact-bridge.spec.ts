import type { MultiServerMCPClient } from '@langchain/mcp-adapters'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
    installMcpClientMetaArtifactBridge,
    installMcpMetaArtifactBridge,
    mapMcpMetaToToolArtifact
} from './meta-artifact-bridge'

const mcpMeta = {
    'xpertai/visualization': {
        type: 'uose.mdx.metric_snapshot',
        payload: {
            resourceId: 'inner-bi'
        }
    }
}

const mcpStructuredArtifact = {
    structuredContent: {
        page: {
            url: 'https://en.wikipedia.org/wiki/Model_Context_Protocol',
            title: 'Model Context Protocol'
        },
        links: [],
        error: null
    }
}

type MockMcpTool = {
    func: jest.Mock<Promise<unknown>, [unknown]>
}

describe('MCP meta artifact bridge', () => {
    it('maps MCP _meta directly to the tool artifact slot', () => {
        expect(mapMcpMetaToToolArtifact(['{"ok":true}', []], mcpMeta)).toEqual(['{"ok":true}', mcpMeta])
    })

    it('maps MCP structuredContent to the tool artifact slot', () => {
        expect(mapMcpMetaToToolArtifact(['{"ok":true}', []], mcpStructuredArtifact)).toEqual([
            '{"ok":true}',
            mcpStructuredArtifact
        ])
    })

    it('keeps existing artifacts and appends MCP _meta when both exist', () => {
        const existingArtifact = { type: 'resource', resource: { uri: 'file:///tmp/output.txt' } }

        expect(mapMcpMetaToToolArtifact(['{"ok":true}', [existingArtifact]], mcpMeta)).toEqual([
            '{"ok":true}',
            [existingArtifact, mcpMeta]
        ])
    })

    it('leaves non tuple tool output unchanged', () => {
        expect(mapMcpMetaToToolArtifact('{"ok":true}', mcpMeta)).toBe('{"ok":true}')
    })

    it('wraps SDK client callTool without changing the raw MCP result', async () => {
        const mcpResult: CallToolResult = {
            content: [{ type: 'text', text: '{"ok":true}' }],
            _meta: mcpMeta
        }
        const sdkClient = {
            callTool: jest.fn(async () => mcpResult)
        } as unknown as Client

        installMcpClientMetaArtifactBridge(sdkClient)
        const result = await sdkClient.callTool({ name: 'query', arguments: {} })

        expect(result).toBe(mcpResult)
        expect(result.content).toEqual([{ type: 'text', text: '{"ok":true}' }])
    })

    it('installs the bridge on MultiServerMCPClient tools after tools load', async () => {
        const sdkClient = {
            callTool: jest.fn(
                async (): Promise<CallToolResult> => ({
                    content: [{ type: 'text', text: '{"ok":true}' }],
                    structuredContent: mcpStructuredArtifact.structuredContent,
                    _meta: mcpMeta
                })
            )
        } as unknown as Client
        const tool: MockMcpTool = {
            func: jest.fn(async (_input: unknown) => {
                await sdkClient.callTool({ name: 'query', arguments: {} })
                return ['{"ok":true}', []]
            })
        }
        const multiServerClient = {
            _clients: {
                default: sdkClient
            },
            getTools: jest.fn(async () => [tool]),
            getClient: jest.fn(async (_serverName: string) => sdkClient)
        } as unknown as MultiServerMCPClient

        installMcpMetaArtifactBridge(multiServerClient)
        const tools = (await multiServerClient.getTools()) as unknown as MockMcpTool[]
        const result = await tools[0].func({})

        expect(result).toEqual([
            '{"ok":true}',
            {
                ...mcpMeta,
                _meta: mcpMeta,
                structuredContent: mcpStructuredArtifact.structuredContent
            }
        ])
        await expect(multiServerClient.getClient('default')).resolves.toBe(sdkClient)
    })

    it('adds an artifact when the MCP result has structuredContent without _meta', async () => {
        const sdkClient = {
            callTool: jest.fn(
                async (): Promise<CallToolResult> => ({
                    content: [{ type: 'text', text: '{"ok":true}' }],
                    structuredContent: mcpStructuredArtifact.structuredContent
                })
            )
        } as unknown as Client
        const tool: MockMcpTool = {
            func: jest.fn(async (_input: unknown) => {
                await sdkClient.callTool({ name: 'query', arguments: {} })
                return ['{"ok":true}', []]
            })
        }
        const multiServerClient = {
            _clients: {
                default: sdkClient
            },
            getTools: jest.fn(async () => [tool]),
            getClient: jest.fn(async (_serverName: string) => sdkClient)
        } as unknown as MultiServerMCPClient

        installMcpMetaArtifactBridge(multiServerClient)
        const tools = (await multiServerClient.getTools()) as unknown as MockMcpTool[]
        const result = await tools[0].func({})

        expect(result).toEqual(['{"ok":true}', mcpStructuredArtifact])
    })
})
