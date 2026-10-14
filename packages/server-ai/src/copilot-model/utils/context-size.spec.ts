import { AiModelTypeEnum, defaultModelConfiguration, ICopilotModel } from '@xpert-ai/contracts'
import { ensureCopilotModelContextSize } from './context-size'

describe('imported model context', () => {
    it('uses the edited context ahead of legacy and catalog values', () => {
        const model: ICopilotModel = { model: 'qwen3', modelType: AiModelTypeEnum.LLM }
        const provider = { getProviderModels: () => [{ model: 'qwen3', model_properties: { context_size: 128000 } }] }
        expect(
            ensureCopilotModelContextSize(model, provider as never, 'qwen3', [
                {
                    modelProperties: {
                        context_size: 8192,
                        model_configuration: { ...defaultModelConfiguration(AiModelTypeEnum.LLM), contextSize: 64000 }
                    }
                }
            ])
        ).toBe(64000)
        expect(model.options.context_size).toBe(64000)
    })
})
