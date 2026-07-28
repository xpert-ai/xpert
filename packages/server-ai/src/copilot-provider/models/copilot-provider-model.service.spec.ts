import { AiModelTypeEnum } from '@xpert-ai/contracts'
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
        const service = new CopilotProviderModelService(
            {} as never,
            providerService as never,
            { execute: jest.fn() } as never,
            modelAccessService as never
        )
        return { modelAccessService, providerService, service }
    }

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
