import { XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { MANAGED_QUEUE_SERVICE_TOKEN } from '@xpert-ai/plugin-sdk'
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
        const getModelProvider = jest.fn().mockResolvedValue({
            providerScopeId: 'provider-scope-1',
            copilotId: 'copilot-1',
            provider: 'model-provider',
            authorization: 'Bearer secret',
            reportUsage: jest.fn()
        })
        const createScopedApi = jest.fn().mockReturnValue({ createModelClient, getModelProvider })
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
                { provide: AgentMiddlewareRuntimeService, useValue: { createScopedApi } },
                { provide: MANAGED_QUEUE_SERVICE_TOKEN, useValue: { enqueue: jest.fn() } }
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
                    createModelClient,
                    getModelProvider: expect.any(Function)
                },
                managedQueue: expect.objectContaining({ enqueue: expect.any(Function) })
            })
        )
        const params = createBuiltinToolsetMock.mock.calls[0][2]
        const provider = await params?.modelRuntime?.getModelProvider?.('model-provider')
        expect(provider).toEqual(expect.objectContaining({ reportUsage: expect.any(Function) }))
        const invocationConfig = invoke.mock.calls[0][1]
        expect(invocationConfig).toEqual({
            configurable: expect.objectContaining({ tool_call_id: expect.any(String) })
        })
    })
})
