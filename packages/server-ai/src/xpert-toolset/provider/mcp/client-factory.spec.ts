import type { MultiServerMCPClient } from '@langchain/mcp-adapters'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { MCPServerType, type IXpertToolset, type TMCPSchema } from '@xpert-ai/contracts'

const mockMcpMeta = {
    'xpertai/visualization': {
        type: 'uose.mdx.metric_snapshot',
        payload: {
            resourceId: 'inner-bi'
        }
    }
}

type MockMcpClientInstance = {
    _clients: {
        default: Client
    }
    getTools: jest.Mock<Promise<MockMcpTool[]>, []>
    getClient: jest.Mock<Promise<Client>, [string]>
}

type MockMcpTool = {
    func: jest.Mock<Promise<unknown>, [unknown]>
}

type MockMcpClientConstruction = {
    config: unknown
    instance: MockMcpClientInstance
    sdkClient: Client
    tool: MockMcpTool
}

const mockConstructedClients: MockMcpClientConstruction[] = []

jest.mock('@langchain/mcp-adapters', () => ({
    MultiServerMCPClient: jest.fn().mockImplementation((config: unknown) => {
        const sdkClient = {
            callTool: jest.fn(
                async (): Promise<CallToolResult> => ({
                    content: [{ type: 'text', text: '{"ok":true}' }],
                    _meta: mockMcpMeta
                })
            )
        } as unknown as Client
        const tool: MockMcpTool = {
            func: jest.fn(async (_input: unknown) => {
                await sdkClient.callTool({ name: 'query', arguments: {} })
                return ['{"ok":true}', []]
            })
        }
        const instance = {
            _clients: {
                default: sdkClient
            },
            getTools: jest.fn(async () => [tool]),
            getClient: jest.fn(async (_serverName: string) => sdkClient)
        } satisfies MockMcpClientInstance

        mockConstructedClients.push({ config, instance, sdkClient, tool })
        return instance as unknown as MultiServerMCPClient
    })
}))

jest.mock('@langchain/core/callbacks/dispatch', () => ({
    dispatchCustomEvent: jest.fn(async () => undefined)
}))

jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        getLanguageCode: jest.fn(() => 'en'),
        currentTenantId: jest.fn(() => 'tenant-1'),
        currentUserId: jest.fn(() => 'user-1')
    },
    runScript: jest.fn()
}))

jest.mock('i18next', () => ({
    t: jest.fn((key: string) => key)
}))

import { MultiServerMCPClient as MockedMultiServerMCPClient } from '@langchain/mcp-adapters'
import { createMCPClient } from './types'

type McpClientConfig = {
    outputHandling?: {
        resource?: string
    }
}

const toolset: Partial<IXpertToolset> = {
    id: 'toolset-1',
    name: 'Data Xpert'
}

const schema: TMCPSchema = {
    servers: {
        default: {
            type: MCPServerType.HTTP,
            url: 'http://localhost:3100/mcp',
            toolNamePrefix: 'dx'
        }
    }
}

function getCreatedClient(): MockMcpClientConstruction {
    const created = mockConstructedClients[0]
    if (!created) {
        throw new Error('Expected MultiServerMCPClient to be constructed')
    }
    return created
}

async function expectMcpMetaArtifactBridgeInstalled(tool: MockMcpTool) {
    await expect(tool.func({})).resolves.toEqual(['{"ok":true}', mockMcpMeta])
}

describe('MCP client factories', () => {
    beforeEach(() => {
        mockConstructedClients.length = 0
        jest.clearAllMocks()
    })

    it('configures resource output as artifacts and installs the meta bridge', async () => {
        const result = await createMCPClient(toolset, schema, {}, 'xpert-1')
        const created = getCreatedClient()

        expect(MockedMultiServerMCPClient).toHaveBeenCalledTimes(1)
        expect(created.config as McpClientConfig).toMatchObject({
            outputHandling: {
                resource: 'artifact'
            }
        })
        expect(result.client).toBe(created.instance)
        await expectMcpMetaArtifactBridgeInstalled(created.tool)
    })
})
