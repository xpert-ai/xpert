import { AiModelTypeEnum, DefaultModelRole } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { CopilotModelCatalogMode } from '../copilot-model-find.query'
import { CopilotOneByRoleQuery } from '../get-one-by-role.query'
import { ResolveDefaultModelQuery } from '../resolve-default-model.query'
import { CopilotOneByRoleHandler } from './get-one-by-role.handler'

describe('default model query', () => {
    const binding = { copilotId: 'connection', model: 'selected-model', modelType: AiModelTypeEnum.LLM }
    const connection = {
        id: binding.copilotId,
        role: 'embedding',
        modelProvider: { isValid: true },
        providerWithModels: { models: [{ model: binding.model, model_type: binding.modelType }] }
    }
    const service = { findAllEnabledCopilotsWithoutMembership: jest.fn() }
    const queryBus = { execute: jest.fn() }
    const defaults = { resolve: jest.fn() }
    const handler = new CopilotOneByRoleHandler(service as never, queryBus as never, defaults as never)
    const query = () => new ResolveDefaultModelQuery('tenant', 'organization', DefaultModelRole.Primary)

    beforeEach(() => {
        jest.resetAllMocks()
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization')
        defaults.resolve.mockResolvedValue({ configured: true, binding })
        service.findAllEnabledCopilotsWithoutMembership.mockResolvedValue([connection])
        queryBus.execute.mockResolvedValue([connection])
    })
    afterEach(() => jest.restoreAllMocks())

    it('keeps the old query import as the same CQRS constructor', () => {
        expect(CopilotOneByRoleQuery).toBe(ResolveDefaultModelQuery)
    })
    it('resolves an authorized binding independently of the legacy connection role', async () => {
        await expect(handler.execute(query())).resolves.toEqual({ ...connection, copilotModel: binding })
        expect(defaults.resolve).toHaveBeenCalledWith('tenant', 'organization', DefaultModelRole.Primary)
        expect(queryBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                type: AiModelTypeEnum.LLM,
                catalogMode: CopilotModelCatalogMode.Available
            })
        )
    })
    it('does not expose a default denied by the governed catalog', async () => {
        queryBus.execute.mockResolvedValue([{ ...connection, providerWithModels: { models: [{ model: 'other' }] } }])
        await expect(handler.execute(query())).resolves.toBeNull()
        queryBus.execute.mockResolvedValue([{ ...connection, id: 'different-connection' }])
        await expect(handler.execute(query())).resolves.toBeNull()
    })
    it.each(['different-organization', null])('rejects a mismatched request organization: %s', async (scope) => {
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope)
        await expect(handler.execute(query())).resolves.toBeNull()
        expect(queryBus.execute).not.toHaveBeenCalled()
    })
    it('rejects another tenant request', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('different-tenant')
        await expect(handler.execute(query())).resolves.toBeNull()
        expect(queryBus.execute).not.toHaveBeenCalled()
    })
    it('uses trusted background scope and still requires an enabled connection', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(null)
        await expect(handler.execute(query())).resolves.toEqual({ ...connection, copilotModel: binding })
        expect(queryBus.execute).not.toHaveBeenCalled()
        service.findAllEnabledCopilotsWithoutMembership.mockResolvedValue([])
        await expect(handler.execute(query())).resolves.toBeNull()
    })
    it('resolves realtime by its purpose and rejects missing or incorrectly typed bindings', async () => {
        const realtime = { ...binding, model: 'realtime', modelType: AiModelTypeEnum.REALTIME }
        const catalog = {
            ...connection,
            providerWithModels: { models: [{ model: realtime.model, model_type: realtime.modelType }] }
        }
        queryBus.execute.mockResolvedValue([catalog])
        defaults.resolve.mockResolvedValue({ binding: realtime })
        const request = new ResolveDefaultModelQuery('tenant', 'organization', DefaultModelRole.Realtime)
        expect(await handler.execute(request)).toMatchObject({ copilotModel: realtime })
        defaults.resolve.mockResolvedValue({ binding: null })
        expect(await handler.execute(request)).toBeNull()
        defaults.resolve.mockResolvedValue({ binding })
        expect(await handler.execute(request)).toBeNull()
    })
})
