import { XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { AgentMiddlewareRuntimeService } from '../../../shared/agent/middleware-runtime.service'
import { createBuiltinToolset, XpertToolsetService } from '../../../xpert-toolset'
import { ToolInvokeCommand } from '../tool-invoke.command'
import { ToolInvokeHandler } from './tool-invoke.handler'

jest.mock('../../../xpert-toolset', () => ({
    ...jest.requireActual('../../../xpert-toolset'),
    createBuiltinToolset: jest.fn()
}))

describe('ToolInvokeHandler model runtime', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('injects the host model client into manually invoked built-in tools', async () => {
        const createModelClient = jest.fn()
        const createScopedApi = jest.fn().mockReturnValue({ createModelClient })
        const invoke = jest.fn().mockResolvedValue('ok')
        const createBuiltinToolsetMock = jest.mocked(createBuiltinToolset).mockResolvedValue({
            initTools: jest.fn(),
            getTool: jest.fn().mockReturnValue({ invoke })
        } as never)
        const module = await Test.createTestingModule({
            providers: [
                ToolInvokeHandler,
                { provide: CommandBus, useValue: { execute: jest.fn() } },
                { provide: QueryBus, useValue: { execute: jest.fn().mockResolvedValue({ API_HOST: 'test' }) } },
                { provide: XpertToolsetService, useValue: {} },
                { provide: AgentMiddlewareRuntimeService, useValue: { createScopedApi } }
            ]
        }).compile()
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')

        await module.get(ToolInvokeHandler).execute(
            new ToolInvokeCommand({
                name: 'generate',
                schema: { parameters: [] },
                parameters: {},
                toolset: {
                    id: 'toolset-1',
                    workspaceId: 'workspace-1',
                    name: 'Model tool',
                    type: 'model-tool',
                    category: XpertToolsetCategoryEnum.BUILTIN
                }
            })
        )

        expect(createScopedApi).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            userId: 'user-1',
            workspaceId: 'workspace-1',
            xpertId: undefined,
            agentKey: undefined
        })
        expect(createBuiltinToolsetMock).toHaveBeenCalledWith(
            'model-tool',
            expect.any(Object),
            expect.objectContaining({
                modelRuntime: {
                    createModelClient
                }
            })
        )
        expect(invoke).toHaveBeenCalled()
    })
})
