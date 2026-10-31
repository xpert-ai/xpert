import { AiModelTypeEnum, ICopilotProviderModel } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { CopilotProviderModelService } from '../../../copilot-provider/models/copilot-provider-model.service'
import { CopilotModelCatalogMode, FindCopilotModelsQuery } from '../copilot-model-find.query'
import { FindCopilotModelsHandler } from './copilot-model-find.handler'

describe('configured model lifecycle and selector catalog', () => {
    afterEach(() => jest.restoreAllMocks())

    function setup(mode: CopilotModelCatalogMode, configuredOnly = false) {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        let models: ICopilotProviderModel[] = ['a', 'c', 'd'].map((modelName) => ({
            id: modelName,
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            providerId: 'provider-1',
            modelName,
            modelType: AiModelTypeEnum.LLM,
            modelProperties: {}
        }))
        const provider = {
            id: 'provider-1',
            copilotId: 'copilot-1',
            providerName: 'openai-compatible',
            options: configuredOnly
                ? { modelDiscovery: { mode: 'configured', syncedAt: '', availableModelIds: [] } }
                : {}
        }
        const savedSelection = { model: 'a', modelType: AiModelTypeEnum.LLM }
        const access = {
            handleConfiguredModelDeleted: jest.fn().mockResolvedValue(undefined),
            canUseCatalogModels: jest.fn().mockImplementation(async ({ models }) => models.map(() => true))
        }
        const service = new CopilotProviderModelService(
            {} as never,
            { findOne: jest.fn().mockResolvedValue(provider) } as never,
            {} as never,
            access as never
        )
        jest.spyOn(service, 'findOne').mockImplementation(
            async (id) => models.find((model) => model.id === id) as never
        )
        jest.spyOn(service, 'findOneByWhereOptions').mockRejectedValue(new Error('not found'))
        jest.spyOn(service, 'update').mockImplementation(async (id, update) => {
            models = models.map((model) =>
                model.id === id ? ({ ...model, ...update } as ICopilotProviderModel) : model
            )
            return { affected: 1, generatedMaps: [], raw: [] }
        })
        jest.spyOn(service, 'delete').mockImplementation(async (id) => {
            models = models.filter((model) => model.id !== id)
            return { affected: 1, raw: [] }
        })
        const handler = new FindCopilotModelsHandler(
            { execute: jest.fn().mockImplementation(async () => models) } as never,
            {
                findAllEnabledCopilotsWithoutMembership: jest.fn().mockImplementation(async () => [
                    {
                        id: 'copilot-1',
                        copilotModel: savedSelection,
                        modelProvider: provider
                    }
                ])
            } as never,
            {
                getProvider: () => ({
                    getProviderModels: () => [],
                    getProviderSchema: () => ({ provider: provider.providerName })
                })
            } as never,
            access as never,
            { resolve: async () => ({ configured: false, binding: null }) } as never
        )
        Object.defineProperty(handler, 'configService', { value: { get: () => 'http://localhost:3000' } })
        const catalog = async () =>
            (await handler.execute(new FindCopilotModelsQuery(AiModelTypeEnum.LLM, mode))).flatMap((copilot) =>
                copilot.providerWithModels.models.map((model) => model.model)
            )
        return {
            service,
            access,
            savedSelection,
            catalog,
            configuredNames: () => models.map((model) => model.modelName)
        }
    }

    it.each([
        [CopilotModelCatalogMode.Management, false],
        [CopilotModelCatalogMode.Available, false],
        [CopilotModelCatalogMode.Management, true],
        [CopilotModelCatalogMode.Available, true]
    ] as const)(
        'keeps renamed configurations and %s selectors consistent (configured-only: %s)',
        async (mode, configuredOnly) => {
            const { service, access, savedSelection, catalog, configuredNames } = setup(mode, configuredOnly)
            expect(await catalog()).toEqual(['a', 'c', 'd'])
            await service.upsertModel({
                id: 'a',
                providerId: 'provider-1',
                modelName: 'b',
                modelType: AiModelTypeEnum.LLM
            })
            expect(configuredNames()).toEqual(['b', 'c', 'd'])
            expect(await catalog()).toEqual(configuredNames())
            // Reloading the catalog cannot make the unresolved historical reference selectable again.
            expect(await catalog()).toEqual(['b', 'c', 'd'])
            expect(savedSelection.model).toBe('a')
            expect(access.handleConfiguredModelDeleted).toHaveBeenCalledWith({
                tenantId: 'tenant-1',
                copilotId: 'copilot-1',
                copilotModelId: 'a',
                modelType: AiModelTypeEnum.LLM
            })
        }
    )

    it.each(['a', 'c'])('does not restore a deleted configuration (%s) from the saved selection', async (id) => {
        const { service, catalog, configuredNames } = setup(CopilotModelCatalogMode.Management)
        await service.deleteModel(id)
        expect(await catalog()).toEqual(configuredNames())
        expect(await catalog()).not.toContain(id)
    })

    it('preserves the valid default when an unselected model is renamed', async () => {
        const { service, savedSelection, catalog } = setup(CopilotModelCatalogMode.Management)
        await service.upsertModel({ id: 'c', providerId: 'provider-1', modelName: 'b', modelType: AiModelTypeEnum.LLM })
        expect(await catalog()).toEqual(['a', 'b', 'd'])
        expect(savedSelection.model).toBe('a')
    })

    it('returns no selectable models after all configured models are deleted', async () => {
        const { service, catalog } = setup(CopilotModelCatalogMode.Management)
        for (const id of ['a', 'c', 'd']) await service.deleteModel(id)
        expect(await catalog()).toEqual([])
    })
})
