import {
  AIModelEntity,
  AiModelTypeEnum,
  FetchFrom,
  ModelFeature,
  ParameterType,
  defaultModelConfiguration
} from '@xpert-ai/contracts'
import { discoverOpenAIModels } from './model-discovery'
import { applyModelConfiguration } from './model-configuration'

const known: AIModelEntity = {
  model: 'qwen3',
  label: { en_US: 'Qwen' },
  model_type: AiModelTypeEnum.LLM,
  fetch_from: FetchFrom.PREDEFINED_MODEL,
  model_properties: { context_size: 65536 },
  features: [ModelFeature.TOOL_CALL],
  parameter_rules: [
    { name: 'max_tokens', type: ParameterType.INT, label: { en_US: 'Output' }, max: 8192, default: 4096 }
  ]
}

describe('OpenAI-compatible model discovery', () => {
  const options = { baseUrl: 'https://example.test/v1/', authorization: 'Bearer test' }
  afterEach(() => jest.restoreAllMocks())

  it('deduplicates active models, suggests three types, and leaves opaque/unsupported names unclassified', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: 'qwen3' },
            { id: 'qwen3-rerank' },
            { id: 'text-embedding-v4' },
            { id: 'qwen3' },
            { id: 'opaque-id' },
            { id: 'qwen-image' },
            { id: 'disabled', active: false },
            { id: 'speech', model_type: 'tts' }
          ]
        })
      )
    )
    const models = await discoverOpenAIModels({ ...options, predefinedModels: [known] })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer test', Accept: 'application/json' }
      })
    )
    expect(models.map(({ model, modelType }) => [model, modelType])).toEqual([
      ['qwen3', 'llm'],
      ['qwen3-rerank', 'rerank'],
      ['text-embedding-v4', 'text-embedding'],
      ['opaque-id', null],
      ['qwen-image', null]
    ])
    expect(models[0].configuration).toMatchObject({ contextSize: 65536, maxOutputTokens: 8192, defaultMaxTokens: 4096 })
    expect(models[1].typeSource).toBe('name')
  })

  it('rejects malformed responses and failed authorization without treating them as an empty list', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'))
    await expect(discoverOpenAIModels(options)).rejects.toThrow()
    fetchMock.mockResolvedValue(new Response('secret error body', { status: 401 }))
    await expect(discoverOpenAIModels(options)).rejects.toThrow('HTTP 401')
  })

  it('lets saved values override predefined limits and features without mutating the catalog', () => {
    const original = JSON.stringify(known)
    const configured = applyModelConfiguration(
      'qwen3',
      { ...defaultModelConfiguration(AiModelTypeEnum.LLM), contextSize: 32768 },
      known
    )
    expect(configured.model_properties.context_size).toBe(32768)
    expect(configured.features).toEqual([])
    expect(configured.parameter_rules.find((rule) => rule.name === 'max_tokens')).toMatchObject({
      max: 2048,
      default: 2048
    })
    expect(JSON.stringify(known)).toBe(original)
  })
})
