import { AiModelTypeEnum, defaultModelConfiguration, DiscoveredModel } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ModelDiscoveryService } from './model-discovery.service'
import { CopilotProviderModel } from '../models/copilot-provider-model.entity'

describe('model discovery incremental import', () => {
    const provider = {
        id: 'provider',
        tenantId: 'tenant',
        organizationId: 'org',
        providerName: 'xirang',
        credentials: { app_key: 'test' }
    }
    const configuration = defaultModelConfiguration(AiModelTypeEnum.LLM)
    const discovered: DiscoveredModel[] = ['qwen3', 'qwen-new'].map((model) => ({
        model,
        label: model,
        modelType: AiModelTypeEnum.LLM,
        typeSource: 'name',
        configuration,
        modelProperties: { endpoint_model_name: model }
    }))

    function setup(existing: Partial<CopilotProviderModel>[] = []) {
        const rows = existing.map((row) => Object.assign(new CopilotProviderModel(), row))
        const current = { ...provider, options: { unrelated: true } }
        const manager = {
            findOne: jest.fn().mockResolvedValue(current),
            find: jest.fn().mockImplementation(async () => [...rows]),
            create: jest.fn((_entity, input) => Object.assign(new CopilotProviderModel(), input)),
            update: jest.fn(async (_entity, _id, patch) => Object.assign(current, patch)),
            save: jest.fn(async (_entity, additions: CopilotProviderModel[]) => {
                rows.push(...additions)
                return additions
            })
        }
        const discoverModels = jest.fn().mockResolvedValue(discovered)
        const strategy = {
            discoverModels,
            getProviderSchema: () => ({ supported_model_types: ['llm', 'text-embedding', 'rerank'] }),
            getModelManager: jest.fn()
        }
        const service = new ModelDiscoveryService(
            { findOneInOrganizationOrTenant: jest.fn().mockResolvedValue(provider) } as never,
            { getProvider: () => strategy } as never,
            { getRepository: () => ({ find: manager.find }), transaction: async (work) => work(manager) } as never
        )
        return { service, manager, rows, discoverModels, current }
    }

    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
    })
    afterEach(() => jest.restoreAllMocks())

    it('adds only new IDs, preserves renamed/edited models and models removed upstream, and is idempotent', async () => {
        const existing = [
            {
                modelName: 'renamed',
                modelProperties: {
                    discovery_model_id: 'qwen3',
                    model_configuration: { ...configuration, contextSize: 99999 }
                }
            },
            { modelName: 'removed-upstream', modelProperties: { endpoint_model_name: 'keep' } }
        ]
        const { service, rows, manager } = setup(existing)
        const original = JSON.stringify(rows)
        const preview = await service.discover('provider')
        expect(preview.models.map((model) => model.configured)).toEqual([true, false])
        const input = { models: discovered.map((model) => ({ model: model.model, configuration })) }
        await expect(service.importModels('provider', input)).resolves.toEqual({ added: 1, skipped: 1 })
        await expect(service.importModels('provider', input)).resolves.toEqual({ added: 0, skipped: 2 })
        expect(JSON.stringify(rows.slice(0, 2))).toBe(original)
        expect(rows[2]).toMatchObject({
            tenantId: 'tenant',
            organizationId: 'org',
            modelName: 'qwen-new',
            modelProperties: {
                endpoint_model_name: 'qwen-new',
                discovery_model_id: 'qwen-new',
                configuration_source: 'discovered',
                model_configuration: configuration
            }
        })
        expect(manager.findOne).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ lock: { mode: 'pessimistic_write' } })
        )
        expect(manager.save).toHaveBeenCalledTimes(1)
    })

    it('keeps manual overrides ahead of the latest API and YAML suggestions', async () => {
        const manualConfiguration = { ...configuration, contextSize: 64000 }
        const { service, rows, manager } = setup([
            {
                modelName: 'qwen3',
                modelType: AiModelTypeEnum.LLM,
                modelProperties: {
                    discovery_model_id: 'qwen3',
                    configuration_source: 'manual',
                    model_configuration: manualConfiguration
                }
            }
        ])
        const before = JSON.stringify(rows)
        expect((await service.discover('provider')).models[0]).toMatchObject({
            source: 'manual',
            configuration: manualConfiguration
        })
        await service.importModels('provider', { models: [{ model: 'qwen3', configuration }] })
        expect(JSON.stringify(rows)).toBe(before)
        expect(manager.save).not.toHaveBeenCalled()
    })

    it('rejects IDs that disappeared before saving without partially importing', async () => {
        const { service, manager } = setup()
        await expect(
            service.importModels('provider', {
                models: [
                    { model: 'qwen-new', configuration },
                    { model: 'unavailable', configuration }
                ]
            })
        ).rejects.toThrow()
        expect(manager.save).not.toHaveBeenCalled()
    })

    it('previews saved parameters and keeps missing imported models editable without changing the snapshot', async () => {
        const { service, manager } = setup([
            {
                id: 'saved',
                modelName: 'renamed',
                modelType: AiModelTypeEnum.RERANK,
                modelProperties: {
                    discovery_model_id: 'qwen3',
                    model_configuration: defaultModelConfiguration(AiModelTypeEnum.RERANK)
                }
            },
            { id: 'missing', modelName: 'old', modelProperties: { discovery_model_id: 'old' } }
        ])
        const result = await service.discover('provider')
        expect(result.models[0]).toMatchObject({
            configuredModelId: 'saved',
            label: 'renamed',
            modelType: 'rerank',
            source: 'discovered',
            available: true,
            configuration: { modelType: 'rerank' }
        })
        expect(result.models[2]).toMatchObject({ configuredModelId: 'missing', available: false })
        expect(manager.update).not.toHaveBeenCalled()
    })

    it('allows a zero-addition sync, saves an empty successful snapshot and preserves it on failure', async () => {
        const { service, manager, discoverModels, current, rows } = setup([
            { modelName: 'old', modelProperties: { discovery_model_id: 'old', model_configuration: configuration } }
        ])
        discoverModels.mockResolvedValue([])
        await expect(service.importModels('provider', { models: [] })).resolves.toEqual({ added: 0, skipped: 0 })
        expect(current.options).toMatchObject({
            unrelated: true,
            modelDiscovery: { mode: 'configured', availableModelIds: [] }
        })
        expect(rows).toHaveLength(1)
        expect(manager.save).not.toHaveBeenCalled()
        discoverModels.mockRejectedValue(new Error('upstream unavailable'))
        await expect(service.importModels('provider', { models: [] })).rejects.toThrow('upstream unavailable')
        expect(manager.update).toHaveBeenCalledTimes(1)
    })

    it('rejects inherited providers outside the editing organization before using credentials', async () => {
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('another-org')
        const { service, discoverModels } = setup()
        await expect(service.discover('provider')).rejects.toThrow()
        expect(discoverModels).not.toHaveBeenCalled()
    })
})
