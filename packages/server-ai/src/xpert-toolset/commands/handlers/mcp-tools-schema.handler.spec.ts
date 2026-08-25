import { DynamicStructuredTool } from '@langchain/core/tools'
import { QueryBus } from '@nestjs/cqrs'
import { z } from 'zod'
import type { IXpertToolset } from '@xpert-ai/contracts'
import { XpertToolsetService } from '../../xpert-toolset.service'
import { createMCPClient } from '../../provider/mcp/types'
import { MCPToolsBySchemaCommand } from '../mcp-tools-schema.command'
import { MCPToolsBySchemaHandler } from './mcp-tools-schema.handler'

jest.mock('../../provider/mcp/types', () => ({
    createMCPClient: jest.fn()
}))

jest.mock('../../provider/mcp/pro', () => ({
    createProMCPClient: jest.fn()
}))

jest.mock('../../provider/mcp/plugin-managed-runtime', () => ({
    getPluginManagedMcpOptions: jest.fn((toolset: Partial<IXpertToolset>) => {
        const options = toolset.options
        return options?.pluginManaged === true && typeof options.pluginName === 'string'
            ? { pluginManaged: true, pluginName: options.pluginName, componentKey: options.componentKey }
            : null
    }),
    resolvePluginManagedMcpContract: jest.fn(() => ({
        componentKey: 'demo',
        pluginRoot: '/plugins/demo',
        pluginData: '/data/demo',
        server: { type: 'stdio', command: 'node', args: ['/plugins/demo/dist/mcp-server.js'] },
        policy: {
            enabledTools: ['demo_create', 'demo_validate', 'demo_apply', 'demo_compare']
        }
    }))
}))

function createTool(name: string) {
    return new DynamicStructuredTool({
        name,
        description: name,
        schema: z.object({}),
        func: async () => ({ ok: true })
    })
}

describe('MCPToolsBySchemaHandler', () => {
    it('applies the plugin-managed allowlist while discovering tools', async () => {
        const getTools = jest
            .fn()
            .mockResolvedValue([
                createTool('demo_create'),
                createTool('demo_validate'),
                createTool('demo_apply'),
                createTool('demo_compare'),
                createTool('demo_internal_debug')
            ])
        const close = jest.fn().mockResolvedValue(undefined)
        jest.mocked(createMCPClient).mockResolvedValue({
            client: { getTools, close },
            destroy: jest.fn().mockResolvedValue(undefined),
            logs: []
        } as never)

        const installedToolset: Partial<IXpertToolset> = {
            id: 'demo-toolset-1',
            workspaceId: 'workspace-1',
            schema: JSON.stringify({ mcpServers: { demo: { command: 'node' } } }),
            options: {
                pluginManaged: true,
                pluginName: '@xpert-ai/plugin-demo',
                componentKey: 'demo',
                disableToolDefault: true
            },
            tools: [
                { name: 'demo_create', enabled: true },
                { name: 'demo_validate', enabled: true },
                { name: 'demo_apply', enabled: true },
                { name: 'demo_compare', enabled: true }
            ]
        }
        const findOne = jest.fn().mockResolvedValue(installedToolset)
        const queryBus = { execute: jest.fn().mockResolvedValue({}) } as unknown as QueryBus
        const toolsetService = { isPro: () => false, findOne } as unknown as XpertToolsetService
        const handler = new MCPToolsBySchemaHandler(toolsetService, {} as never, queryBus)
        const toolset: Partial<IXpertToolset> = {
            id: 'demo-toolset-1',
            schema: JSON.stringify({ mcpServers: { attacker: { command: 'python' } } }),
            options: {
                pluginManaged: true,
                pluginName: '@xpert-ai/plugin-demo',
                componentKey: 'demo',
                disableToolDefault: false
            }
        }

        const result = await handler.execute(new MCPToolsBySchemaCommand(toolset))

        expect(result.tools.map((tool: { name: string }) => tool.name)).toEqual([
            'demo_create',
            'demo_validate',
            'demo_apply',
            'demo_compare'
        ])
        expect(findOne).toHaveBeenCalledWith('demo-toolset-1', { relations: ['tools'] })
        expect(createMCPClient).toHaveBeenCalledWith(installedToolset, expect.any(Object), {})
        expect(close).toHaveBeenCalled()
    })
})
