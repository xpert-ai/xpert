import {
  AIModelEntity,
  AiModelTypeEnum,
  FetchFrom,
  ModelFeature,
  ModelPropertyKey,
  ParameterType
} from '@xpert-ai/contracts'
import { AIModel } from './ai-model'
import { ModelProvider } from './abstract-provider'
import { DefaultParameterName, PARAMETER_RULE_TEMPLATE } from './entities'

class TestProvider extends ModelProvider {
  getAuthorization(): string {
    return 'Bearer test'
  }

  getBaseUrl(): string {
    return 'https://example.com'
  }

  async validateProviderCredentials(): Promise<void> {
    return undefined
  }
}

class TestAIModel extends AIModel {
  constructor(private readonly schema: AIModelEntity | null) {
    super(new TestProvider(), AiModelTypeEnum.LLM)
  }

  async validateCredentials(): Promise<void> {
    return undefined
  }

  override getModelSchema(): AIModelEntity | null {
    return this.schema
  }
}

describe('AIModel model profile', () => {
  it('maps model capabilities and token limits from the model schema', () => {
    const model = new TestAIModel({
      model: 'test-model',
      label: { en_US: 'Test model', zh_Hans: '测试模型' },
      model_type: AiModelTypeEnum.LLM,
      fetch_from: FetchFrom.PREDEFINED_MODEL,
      model_properties: {
        [ModelPropertyKey.CONTEXT_SIZE]: 128_000
      },
      features: [ModelFeature.VISION, ModelFeature.VIDEO, ModelFeature.TOOL_CALL, ModelFeature.STRUCTURED_OUTPUT],
      parameter_rules: [
        {
          name: 'max_tokens',
          label: { en_US: 'Max tokens', zh_Hans: '最大令牌数' },
          type: ParameterType.INT,
          max: 8_192
        }
      ]
    })

    expect(model.getModelProfile('test-model', {})).toEqual({
      maxInputTokens: 128_000,
      maxOutputTokens: 8_192,
      imageInputs: true,
      videoInputs: true,
      toolCalling: true,
      structuredOutput: true
    })
  })

  it('returns null when the model schema is unavailable', () => {
    expect(new TestAIModel(null).getModelProfile('missing-model', {})).toBeNull()
  })
})

describe('AIModel parameter rule templates', () => {
  it('uses 2048 tokens as the default output limit', () => {
    expect(PARAMETER_RULE_TEMPLATE[DefaultParameterName.MAX_TOKENS].default).toBe(2_048)
  })
})
