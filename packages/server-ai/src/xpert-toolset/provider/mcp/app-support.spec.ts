import type { DynamicStructuredTool } from '@langchain/core/tools'
import type { MultiServerMCPClient } from '@langchain/mcp-adapters'
import type { IXpertToolset } from '@xpert-ai/contracts'
import {
    appendMcpAppMessage,
    applyMcpAppInstanceSnapshot,
    callMcpAppTool,
    configureMcpAppInstancePersistence,
    detachMcpAppInstancesForClient,
    getMcpAppInstance,
    listMcpToolAppMetadata,
    readMcpAppResource,
    registerMcpAppInstance,
    runMcpAppInstanceMutation,
    snapshotMcpAppInstance,
    updateMcpAppModelContext,
    verifyMcpAppInstanceToken,
    waitForMcpAppInstancePersistence
} from './app-support'
import { mcpStdioRuntimeManager } from './mcp-stdio-runtime'
import { LangChainMcpConnection } from '../../../mcp-consumer/connection/langchain-mcp-connection'

function createTool(name: string, resourceUri: string) {
    return {
        name,
        description: `${name} tool`,
        metadata: {
            mcpApp: {
                serverName: 'default',
                name,
                displayName: name,
                visibility: ['model', 'app'],
                ui: {
                    resourceUri
                }
            }
        }
    } as unknown as DynamicStructuredTool
}

function createToolset(): Pick<
    IXpertToolset,
    'id' | 'name' | 'tools' | 'options' | 'tenantId' | 'organizationId' | 'workspaceId'
> {
    return {
        id: 'toolset-1',
        name: 'MCP Toolset',
        tools: [],
        options: {},
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1'
    }
}

describe('MCP App instance lifecycle', () => {
    const originalFetch = global.fetch

    beforeEach(() => {
        process.env.XPERT_MCP_APPS_ENABLED = 'true'
    })

    afterEach(() => {
        configureMcpAppInstancePersistence(null)
        delete process.env.XPERT_MCP_APPS_ENABLED
        global.fetch = originalFetch
        jest.useRealTimers()
    })

    it('detaches app instances owned by a closing MCP client so later requests can revive them', () => {
        const client = {} as MultiServerMCPClient
        const otherClient = {} as MultiServerMCPClient
        const first = registerMcpAppInstance({
            client,
            toolset: createToolset(),
            tool: createTool('sales_overview', 'ui://sales-overview')
        })
        const second = registerMcpAppInstance({
            client: otherClient,
            toolset: createToolset(),
            tool: createTool('inventory_overview', 'ui://inventory-overview')
        })

        expect(first?.appInstanceId).toBeTruthy()
        expect(second?.appInstanceId).toBeTruthy()
        expect(getMcpAppInstance(first!.appInstanceId)).not.toBeNull()

        expect(detachMcpAppInstancesForClient(client)).toBe(1)

        expect(getMcpAppInstance(first!.appInstanceId)).toBeNull()
        expect(getMcpAppInstance(second!.appInstanceId)).not.toBeNull()
        expect(detachMcpAppInstancesForClient(otherClient)).toBe(1)
    })

    it('treats app instances with closed MCP clients as missing so later requests can revive them', async () => {
        const client = {} as MultiServerMCPClient
        const app = registerMcpAppInstance({
            client,
            toolset: createToolset(),
            tool: createTool('sales_overview', 'ui://sales-overview')
        })

        expect(app?.appInstanceId).toBeTruthy()
        expect(getMcpAppInstance(app!.appInstanceId)).not.toBeNull()

        await mcpStdioRuntimeManager.closeClient(client, 'test-close')

        expect(getMcpAppInstance(app!.appInstanceId)).toBeNull()
    })

    it('persists a replayable initial tool input and result on the component data', () => {
        const client = {} as MultiServerMCPClient
        const app = registerMcpAppInstance({
            client,
            toolset: createToolset(),
            tool: createTool('wiki_links', 'ui://wiki-explorer/mcp-app.html'),
            toolInput: {
                page: 'Luke P. Blackburn'
            },
            toolResult: [
                'links',
                {
                    structuredContent: {
                        page: {
                            title: 'Luke P. Blackburn'
                        },
                        links: [{ title: 'Kentucky' }]
                    }
                }
            ]
        })

        expect(app?.toolInput).toEqual({
            page: 'Luke P. Blackburn'
        })
        expect(app?.toolResult).toMatchObject({
            content: [{ type: 'text', text: 'links' }],
            structuredContent: {
                page: {
                    title: 'Luke P. Blackburn'
                }
            }
        })
        expect(app?.toolResultSize).toBeGreaterThan(0)
        expect(app?.toolResultTruncated).toBe(false)
    })

    it('validates and preserves all supported ui/message content blocks', () => {
        const client = {} as MultiServerMCPClient
        const app = registerMcpAppInstance({
            client,
            toolset: createToolset(),
            tool: createTool('multimodal_message', 'ui://multimodal-message')
        })
        const instance = getMcpAppInstance(app!.appInstanceId)!

        appendMcpAppMessage(instance, {
            role: 'user',
            content: [
                { type: 'text', text: 'Analyze this' },
                { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' },
                { type: 'audio', data: 'YXVkaW8=', mimeType: 'audio/wav' },
                {
                    type: 'resource',
                    resource: { uri: 'mcp://report/1', mimeType: 'text/plain', text: 'Report body' }
                },
                { type: 'resource_link', uri: 'mcp://report/2', name: 'Report' }
            ]
        })

        expect(instance.messages.at(-1)).toMatchObject({
            role: 'user',
            content: [
                { type: 'text', text: 'Analyze this' },
                { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' },
                { type: 'audio', data: 'YXVkaW8=', mimeType: 'audio/wav' },
                { type: 'resource', resource: { uri: 'mcp://report/1', text: 'Report body' } },
                { type: 'resource_link', uri: 'mcp://report/2', name: 'Report' }
            ]
        })
        const persisted = snapshotMcpAppInstance(instance)
        expect(JSON.stringify(persisted.messages)).not.toContain('aW1hZ2U=')
        expect(persisted.messages).toEqual([
            expect.objectContaining({
                role: 'user',
                content: expect.arrayContaining([
                    expect.objectContaining({ type: 'text', preview: 'Analyze this' }),
                    expect.objectContaining({ type: 'image', digest: expect.any(String) })
                ]),
                digest: expect.any(String)
            })
        ])
        expect(() =>
            appendMcpAppMessage(instance, {
                role: 'user',
                content: [{ type: 'audio', data: 'not-base64', mimeType: 'audio/wav' }]
            })
        ).toThrow('invalid base64')

        detachMcpAppInstancesForClient(client)
    })

    it('stores only negotiated text model context after boundary validation', () => {
        const client = {} as MultiServerMCPClient
        const app = registerMcpAppInstance({
            client,
            toolset: createToolset(),
            tool: createTool('context_message', 'ui://context-message')
        })
        const instance = getMcpAppInstance(app!.appInstanceId)!

        updateMcpAppModelContext(instance, {
            content: [{ type: 'text', text: 'Selected row: 42' }],
            structuredContent: { rowId: 42 }
        })

        expect(instance.modelContext).toMatchObject({
            content: [{ type: 'text', text: 'Selected row: 42' }],
            structuredContent: { rowId: 42 }
        })
        expect(() =>
            updateMcpAppModelContext(instance, {
                content: [{ type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' }]
            })
        ).toThrow('only accepts negotiated text')
        expect(instance.modelContext).toMatchObject({
            content: [{ type: 'text', text: 'Selected row: 42' }]
        })

        detachMcpAppInstancesForClient(client)
    })

    it('keeps oversized initial tool results on the live instance but does not inline them in message history', () => {
        const client = {} as MultiServerMCPClient
        const app = registerMcpAppInstance({
            client,
            toolset: createToolset(),
            tool: createTool('large_report', 'ui://large-report'),
            toolInput: {
                reportId: 'large'
            },
            toolResult: [
                'large report',
                {
                    structuredContent: {
                        rows: [{ value: 'x'.repeat(140 * 1024) }]
                    }
                }
            ]
        })

        expect(app?.toolResult).toBeUndefined()
        expect(app?.toolResultSize).toBeGreaterThan(128 * 1024)
        expect(app?.toolResultTruncated).toBe(true)

        const liveInstance = getMcpAppInstance(app!.appInstanceId)
        expect(liveInstance?.toolResult?.structuredContent).toMatchObject({
            rows: [{ value: expect.stringContaining('xxx') }]
        })
    })

    it('refreshes Redis-backed state without replacing the replica-local MCP client', () => {
        const client = {} as MultiServerMCPClient
        const app = registerMcpAppInstance({
            client,
            toolset: createToolset(),
            tool: createTool('shared_dashboard', 'ui://shared-dashboard')
        })
        const instance = getMcpAppInstance(app!.appInstanceId)!

        expect(
            applyMcpAppInstanceSnapshot(instance, {
                version: 1,
                stateVersion: instance.stateVersion + 1,
                appInstanceId: instance.id,
                tenantId: instance.toolset.tenantId,
                organizationId: instance.toolset.organizationId,
                workspaceId: instance.toolset.workspaceId,
                toolsetId: instance.toolset.id,
                serverName: instance.toolMeta.serverName,
                toolName: instance.toolMeta.name,
                displayName: instance.toolMeta.displayName,
                resourceUri: instance.toolMeta.ui!.resourceUri,
                messages: [{ role: 'user', content: 'from api-2' }],
                logs: [{ level: 'info', message: 'shared' }],
                createdAt: instance.createdAt,
                expiresAt: instance.expiresAt
            })
        ).toBe(true)
        expect(instance.client).toBe(client)
        expect(instance.messages).toEqual([{ role: 'user', content: 'from api-2' }])
        expect(instance.logs).toEqual([{ level: 'info', message: 'shared' }])

        detachMcpAppInstancesForClient(client)
    })

    it('rejects and reconciles an acknowledged state mutation that conflicts with another replica', async () => {
        const client = {} as MultiServerMCPClient
        const app = registerMcpAppInstance({
            client,
            toolset: createToolset(),
            tool: createTool('shared_dashboard', 'ui://shared-dashboard')
        })
        const instance = getMcpAppInstance(app!.appInstanceId)!
        const replicaSnapshot = {
            ...snapshotMcpAppInstance(instance),
            stateVersion: instance.stateVersion + 1,
            messages: [{ role: 'user', content: 'accepted by api-1' }]
        }
        configureMcpAppInstancePersistence({
            save: jest.fn().mockResolvedValue(false),
            get: jest.fn().mockResolvedValue(replicaSnapshot),
            delete: jest.fn().mockResolvedValue(undefined)
        })

        appendMcpAppMessage(instance, {
            role: 'user',
            content: [{ type: 'text', text: 'conflicting api-2 update' }]
        })

        await expect(waitForMcpAppInstancePersistence(instance.id)).rejects.toThrow('another API replica')
        expect(instance.messages).toEqual([{ role: 'user', content: 'accepted by api-1' }])

        detachMcpAppInstancesForClient(client)
    })

    it('serializes local mutations so a later snapshot cannot branch from an unacknowledged write', async () => {
        const order: string[] = []
        let releaseFirst: (() => void) | undefined
        let markFirstStarted: (() => void) | undefined
        const firstGate = new Promise<void>((resolve) => {
            releaseFirst = resolve
        })
        const firstStarted = new Promise<void>((resolve) => {
            markFirstStarted = resolve
        })
        const first = runMcpAppInstanceMutation('app-serialized', async () => {
            order.push('first:start')
            markFirstStarted?.()
            await firstGate
            order.push('first:end')
        })
        const second = runMcpAppInstanceMutation('app-serialized', async () => {
            order.push('second:start')
            order.push('second:end')
        })

        await firstStarted
        expect(order).toEqual(['first:start'])

        releaseFirst?.()
        await Promise.all([first, second])
        expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
    })

    it('allows signed expired tokens to be validated only when expiration is explicitly ignored', () => {
        jest.useFakeTimers()
        jest.setSystemTime(new Date('2026-06-20T11:52:24.000Z'))

        const client = {} as MultiServerMCPClient
        const toolset = createToolset()
        const app = registerMcpAppInstance({
            client,
            userId: 'user-1',
            toolset,
            tool: createTool('wiki_links', 'ui://wiki-explorer/mcp-app.html'),
            toolCallId: 'call_1'
        })

        expect(app?.appInstanceToken).toBeTruthy()
        expect(
            verifyMcpAppInstanceToken(app!.appInstanceToken!, {
                appInstanceId: app!.appInstanceId,
                userId: 'user-1'
            }).userId
        ).toBe('user-1')
        expect(() =>
            verifyMcpAppInstanceToken(app!.appInstanceToken!, {
                appInstanceId: app!.appInstanceId,
                userId: 'user-2'
            })
        ).toThrow('userId')

        jest.setSystemTime(new Date('2026-06-20T12:23:24.000Z'))

        expect(() =>
            verifyMcpAppInstanceToken(app!.appInstanceToken!, {
                appInstanceId: app!.appInstanceId,
                toolsetId: toolset.id,
                resourceUri: app!.resourceUri,
                toolCallId: 'call_1'
            })
        ).toThrow('MCP App token has expired')

        expect(
            verifyMcpAppInstanceToken(
                app!.appInstanceToken!,
                {
                    appInstanceId: app!.appInstanceId,
                    toolsetId: toolset.id,
                    resourceUri: app!.resourceUri,
                    toolCallId: 'call_1'
                },
                { ignoreExpiration: true }
            ).appInstanceId
        ).toBe(app!.appInstanceId)
    })

    it('uses modern HTTP for app discovery, resources, and reverse tool calls', async () => {
        global.fetch = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body))
            const result =
                body.method === 'server/discover'
                    ? {
                          resultType: 'complete',
                          supportedVersions: ['2026-07-28'],
                          capabilities: { tools: {}, resources: {} }
                      }
                    : body.method === 'tools/list'
                      ? {
                            resultType: 'complete',
                            tools: [
                                {
                                    name: 'dashboard',
                                    inputSchema: { type: 'object', properties: {} },
                                    _meta: {
                                        ui: {
                                            resourceUri: 'ui://modern/dashboard',
                                            visibility: ['model', 'app']
                                        }
                                    }
                                }
                            ]
                        }
                      : body.method === 'tools/call'
                        ? {
                              resultType: 'complete',
                              content: [{ type: 'text', text: 'refreshed' }],
                              structuredContent: { refreshed: true }
                          }
                        : {
                              resultType: 'complete',
                              contents: [
                                  {
                                      uri: 'ui://modern/dashboard',
                                      mimeType: 'text/html;profile=mcp-app',
                                      text: '<html>dashboard</html>',
                                      _meta: {
                                          ui: {
                                              title: 'Dashboard',
                                              description: 'Modern dashboard',
                                              icon: { type: 'emoji', value: '📊' },
                                              csp: { connectDomains: ['https://api.example.test'] }
                                          }
                                      }
                                  }
                              ]
                          }
            return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            })
        })
        const getClient = jest.fn().mockRejectedValue(new Error('legacy client must not initialize'))
        const client = {
            config: {
                mcpServers: {
                    modern: {
                        transport: 'http',
                        url: 'https://mcp.example.test/rpc'
                    }
                },
                prefixToolNameWithServerName: false,
                additionalToolNamePrefix: ''
            },
            getClient,
            getTools: jest.fn(),
            close: jest.fn()
        } as unknown as MultiServerMCPClient
        await new LangChainMcpConnection(client).negotiateHttpProtocols()

        const [toolMeta] = await listMcpToolAppMetadata(client)
        const appData = registerMcpAppInstance({
            client,
            toolset: createToolset(),
            tool: {
                name: toolMeta.displayName,
                description: 'dashboard tool',
                metadata: { mcpApp: toolMeta }
            } as unknown as DynamicStructuredTool
        })
        const instance = getMcpAppInstance(appData!.appInstanceId)!

        await expect(readMcpAppResource(instance)).resolves.toEqual(
            expect.objectContaining({ text: '<html>dashboard</html>', title: 'Dashboard' })
        )
        await expect(callMcpAppTool(instance, 'dashboard', {})).resolves.toEqual(
            expect.objectContaining({ content: [{ type: 'text', text: 'refreshed' }] })
        )
        expect(getClient).not.toHaveBeenCalled()
        expect((global.fetch as jest.Mock).mock.calls.map(([, init]) => JSON.parse(String(init.body)).method)).toEqual([
            'server/discover',
            'tools/list',
            'resources/read',
            'tools/list',
            'tools/call'
        ])
        detachMcpAppInstancesForClient(client)
    })

    it('lists app metadata without cloning a stateful OAuth provider', async () => {
        const authProvider = {}
        Reflect.set(authProvider, 'manager', authProvider)
        const runtimeConfig = {
            mcpServers: {
                default: {
                    transport: 'http',
                    url: 'https://mcp.example.test/rpc',
                    authProvider
                }
            }
        }
        const client = {
            _config: runtimeConfig,
            get config() {
                return JSON.parse(JSON.stringify(runtimeConfig))
            },
            getClient: jest.fn().mockResolvedValue({
                listTools: jest.fn().mockResolvedValue({ tools: [] })
            })
        } as unknown as MultiServerMCPClient

        await expect(listMcpToolAppMetadata(client)).resolves.toEqual([])
    })
})
