import { AiModelTypeEnum, FetchFrom, ModelFeature, ModelPropertyKey, ProviderModel } from '@xpert-ai/contracts'
import { providerModelDisplayTags, providerModelFilterTags } from './model-tags'

describe('model tag helpers', () => {
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
