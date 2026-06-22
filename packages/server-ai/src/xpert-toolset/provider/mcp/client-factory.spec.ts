import type { MultiServerMCPClient } from '@langchain/mcp-adapters'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { MCPServerType, type IXpertToolset, type TMCPSchema } from '@xpert-ai/contracts'
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mockMcpMeta = {
    'xpertai/visualization': {
        type: 'uose.mdx.metric_snapshot',
        payload: {
            resourceId: 'inner-bi'
        }
    }
}
const mockStructuredContent = {
    ok: true
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
const tempRoots: string[] = []
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
                    structuredContent: mockStructuredContent,
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

function createLoadedPluginRoot() {
    const root = mkdtempSync(join(tmpdir(), 'xpert-plugin-echarts-'))
    mkdirSync(join(root, 'dist'), { recursive: true })
    writeFileSync(join(root, 'dist', 'mcp-server.js'), '')
    tempRoots.push(root)
    return root
}

function pluginEntryPath(pluginRoot: string) {
    return realpathSync(join(pluginRoot, 'dist', 'mcp-server.js'))
}

function getConfiguredMcpServer(created: MockMcpClientConstruction, serverName: string) {
    const config = created.config as { mcpServers?: Record<string, Record<string, unknown>> }
    const server = config.mcpServers?.[serverName]
    if (!server) {
        throw new Error(`Expected MCP server '${serverName}' to be configured`)
    }
    return server
}

function decodeRunnerSpec(server: Record<string, unknown>) {
    const encoded = (server.env as Record<string, string> | undefined)?.XPERT_MCP_STDIO_RUNNER_SPEC
    if (!encoded) {
        throw new Error('Expected runner spec env to be configured')
    }
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as {
        command: string
        args: string[]
        cwd: string
        env: Record<string, string>
    }
}

async function expectMcpMetaArtifactBridgeInstalled(tool: MockMcpTool) {
    await expect(tool.func({})).resolves.toEqual([
        '{"ok":true}',
        {
            ...mockMcpMeta,
            _meta: mockMcpMeta,
            structuredContent: mockStructuredContent
        }
    ])
}

describe('MCP client factories', () => {
    beforeEach(() => {
        mockConstructedClients.length = 0
        mockLoadedPlugins.length = 0
        mockResolveLoadedPluginBundleRoot.mockClear()
        process.env.XPERT_MCP_STDIO_RUNTIME_ENABLED = 'true'
        jest.clearAllMocks()
    })

    afterEach(() => {
        delete process.env.XPERT_MCP_STDIO_RUNTIME_ENABLED
        while (tempRoots.length) {
            const root = tempRoots.pop()
            if (root) {
                rmSync(root, { recursive: true, force: true })
            }
        }
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
            inputSchema: {
                type: 'object',
                properties: {}
            },
            ui: {
                resourceUri: 'ui://query-app'
            },
            visibility: ['model', 'app']
        })
    })

    it('resolves plugin-managed MCP server placeholders from the currently loaded plugin root', async () => {
        const pluginRoot = createLoadedPluginRoot()
        mockLoadedPlugins.push({
            organizationId: 'org-1',
            name: '@xpert-ai/plugin-echarts-mcp-app@runtime__new',
            packageName: '@xpert-ai/plugin-echarts-mcp-app',
            bundleRoot: pluginRoot
        })

        const result = await createMCPClient(
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
        const server = getConfiguredMcpServer(created, 'echarts-drilldown')
        const runnerSpec = decodeRunnerSpec(server)
        expect(server).toMatchObject({
            command: process.execPath,
            args: [expect.stringContaining('mcp-stdio-runner.js')]
        })
        expect(runnerSpec).toMatchObject({
            command: process.execPath,
            args: [pluginEntryPath(pluginRoot)],
            env: {
                ECHARTS_DATA: expect.stringContaining(
                    '/.xpertai-plugin-data/tenant-1/workspace-1/_xpert-ai_plugin-echarts-mcp-app/echarts-drilldown/cache'
                )
            }
        })
        await result.destroy?.()
    })

    it('rewrites stale plugin runtime roots in existing plugin-managed MCP toolsets', async () => {
        const pluginRoot = createLoadedPluginRoot()
        mockLoadedPlugins.push({
            organizationId: 'org-1',
            name: '@xpert-ai/plugin-echarts-mcp-app@runtime__new',
            packageName: '@xpert-ai/plugin-echarts-mcp-app',
            bundleRoot: pluginRoot
        })

        const result = await createMCPClient(
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
        const server = getConfiguredMcpServer(created, 'echarts-drilldown')
        const runnerSpec = decodeRunnerSpec(server)
        expect(server).toMatchObject({
            command: process.execPath,
            args: [expect.stringContaining('mcp-stdio-runner.js')]
        })
        expect(runnerSpec.args).toEqual([pluginEntryPath(pluginRoot)])
        await result.destroy?.()
    })
})
