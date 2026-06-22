import type { DynamicStructuredTool } from '@langchain/core/tools'
import type { MultiServerMCPClient } from '@langchain/mcp-adapters'
import type { IXpertToolset } from '@xpert-ai/contracts'
import {
    detachMcpAppInstancesForClient,
    getMcpAppInstance,
    registerMcpAppInstance,
    verifyMcpAppInstanceToken
} from './app-support'
import { mcpStdioRuntimeManager } from './mcp-stdio-runtime'

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
    beforeEach(() => {
        process.env.XPERT_MCP_APPS_ENABLED = 'true'
    })

    afterEach(() => {
        delete process.env.XPERT_MCP_APPS_ENABLED
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

    it('allows signed expired tokens to be validated only when expiration is explicitly ignored', () => {
        jest.useFakeTimers()
        jest.setSystemTime(new Date('2026-06-20T11:52:24.000Z'))

        const client = {} as MultiServerMCPClient
        const toolset = createToolset()
        const app = registerMcpAppInstance({
            client,
            toolset,
            tool: createTool('wiki_links', 'ui://wiki-explorer/mcp-app.html'),
            toolCallId: 'call_1'
        })

        expect(app?.appInstanceToken).toBeTruthy()

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
})
