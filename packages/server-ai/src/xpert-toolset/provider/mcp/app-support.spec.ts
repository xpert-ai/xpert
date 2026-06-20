import type { DynamicStructuredTool } from '@langchain/core/tools'
import type { MultiServerMCPClient } from '@langchain/mcp-adapters'
import type { IXpertToolset } from '@xpert-ai/contracts'
import { detachMcpAppInstancesForClient, getMcpAppInstance, registerMcpAppInstance } from './app-support'
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
})
