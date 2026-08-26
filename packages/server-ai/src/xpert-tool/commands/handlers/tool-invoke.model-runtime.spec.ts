import { XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { ToolRuntimeService } from '../../../tool-runtime'
import { ToolInvokeCommand } from '../tool-invoke.command'
import { ToolInvokeHandler } from './tool-invoke.handler'

describe('ToolInvokeHandler model runtime', () => {
    afterEach(() => jest.restoreAllMocks())

    it('delegates model-backed built-ins without constructing a second model runtime', async () => {
        const executeTool = jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] })
        const module = await Test.createTestingModule({
            providers: [
                ToolInvokeHandler,
                { provide: QueryBus, useValue: { execute: jest.fn().mockResolvedValue({ API_HOST: 'test' }) } },
                { provide: ToolRuntimeService, useValue: { executeTool } }
            ]
        }).compile()
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user-1' } as never)

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

        expect(executeTool).toHaveBeenCalledWith(
            expect.objectContaining({
                source: 'api',
                toolsetId: 'toolset-1',
                toolName: 'generate',
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                workspaceId: 'workspace-1'
            })
        )
    })
})
