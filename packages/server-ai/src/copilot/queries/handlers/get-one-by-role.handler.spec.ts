import { AiModelTypeEnum, AiProviderRole } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { CopilotModelCatalogMode } from '../copilot-model-find.query'
import { CopilotOneByRoleQuery } from '../get-one-by-role.query'
import { CopilotOneByRoleHandler } from './get-one-by-role.handler'

describe('CopilotOneByRoleHandler', () => {
    const primary = {
        id: 'primary',
        role: AiProviderRole.Primary,
        copilotModel: { model: 'selected-model', modelType: AiModelTypeEnum.LLM },
        providerWithModels: { models: [{ model: 'selected-model' }] }
    }
    const service = { findAllAvailablesCopilots: jest.fn(), findAllEnabledCopilotsWithoutMembership: jest.fn() }
    const queryBus = { execute: jest.fn() }
    const handler = new CopilotOneByRoleHandler(service as never, queryBus as never)
    const query = () => new CopilotOneByRoleQuery('tenant', 'organization', AiProviderRole.Primary)

    beforeEach(() => {
        jest.resetAllMocks()
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization')
        service.findAllAvailablesCopilots.mockResolvedValue([])
        service.findAllEnabledCopilotsWithoutMembership.mockResolvedValue([primary])
        queryBus.execute.mockResolvedValue([primary])
    })
    afterEach(() => jest.restoreAllMocks())

    it('resolves an authorized default model when the legacy membership lookup is empty', async () => {
        await expect(handler.execute(query())).resolves.toEqual(primary)
        expect(queryBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                type: AiModelTypeEnum.LLM,
                catalogMode: CopilotModelCatalogMode.Available
            })
        )
    })

    it('does not expose a default that the governed model catalog denies', async () => {
        queryBus.execute.mockResolvedValue([{ ...primary, providerWithModels: { models: [{ model: 'other' }] } }])
        await expect(handler.execute(query())).resolves.toBeNull()
    })

    it('does not expose an inaccessible copilot or a different role', async () => {
        queryBus.execute.mockResolvedValue([{ ...primary, id: 'different-role-copilot' }])
        await expect(handler.execute(query())).resolves.toBeNull()
        queryBus.execute.mockResolvedValue([])
        await expect(handler.execute(query())).resolves.toBeNull()
    })

    it.each(['different-organization', null])('does not reuse a mismatched request organization: %s', async (scope) => {
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope)
        await expect(handler.execute(query())).resolves.toBeNull()
        expect(queryBus.execute).not.toHaveBeenCalled()
    })

    it('does not reuse another tenant request', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('different-tenant')
        await expect(handler.execute(query())).resolves.toBeNull()
        expect(queryBus.execute).not.toHaveBeenCalled()
    })

    it('preserves background role lookup without relying on a request user', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(null)
        service.findAllAvailablesCopilots.mockResolvedValue([primary])
        await expect(handler.execute(query())).resolves.toEqual(primary)
        expect(queryBus.execute).not.toHaveBeenCalled()
        service.findAllAvailablesCopilots.mockResolvedValue([])
        await expect(handler.execute(query())).resolves.toBeNull()
    })
})
