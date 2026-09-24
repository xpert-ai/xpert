import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { MCPServerType, XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { ToolRuntimeService } from './tool-runtime.service'
import { XpertToolset } from '../xpert-toolset/xpert-toolset.entity'
import { AgentMiddlewareRuntimeService } from '../shared/agent/middleware-runtime'
import { McpSubscriptionService } from '../mcp-publication/mcp-subscription.service'
import { createMCPClient } from '../xpert-toolset/provider/mcp/types'
import { getExecutionContext, withExecutionContext } from '../shared/agent/execution-context'

jest.mock('../xpert-toolset/provider/mcp/types', () => ({
    createMCPClient: jest.fn().mockRejectedValue(new Error('factory reached'))
}))
jest.mock('@xpert-ai/server-config', () => ({
    ...jest.requireActual('@xpert-ai/server-config'),
    environment: { ...jest.requireActual('@xpert-ai/server-config').environment, pro: false }
}))

describe('ToolRuntimeService sandbox propagation', () => {
    it('keeps MCP initialization in the host scope without passing sandbox parameters', async () => {
        const sandbox = {
            provider: 'local-shell-sandbox',
            workingDirectory: '/tmp/xpert-workspace',
            backend: { id: 'local-backend', execute: jest.fn() }
        }
        const toolset = Object.assign(new XpertToolset(), {
            id: 'mcp-1',
            name: 'Sales',
            category: XpertToolsetCategoryEnum.MCP,
            tenantId: 'tenant-1',
            workspaceId: 'workspace-1',
            schema: JSON.stringify({ servers: { sales: { type: MCPServerType.STDIO, command: 'python3' } } })
        })
        const service = new ToolRuntimeService(
            { find: jest.fn().mockResolvedValue([toolset]) } as unknown as Repository<XpertToolset>,
            null,
            { execute: jest.fn() } as unknown as CommandBus,
            { execute: jest.fn() } as unknown as QueryBus,
            {
                createScopedApi: jest.fn().mockReturnValue({
                    createModelClient: jest.fn(),
                    getModelProvider: jest.fn()
                })
            } as unknown as AgentMiddlewareRuntimeService,
            { eventsApiForToolset: jest.fn() } as unknown as McpSubscriptionService,
            null
        )
        const [runtime] = await service.loadToolsets({
            tenantId: 'tenant-1',
            workspaceId: 'workspace-1',
            xpertId: 'sales',
            principal: { type: 'user', id: 'user-1', userId: 'user-1' },
            toolsetIds: ['mcp-1']
        })
        jest.mocked(createMCPClient).mockImplementationOnce(async () => {
            expect(getExecutionContext()?.sandbox).toBe(sandbox)
            throw new Error('factory reached')
        })
        await expect(withExecutionContext({ sandbox }, () => runtime.initTools())).rejects.toThrow('factory reached')
        const context = jest.mocked(createMCPClient).mock.calls[0]?.[4]
        expect(context).not.toHaveProperty('sandbox')
        expect(getExecutionContext()).toBeUndefined()
    })
})
