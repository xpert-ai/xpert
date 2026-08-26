import { RequestContext } from '@xpert-ai/server-core'
import { Test, TestingModule } from '@nestjs/testing'
import { ToolRuntimeService } from '../../../tool-runtime'
import { ToolsetGetToolsCommand } from '../get-tools.command'
import { ToolsetGetToolsHandler } from './get-tools.handler'

describe('ToolsetGetToolsHandler', () => {
    let handler: ToolsetGetToolsHandler
    let loadToolsets: jest.Mock

    beforeEach(async () => {
        loadToolsets = jest.fn().mockResolvedValue([])
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ToolsetGetToolsHandler,
                {
                    provide: ToolRuntimeService,
                    useValue: { loadToolsets }
                }
            ]
        }).compile()
        handler = module.get(ToolsetGetToolsHandler)
    })

    afterEach(() => jest.restoreAllMocks())

    it('adapts the current Agent identity and environment to an explicit runtime request', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')

        await handler.execute(
            new ToolsetGetToolsCommand(['toolset-1'], {
                workspaceId: 'workspace-1',
                executionId: 'execution-1'
            })
        )

        expect(loadToolsets).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            workspaceId: 'workspace-1',
            principal: { type: 'user', id: 'user-1', userId: 'user-1' },
            toolsetIds: ['toolset-1'],
            executionId: 'execution-1'
        })
    })

    it('uses a named service principal for background runtime calls without a user', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(undefined)

        await handler.execute(new ToolsetGetToolsCommand(['toolset-1']))

        expect(loadToolsets).toHaveBeenCalledWith(
            expect.objectContaining({
                principal: { type: 'service_account', id: 'xpert-runtime' }
            })
        )
    })
})
