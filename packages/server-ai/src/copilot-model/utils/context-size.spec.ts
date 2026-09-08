import { AiModelTypeEnum, FetchFrom, ICopilotModel, ModelPropertyKey } from '@xpert-ai/contracts'
import { ensureCopilotModelContextSize } from './context-size'

describe('effective model context size', () => {
    const provider = {
        getProviderModels: () => [
            {
                model: 'test',
                model_type: AiModelTypeEnum.LLM,
                fetch_from: FetchFrom.PREDEFINED_MODEL,
                label: { en_US: 'Test' },
                model_properties: { [ModelPropertyKey.CONTEXT_SIZE]: 32768 }
            }
        ]
    }
    it.each(['override', 'snapshot', undefined] as const)('preserves %s saved context values', (source) => {
        const model: ICopilotModel = {
            model: 'test',
            modelType: AiModelTypeEnum.LLM,
            options: { context_size: 16000, context_size_source: source }
        }
        expect(ensureCopilotModelContextSize(model, provider, 'test')).toBe(16000)
    })
    it('refreshes only provider-derived values and tags newly inferred values', () => {
        for (const options of [{ context_size: 16000, context_size_source: 'provider' as const }, undefined]) {
            const model: ICopilotModel = { model: 'test', modelType: AiModelTypeEnum.LLM, options }
            expect(ensureCopilotModelContextSize(model, provider, 'test')).toBe(32768)
            expect(model.options?.context_size_source).toBe('provider')
        }
    })
})
