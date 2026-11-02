import {
  AIModelEntity,
  AiModelTypeEnum,
  FetchFrom,
  ModelFeature,
  ModelPropertyKey,
  ModelUsagePricingContext,
  PriceConfig,
  ParameterType
} from '@xpert-ai/contracts'
import { AIModel } from './ai-model'
import { ModelProvider } from './abstract-provider'
import { DefaultParameterName, PARAMETER_RULE_TEMPLATE } from './entities'
import { calculateModelUsageCharge } from './pricing'

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
  constructor(private readonly schema: AIModelEntity | null, modelType = AiModelTypeEnum.LLM) {
    super(new TestProvider(), modelType)
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

describe('AIModel embedding price snapshots', () => {
  const context: ModelUsagePricingContext = {
    model: 'embedding', operation: AiModelTypeEnum.TEXT_EMBEDDING, modality: 'text', startedAt: '2026-10-30T00:00:00Z'
  }
  const metric = { unit: 'token' as const, authority: 'provider' as const, promptTokens: 2000, completionTokens: 0, totalTokens: 2000 }
  const schema = (pricing?: AIModelEntity['pricing']): AIModelEntity => ({
    model: 'embedding', label: { en_US: 'Embedding', zh_Hans: '嵌入' },
    model_type: AiModelTypeEnum.TEXT_EMBEDDING, fetch_from: FetchFrom.PREDEFINED_MODEL, pricing
  })
  const snapshot = (pricing?: AIModelEntity['pricing']) =>
    new TestAIModel(schema(pricing), AiModelTypeEnum.TEXT_EMBEDDING).getUsagePricingSnapshot('embedding', {}, context)

  it('converts a fixed input token price and freezes it for later settlement', () => {
    const pricing = { input: 2, output: 99, unit: 0.001, currency: 'CNY' }
    const result = snapshot(pricing)
    pricing.input = 9
    expect(result.capturedAt).toBe('2026-10-30T00:00:00.000Z')
    expect(calculateModelUsageCharge(result, metric)).toMatchObject({ pricingStatus: 'priced', quantity: 2000, amount: 4, currency: 'CNY' })
  })

  it('distinguishes explicit zero input pricing from missing pricing', () => {
    expect(calculateModelUsageCharge(snapshot({ input: 0, unit: 0.001, currency: 'CNY' }), metric))
      .toMatchObject({ pricingStatus: 'free', amount: 0 })
    expect(calculateModelUsageCharge(snapshot(), metric)).toMatchObject({ pricingStatus: 'unpriced' })
  })

  it.each<Partial<PriceConfig>>([
    { input: NaN }, { input: -1 }, { unit: 0 }, { unit: Infinity }, { currency: '' },
    { tiered_pricing: [{ max_tokens: 100, input: 1, output: 0 }] }
  ])('does not convert invalid or conditional legacy prices: %p', (override) => {
    expect(calculateModelUsageCharge(snapshot({ input: 2, unit: 0.001, currency: 'CNY', ...override }), metric))
      .toMatchObject({ pricingStatus: 'unpriced' })
  })

  it('preserves explicit usage pricing rules for embedding adapters', () => {
    const result = snapshot({ type: 'usage', rules: [{
      id: 'explicit', version: 'v1', effective_from: '2026-01-01T00:00:00Z',
      unit: 'token', token_type: 'prompt', unit_size: 1000, unit_price: 3, currency: 'CNY', charge_type: 'paid'
    }] })
    expect(calculateModelUsageCharge(result, metric)).toMatchObject({ pricingStatus: 'priced', amount: 6 })
    expect(result.rules[0].id).toBe('explicit')
  })

  it('leaves legacy LLM pricing on its existing calculation path', () => {
    const model = new TestAIModel(schema({ input: 2, output: 3, unit: 0.001, currency: 'CNY' }))
    expect(model.getUsagePricingSnapshot('model', {}, context).rules).toEqual([])
  })
})
