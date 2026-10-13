import { AiModelTypeEnum, FetchFrom, ModelFeature, ModelPropertyKey, ProviderModel } from '@xpert-ai/contracts'
import { providerModelDisplayTags, providerModelFilterTags, customProviderModelDisplayTags } from './model-tags'

describe('model tag helpers', () => {
  it('uses saved imported context and capabilities instead of legacy properties', () => {
    expect(
      customProviderModelDisplayTags({
        modelType: AiModelTypeEnum.LLM,
        modelProperties: {
          context_size: 8192,
          vision_support: 'support',
          model_configuration: {
            modelType: AiModelTypeEnum.LLM,
            contextSize: 64000,
            maxOutputTokens: 4096,
            defaultMaxTokens: 2048,
            maxConcurrency: 1,
            features: []
          }
        }
      }).map((tag) => tag.defaultText)
    ).toEqual(['LLM', 'CHAT', '64K'])
  })
  const model: ProviderModel = {
    model: 'vision-tool-model',
    label: {},
    model_type: AiModelTypeEnum.LLM,
    fetch_from: FetchFrom.PREDEFINED_MODEL,
    model_properties: {
      [ModelPropertyKey.MODE]: 'chat',
      [ModelPropertyKey.CONTEXT_SIZE]: 128000
    },
    features: [ModelFeature.TOOL_CALL, ModelFeature.MULTI_TOOL_CALL, ModelFeature.VISION]
  }

  it('hides common tool-call feature tags while keeping model and visible capability tags', () => {
    expect(providerModelDisplayTags(model).map((tag) => tag.defaultText)).toEqual(['LLM', 'CHAT', '128K', 'VISION'])
  })

  it('excludes common tool-call features from filter tags', () => {
    expect(providerModelFilterTags(model).map((tag) => tag.id)).toEqual([
      'model-type:LLM',
      'model-mode:CHAT',
      'context-size:128K',
      'feature:vision'
    ])
  })
})
