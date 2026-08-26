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
        prefixToolNameWithServerName?: boolean
        additionalToolNamePrefix?: string
    }
    _loadToolsOptions: Record<string, { additionalToolNamePrefix?: string }>
    _clients: {
        default: Client
    }
    getTools: jest.Mock<Promise<MockMcpTool[]>, []>
    getClient: jest.Mock<Promise<Client>, [string]>
    close: jest.Mock<Promise<void>, []>
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
    originalGetTools: jest.Mock
    originalGetClient: jest.Mock
}

const mockConstructedClients: MockMcpClientConstruction[] = []
const mockLoadedPlugins: Array<Record<string, unknown>> = []
const mockPluginComponents: Array<Record<string, unknown>> = []
let mockNextGetToolsError: Error | null = null
const tempRoots: string[] = []
const mockResolveLoadedPluginBundleRoot = jest.fn((plugin: Record<string, unknown>) =>
    typeof plugin.bundleRoot === 'string' ? plugin.bundleRoot : null
)

jest.mock('@langchain/mcp-adapters', () => ({
    MultiServerMCPClient: jest.fn().mockImplementation((config: unknown) => {
        const configuredMcpServers: Record<string, unknown> = {}
        const mcpServersValue =
            typeof config === 'object' && config !== null && !Array.isArray(config)
                ? Reflect.get(config, 'mcpServers')
                : undefined
        if (typeof mcpServersValue === 'object' && mcpServersValue !== null && !Array.isArray(mcpServersValue)) {
            for (const [serverName, serverConfig] of Object.entries(mcpServersValue)) {
                configuredMcpServers[serverName] = serverConfig
            }
        }
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
        const originalGetTools = jest.fn(async () => {
            if (mockNextGetToolsError) {
                const error = mockNextGetToolsError
                mockNextGetToolsError = null
                throw error
            }
            return [tool]
        })
        const originalGetClient = jest.fn(async (_serverName: string) => {
            void _serverName
            return sdkClient
        })
        const instance = {
            config: {
                mcpServers: configuredMcpServers,
                prefixToolNameWithServerName: false,
                additionalToolNamePrefix: 'dx'
            },
            _loadToolsOptions: {
                default: {
                    additionalToolNamePrefix: 'dx'
                }
            },
            _clients: {
                default: sdkClient
            },
            getTools: originalGetTools,
            getClient: originalGetClient,
            close: jest.fn(async () => undefined)
        } satisfies MockMcpClientInstance

        mockConstructedClients.push({ config, instance, sdkClient, tool, originalGetTools, originalGetClient })
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
    readPluginBundleManifest: jest.fn(() => ({ manifest: { name: '@xpert-ai/mock-plugin' } })),
    collectPluginBundleComponents: jest.fn(() => mockPluginComponents),
    runScript: jest.fn()
}))

jest.mock('i18next', () => ({
    t: jest.fn((key: string) => key)
}))

import { MultiServerMCPClient as MockedMultiServerMCPClient } from '@langchain/mcp-adapters'
import { createMCPClient } from './types'
import { mcpStdioRuntimeManager } from './mcp-stdio-runtime'
import { configureMcpConsumerAuthProviderResolver } from '../../../mcp-consumer/auth/mcp-consumer-auth.registry'

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

function getCreatedClient(index = 0): MockMcpClientConstruction {
    const created = mockConstructedClients[index]
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
        startupTimeoutMs: number
        maxLifetimeMs: number
    }
}

function registerMcpComponent(componentKey: string, config: Record<string, unknown>) {
    mockPluginComponents.push({
        componentType: 'mcp_server',
        componentKey,
        config,
        definitionHash: `hash:${componentKey}`
    })
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
    const originalFetch = global.fetch

    beforeEach(() => {
        mockConstructedClients.length = 0
        mockLoadedPlugins.length = 0
        mockPluginComponents.length = 0
        mockNextGetToolsError = null
        mockResolveLoadedPluginBundleRoot.mockClear()
        process.env.XPERT_MCP_STDIO_RUNTIME_ENABLED = 'true'
        jest.clearAllMocks()
        configureMcpConsumerAuthProviderResolver(null)
        global.fetch = jest.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'legacy-probe',
                    error: { code: -32601, message: 'Method not found' }
                }),
                { status: 200, headers: { 'content-type': 'application/json' } }
            )
        )
    })

    afterEach(() => {
        delete process.env.XPERT_MCP_STDIO_RUNTIME_ENABLED
        global.fetch = originalFetch
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

    it('does not initialize the legacy SDK for a modern 2026 HTTP server', async () => {
        global.fetch = jest.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'modern-probe',
                    result: {
                        resultType: 'complete',
                        supportedVersions: ['2026-07-28'],
                        capabilities: { tools: {} }
                    }
                }),
                { status: 200, headers: { 'content-type': 'application/json' } }
            )
        )

        await createMCPClient(toolset, schema, {}, 'xpert-1')

        const created = getCreatedClient()
        expect(created.originalGetTools).not.toHaveBeenCalled()
        expect(created.originalGetClient).not.toHaveBeenCalled()
    })

    it('resolves explicit API key authentication without leaking the auth config to the transport', async () => {
        await createMCPClient(
            toolset,
            {
                servers: {
                    default: {
                        type: MCPServerType.HTTP,
                        url: 'https://mcp.example.test',
                        auth: { type: 'api_key', headerName: 'x-api-key', value: 'secret-from-environment' }
                    }
                }
            },
            {}
        )

        const server = getConfiguredMcpServer(getCreatedClient(), 'default')
        expect(server.headers).toEqual({ 'x-api-key': 'secret-from-environment' })
        expect(server).not.toHaveProperty('auth')
    })

    it('attaches a persisted OAuth provider only to Streamable HTTP connections', async () => {
        const provider = { tokens: jest.fn() }
        const resolver = jest.fn().mockResolvedValue(provider)
        configureMcpConsumerAuthProviderResolver(resolver)

        await createMCPClient(
            { ...toolset, tenantId: 'tenant-1', organizationId: 'org-1' },
            {
                servers: {
                    default: {
                        type: MCPServerType.HTTP,
                        url: 'https://mcp.example.test',
                        auth: { type: 'oauth', binding: 'user', scopes: ['tools:read'] }
                    }
                }
            },
            {},
            undefined,
            {
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'user-1'
            }
        )

        expect(resolver).toHaveBeenCalledWith(expect.objectContaining({ serverName: 'default', userId: 'user-1' }))
        expect(getConfiguredMcpServer(getCreatedClient(), 'default').authProvider).toBe(provider)
    })

    it('runs a generic stdio server without a plugin installation', async () => {
        const result = await createMCPClient(
            {
                ...toolset,
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: 'workspace-1'
            },
            {
                servers: {
                    generic: {
                        type: MCPServerType.STDIO,
                        command: 'node',
                        args: ['generic-mcp-server.js'],
                        env: { GENERIC_MCP_TOKEN: 'generic-token' },
                        runtime: { provider: 'local-process', allowedCommands: ['node'] }
                    }
                }
            },
            {}
        )

        const server = getConfiguredMcpServer(getCreatedClient(), 'generic')
        const runnerSpec = decodeRunnerSpec(server)
        expect(mockLoadedPlugins).toEqual([])
        expect(mockPluginComponents).toEqual([])
        expect(runnerSpec).toMatchObject({
            command: 'node',
            args: ['generic-mcp-server.js'],
            env: { GENERIC_MCP_TOKEN: 'generic-token' }
        })
        expect(mcpStdioRuntimeManager.list({ toolsetId: toolset.id })).toEqual([
            expect.objectContaining({ serverName: 'generic', pluginManaged: false })
        ])

        await result.destroy?.()
        expect(mcpStdioRuntimeManager.list({ toolsetId: toolset.id })).toEqual([])
    })

    it('resolves plugin-managed MCP server placeholders from the currently loaded plugin root', async () => {
        const pluginRoot = createLoadedPluginRoot()
        registerMcpComponent('echarts-drilldown', {
            type: 'stdio',
            command: 'node',
            args: ['${PLUGIN_ROOT}/dist/mcp-server.js'],
            env: { ECHARTS_DATA: '${PLUGIN_DATA}/cache' },
            policy: { runtime: { provider: 'local-process', allowedCommands: ['node'] } }
        })
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
        registerMcpComponent('echarts-drilldown', {
            type: 'stdio',
            command: 'node',
            args: ['${PLUGIN_ROOT}/dist/mcp-server.js'],
            policy: { runtime: { provider: 'local-process', allowedCommands: ['node'] } }
        })
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

    it('uses the current plugin manifest command, args, and runtime policy instead of request overrides', async () => {
        const pluginRoot = createLoadedPluginRoot()
        registerMcpComponent('demo', {
            type: 'stdio',
            command: 'node',
            args: ['${PLUGIN_ROOT}/dist/mcp-server.js'],
            policy: {
                enabledTools: ['demo_create', 'demo_validate', 'demo_apply', 'demo_compare'],
                runtime: {
                    provider: 'local-process',
                    startupTimeoutMs: 15_000,
                    idleTimeoutMs: 900_000,
                    maxLifetimeMs: 3_600_000,
                    allowedCommands: ['node']
                }
            }
        })
        mockLoadedPlugins.push({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            name: '@xpert-ai/plugin-demo@runtime__current',
            packageName: '@xpert-ai/plugin-demo',
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
                    pluginName: '@xpert-ai/plugin-demo',
                    componentKey: 'demo',
                    mcpRuntime: {
                        provider: 'sidecar',
                        startupTimeoutMs: 60_000,
                        maxLifetimeMs: 86_400_000,
                        allowedCommands: ['python']
                    }
                }
            },
            {
                mcpServers: {
                    attacker: {
                        type: MCPServerType.STDIO,
                        command: 'python',
                        args: ['/tmp/attacker.py'],
                        runtime: {
                            provider: 'sidecar',
                            startupTimeoutMs: 60_000,
                            maxLifetimeMs: 86_400_000,
                            allowedCommands: ['python']
                        }
                    }
                }
            },
            {},
            'xpert-1'
        )

        const created = getCreatedClient()
        const server = getConfiguredMcpServer(created, 'demo')
        const runnerSpec = decodeRunnerSpec(server)
        expect(Object.keys((created.config as { mcpServers: object }).mcpServers)).toEqual(['demo'])
        expect(runnerSpec).toMatchObject({
            command: process.execPath,
            args: [pluginEntryPath(pluginRoot)],
            startupTimeoutMs: 15_000,
            maxLifetimeMs: 3_600_000
        })
        await result.destroy?.()
    })

    it('isolates plugin runtime data directories by tenant and workspace', async () => {
        const pluginRoot = createLoadedPluginRoot()
        registerMcpComponent('demo', {
            type: 'stdio',
            command: 'node',
            args: ['${PLUGIN_ROOT}/dist/mcp-server.js'],
            env: { DEMO_CACHE: '${PLUGIN_DATA}/cache' },
            policy: { runtime: { provider: 'local-process', allowedCommands: ['node'] } }
        })
        mockLoadedPlugins.push({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            name: '@xpert-ai/plugin-demo@runtime__current',
            packageName: '@xpert-ai/plugin-demo',
            bundleRoot: pluginRoot
        })
        const createForWorkspace = (workspaceId: string) =>
            createMCPClient(
                {
                    ...toolset,
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    workspaceId,
                    options: {
                        pluginManaged: true,
                        pluginName: '@xpert-ai/plugin-demo',
                        componentKey: 'demo'
                    }
                },
                { mcpServers: { demo: { type: MCPServerType.STDIO, command: 'ignored' } } },
                {}
            )

        const first = await createForWorkspace('workspace-1')
        const second = await createForWorkspace('workspace-2')
        const firstSpec = decodeRunnerSpec(getConfiguredMcpServer(getCreatedClient(0), 'demo'))
        const secondSpec = decodeRunnerSpec(getConfiguredMcpServer(getCreatedClient(1), 'demo'))

        expect(firstSpec.cwd).toContain('/tenant-1/workspace-1/_xpert-ai_plugin-demo/demo')
        expect(secondSpec.cwd).toContain('/tenant-1/workspace-2/_xpert-ai_plugin-demo/demo')
        expect(firstSpec.cwd).not.toBe(secondSpec.cwd)
        expect(firstSpec.env.DEMO_CACHE).toBe(`${firstSpec.cwd}/cache`)
        expect(secondSpec.env.DEMO_CACHE).toBe(`${secondSpec.cwd}/cache`)
        await first.destroy?.()
        await second.destroy?.()
    })

    it('closes the client and removes the plugin runtime when MCP initialization fails', async () => {
        const pluginRoot = createLoadedPluginRoot()
        registerMcpComponent('demo', {
            type: 'stdio',
            command: 'node',
            args: ['${PLUGIN_ROOT}/dist/mcp-server.js'],
            policy: { runtime: { provider: 'local-process', allowedCommands: ['node'] } }
        })
        mockLoadedPlugins.push({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            name: '@xpert-ai/plugin-demo@runtime__current',
            packageName: '@xpert-ai/plugin-demo',
            bundleRoot: pluginRoot
        })
        mockNextGetToolsError = new Error('plugin initialization failed')

        await expect(
            createMCPClient(
                {
                    ...toolset,
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    workspaceId: 'workspace-1',
                    options: {
                        pluginManaged: true,
                        pluginName: '@xpert-ai/plugin-demo',
                        componentKey: 'demo'
                    }
                },
                { mcpServers: { demo: { type: MCPServerType.STDIO, command: 'ignored' } } },
                {}
            )
        ).rejects.toThrow('plugin initialization failed')

        expect(getCreatedClient().instance.close).toHaveBeenCalled()
        expect(mcpStdioRuntimeManager.list({ pluginName: '@xpert-ai/plugin-demo' })).toEqual([])
    })
})
