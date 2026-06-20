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
    config: {
        mcpServers: Record<string, unknown>
    }
    _loadToolsOptions: Record<string, { additionalToolNamePrefix?: string }>
    _clients: {
        default: Client
    }
    getTools: jest.Mock<Promise<MockMcpTool[]>, []>
    getClient: jest.Mock<Promise<Client>, [string]>
}

type MockMcpTool = {
    name: string
    metadata?: Record<string, unknown>
    func: jest.Mock<Promise<unknown>, [unknown]>
}

type MockMcpClientConstruction = {
    config: unknown
    instance: MockMcpClientInstance
    sdkClient: Client
    tool: MockMcpTool
}

const mockConstructedClients: MockMcpClientConstruction[] = []
const mockLoadedPlugins: Array<Record<string, unknown>> = []
const mockResolveLoadedPluginBundleRoot = jest.fn((plugin: Record<string, unknown>) =>
    typeof plugin.bundleRoot === 'string' ? plugin.bundleRoot : null
)

jest.mock('@langchain/mcp-adapters', () => ({
    MultiServerMCPClient: jest.fn().mockImplementation((config: unknown) => {
        const sdkClient = {
            listTools: jest.fn(async () => ({
                tools: [
                    {
                        name: 'query',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        },
                        _meta: {
                            ui: {
                                resourceUri: 'ui://query-app',
                                visibility: ['model', 'app']
                            }
                        }
                    }
                ]
            })),
            callTool: jest.fn(
                async (): Promise<CallToolResult> => ({
                    content: [{ type: 'text', text: '{"ok":true}' }],
                    _meta: mockMcpMeta
                })
            )
        } as unknown as Client
        const tool: MockMcpTool = {
            name: 'dx__query',
            metadata: {},
            func: jest.fn(async (_input: unknown) => {
                void _input
                await sdkClient.callTool({ name: 'query', arguments: {} })
                return ['{"ok":true}', []]
            })
        }
        const instance = {
            config: {
                mcpServers: {
                    default: {}
                }
            },
            _loadToolsOptions: {
                default: {
                    additionalToolNamePrefix: 'dx'
                }
            },
            _clients: {
                default: sdkClient
            },
            getTools: jest.fn(async () => [tool]),
            getClient: jest.fn(async (_serverName: string) => {
                void _serverName
                return sdkClient
            })
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
    loaded: mockLoadedPlugins,
    resolveLoadedPluginBundleRoot: mockResolveLoadedPluginBundleRoot,
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
        mockLoadedPlugins.length = 0
        mockResolveLoadedPluginBundleRoot.mockClear()
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
        expect(created.tool.metadata?.mcpApp).toMatchObject({
            serverName: 'default',
            name: 'query',
            displayName: 'dx__query',
            ui: {
                resourceUri: 'ui://query-app'
            },
            visibility: ['model', 'app']
        })
    })

    it('resolves plugin-managed MCP server placeholders from the currently loaded plugin root', async () => {
        mockLoadedPlugins.push({
            organizationId: 'org-1',
            name: '@xpert-ai/plugin-echarts-mcp-app@runtime__new',
            packageName: '@xpert-ai/plugin-echarts-mcp-app',
            bundleRoot: '/runtime/new/node_modules/@xpert-ai/plugin-echarts-mcp-app'
        })

        await createMCPClient(
            {
                ...toolset,
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: 'workspace-1',
                options: {
                    pluginManaged: true,
                    pluginName: '@xpert-ai/plugin-echarts-mcp-app',
                    componentKey: 'echarts-drilldown'
                }
            },
            {
                mcpServers: {
                    'echarts-drilldown': {
                        type: MCPServerType.STDIO,
                        command: 'node',
                        args: ['${PLUGIN_ROOT}/dist/mcp-server.js'],
                        env: {
                            ECHARTS_DATA: '${PLUGIN_DATA}/cache'
                        }
                    }
                }
            },
            {},
            'xpert-1'
        )

        const created = getCreatedClient()
        expect(created.config).toMatchObject({
            mcpServers: {
                'echarts-drilldown': {
                    command: 'node',
                    args: ['/runtime/new/node_modules/@xpert-ai/plugin-echarts-mcp-app/dist/mcp-server.js'],
                    env: {
                        ECHARTS_DATA: expect.stringContaining(
                            '/.xpertai-plugin-data/tenant-1/workspace-1/_xpert-ai_plugin-echarts-mcp-app/echarts-drilldown/cache'
                        )
                    }
                }
            }
        })
    })

    it('rewrites stale plugin runtime roots in existing plugin-managed MCP toolsets', async () => {
        mockLoadedPlugins.push({
            organizationId: 'org-1',
            name: '@xpert-ai/plugin-echarts-mcp-app@runtime__new',
            packageName: '@xpert-ai/plugin-echarts-mcp-app',
            bundleRoot: '/runtime/new/node_modules/@xpert-ai/plugin-echarts-mcp-app'
        })

        await createMCPClient(
            {
                ...toolset,
                organizationId: 'org-1',
                options: {
                    pluginManaged: true,
                    pluginName: '@xpert-ai/plugin-echarts-mcp-app',
                    componentKey: 'echarts-drilldown'
                }
            },
            {
                mcpServers: {
                    'echarts-drilldown': {
                        type: MCPServerType.STDIO,
                        command: 'node',
                        args: [
                            '/Users/xpertai/GitHub/os/xpert/plugins/global/@xpert-ai/plugin-echarts-mcp-app@runtime__old/node_modules/@xpert-ai/plugin-echarts-mcp-app/dist/mcp-server.js'
                        ]
                    }
                }
            },
            {},
            'xpert-1'
        )

        const created = getCreatedClient()
        expect(created.config).toMatchObject({
            mcpServers: {
                'echarts-drilldown': {
                    args: ['/runtime/new/node_modules/@xpert-ai/plugin-echarts-mcp-app/dist/mcp-server.js']
                }
            }
        })
    })
})
