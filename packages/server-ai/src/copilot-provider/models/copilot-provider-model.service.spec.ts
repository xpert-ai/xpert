import { AiModelTypeEnum, defaultModelConfiguration } from '@xpert-ai/contracts'
import { CopilotProviderModelService } from './copilot-provider-model.service'

describe('CopilotProviderModelService model access lifecycle', () => {
    function createService() {
        const providerService = {
            findOne: jest.fn().mockResolvedValue({
                id: 'provider-1',
                copilotId: 'copilot-1',
                providerName: 'openai'
            })
        }
        const modelAccessService = {
            handleConfiguredModelDeleted: jest.fn().mockResolvedValue(undefined)
        }
        const validateCredentials = jest.fn().mockResolvedValue(undefined)
        const service = new CopilotProviderModelService(
            {} as never,
            providerService as never,
            { execute: jest.fn().mockResolvedValue({ getModelManager: () => ({ validateCredentials }) }) } as never,
            modelAccessService as never
        )
        return { modelAccessService, providerService, service, validateCredentials }
    }

    it('persists edited import parameters while retaining the original discovery identity on rename', async () => {
        const { service, validateCredentials } = createService()
        const previous = {
            id: 'model',
            providerId: 'provider-1',
            modelName: 'original',
            modelType: AiModelTypeEnum.LLM,
            modelProperties: {
                discovery_model_id: 'original',
                model_configuration: defaultModelConfiguration(AiModelTypeEnum.LLM)
            }
        }
        jest.spyOn(service, 'findOne').mockResolvedValue(previous as never)
        jest.spyOn(service, 'findOneByWhereOptions').mockRejectedValue(new Error('not found'))
        const update = jest.spyOn(service, 'update').mockResolvedValue({ affected: 1, generatedMaps: [], raw: [] })
        const configuration = {
            ...defaultModelConfiguration(AiModelTypeEnum.LLM),
            contextSize: 64000,
            maxConcurrency: 4
        }
        await service.upsertModel({
            id: 'model',
            providerId: 'provider-1',
            modelName: 'renamed',
            modelType: AiModelTypeEnum.LLM,
            modelProperties: { discovery_model_id: 'forged', model_configuration: configuration }
        })
        expect(update).toHaveBeenCalledWith(
            'model',
            expect.objectContaining({
                modelProperties: {
                    discovery_model_id: 'original',
                    configuration_source: 'manual',
                    model_configuration: configuration
                }
            })
        )
        expect(validateCredentials).toHaveBeenCalledWith(
            'renamed',
            expect.objectContaining({ model_configuration: configuration })
        )
    })

    it('rejects a configuration whose type differs from the saved model', async () => {
        const { service, validateCredentials } = createService()
        jest.spyOn(service, 'findOneByWhereOptions').mockRejectedValue(new Error('not found'))
        await expect(
            service.upsertModel({
                modelName: 'model',
                modelType: AiModelTypeEnum.RERANK,
                modelProperties: { model_configuration: defaultModelConfiguration(AiModelTypeEnum.LLM) }
            })
        ).rejects.toThrow()
        expect(validateCredentials).not.toHaveBeenCalled()
    })

    it('replaces an imported configuration with a manual override without creating another selector entry', async () => {
        const { service } = createService()
        const imported = {
            id: 'imported',
            providerId: 'provider-1',
            modelName: 'qwen3',
            modelType: AiModelTypeEnum.LLM,
            modelProperties: {
                endpoint_model_name: 'endpoint-id',
                discovery_model_id: 'qwen3',
                configuration_source: 'discovered',
                model_configuration: defaultModelConfiguration(AiModelTypeEnum.LLM)
            }
        }
        jest.spyOn(service, 'findOneByWhereOptions').mockResolvedValue(imported as never)
        jest.spyOn(service, 'findOne').mockResolvedValue(imported as never)
        const update = jest.spyOn(service, 'update').mockResolvedValue({ affected: 1, generatedMaps: [], raw: [] })
        const create = jest.spyOn(service, 'create')
        const configuration = { ...defaultModelConfiguration(AiModelTypeEnum.LLM), contextSize: 32000 }
        await service.upsertModel({
            providerId: 'provider-1',
            modelName: 'qwen3',
            modelType: AiModelTypeEnum.LLM,
            modelProperties: { model_configuration: configuration }
        })
        expect(update).toHaveBeenCalledWith(
            'imported',
            expect.objectContaining({
                modelProperties: {
                    endpoint_model_name: 'endpoint-id',
                    discovery_model_id: 'qwen3',
                    configuration_source: 'manual',
                    model_configuration: configuration
                }
            })
        )
        expect(create).not.toHaveBeenCalled()
    })

    it('closes pending requests and active grants for the exact deleted model', async () => {
        const { modelAccessService, service } = createService()
        jest.spyOn(service, 'findOne').mockResolvedValue({
            id: 'model-config-1',
            tenantId: 'tenant-1',
            providerId: 'provider-1',
            modelName: 'old-model',
            modelType: AiModelTypeEnum.LLM
        } as never)
        jest.spyOn(service, 'delete').mockResolvedValue({ affected: 1, raw: [] })

        await service.deleteModel('model-config-1')

        expect(modelAccessService.handleConfiguredModelDeleted).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            copilotId: 'copilot-1',
            copilotModelId: 'old-model',
            modelType: AiModelTypeEnum.LLM
        })
    })

    it('does not transfer old model access when a model configuration is renamed', async () => {
        const { modelAccessService, service } = createService()
        jest.spyOn(service, 'findOne')
            .mockResolvedValueOnce({
                id: 'model-config-1',
                tenantId: 'tenant-1',
                providerId: 'provider-1',
                modelName: 'old-model',
                modelType: AiModelTypeEnum.LLM
            } as never)
            .mockResolvedValueOnce({
                id: 'model-config-1',
                tenantId: 'tenant-1',
                providerId: 'provider-1',
                modelName: 'new-model',
                modelType: AiModelTypeEnum.LLM
            } as never)
        jest.spyOn(service, 'findOneByWhereOptions').mockRejectedValue(new Error('not found'))
        jest.spyOn(service, 'update').mockResolvedValue({ affected: 1, generatedMaps: [], raw: [] })

        await service.upsertModel({
            id: 'model-config-1',
            providerId: 'provider-1',
            modelName: 'new-model',
            modelType: AiModelTypeEnum.LLM
        })

        expect(modelAccessService.handleConfiguredModelDeleted).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            copilotId: 'copilot-1',
            copilotModelId: 'old-model',
            modelType: AiModelTypeEnum.LLM
        })
    })
})
