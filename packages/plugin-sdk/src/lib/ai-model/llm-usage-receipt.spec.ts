import { AIMessage, AIMessageChunk } from '@langchain/core/messages'
import { ChatGeneration, LLMResult } from '@langchain/core/outputs'
import {
  AIModelEntity,
  AiModelTypeEnum,
  AiProviderRole,
  FetchFrom,
  ILLMUsage,
  PriceType,
  TTokenUsage
} from '@xpert-ai/contracts'
import { ModelProvider } from './abstract-provider'
import { LargeLanguageModel } from './llm'

class ReceiptProvider extends ModelProvider {
  getAuthorization() {
    return ''
  }
  getBaseUrl() {
    return ''
  }
  async validateProviderCredentials() {}
}

class ReceiptModel extends LargeLanguageModel {
  constructor(private readonly legacy = false) {
    super(new ReceiptProvider(), AiModelTypeEnum.LLM)
  }
  async validateCredentials() {}
  override predefinedModels(): AIModelEntity[] {
    return [
      {
        model: 'receipt-test',
        label: { en_US: 'Receipt test', zh_Hans: '回执测试' },
        model_type: AiModelTypeEnum.LLM,
        fetch_from: FetchFrom.PREDEFINED_MODEL,
        model_properties: {},
        ...(!this.legacy ? { pricing: { input: 2, output: 8, unit: 0.000001, currency: 'RMB' } } : {})
      }
    ]
  }
  override getPrice(_model: string, _credentials: Record<string, unknown>, type: PriceType, tokens: number) {
    const unitPrice = type === PriceType.INPUT ? 2 : 8
    return { unitPrice, unit: 0.000001, totalAmount: (tokens * unitPrice) / 1000000, currency: 'RMB' }
  }
  price(usage: TTokenUsage) {
    return this.calcResponseUsage(
      'receipt-test',
      {},
      usage.promptTokens,
      usage.completionTokens,
      performance.now(),
      usage
    )
  }
}

function result(message: AIMessage | AIMessageChunk): LLMResult {
  const generation: ChatGeneration = { text: 'done', message }
  return { generations: [[generation]] }
}

describe('LLM priced usage receipts', () => {
  it.each([false, true])('preserves all normalized facts at the pricing boundary (legacy=%s)', (legacy) => {
    const usage = {
      promptTokens: 31,
      completionTokens: 48,
      totalTokens: 80,
      cacheReadInputTokens: 5,
      cacheWriteInputTokens: 3,
      reasoningTokens: 38
    }
    expect(new ReceiptModel(legacy).price(usage)).toMatchObject({ ...usage, pricingStatus: 'priced' })
  })

  it.each([false, true])('forwards canonical details through the actual callback (legacy=%s)', async (legacy) => {
    for (const Message of [AIMessage, AIMessageChunk]) {
      const callback = jest.fn()
      const [handler] = new ReceiptModel(legacy).createHandleUsageCallbacks(
        { role: AiProviderRole.Primary },
        'receipt-test',
        {},
        callback
      )
      await handler.handleLLMEnd(
        result(
          new Message({
            content: 'done',
            usage_metadata: {
              input_tokens: 31,
              output_tokens: 48,
              total_tokens: 79,
              input_token_details: { cache_read: 5, cache_creation: 3 },
              output_token_details: { reasoning: 38 }
            }
          })
        ),
        'receipt-run'
      )
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenUsed: 79,
          usage: expect.objectContaining({
            promptTokens: 31,
            completionTokens: 48,
            totalTokens: 79,
            cacheReadInputTokens: 5,
            cacheWriteInputTokens: 3,
            reasoningTokens: 38,
            totalPrice: 0.000446,
            pricingStatus: 'priced'
          })
        })
      )
    }
  })

  it.each([undefined, 0, 38])('preserves reasoning=%s with provider-reported pricing', async (reasoning) => {
    const callback = jest.fn()
    const [handler] = new ReceiptModel().createHandleUsageCallbacks(
      { role: AiProviderRole.Primary },
      'receipt-test',
      {},
      callback,
      { resolveReportedPrice: () => ({ amount: 0.001, currency: 'RMB' }) }
    )
    await handler.handleLLMEnd(
      result(
        new AIMessage({
          content: 'done',
          usage_metadata: {
            input_tokens: 31,
            output_tokens: 48,
            total_tokens: 79,
            output_token_details: { reasoning }
          }
        })
      ),
      'reported-run'
    )
    const receipt: ILLMUsage = callback.mock.calls[0][0].usage
    expect(receipt).toMatchObject({ totalTokens: 79, totalPrice: 0.001, priceAuthority: 'provider' })
    expect(receipt.reasoningTokens ?? 0).toBe(reasoning ?? 0)
  })

  it('restores canonical facts even when a subclass returns only legacy receipt fields', async () => {
    const model = new ReceiptModel()
    jest.spyOn(model, 'calcResponseUsage' as never).mockReturnValue({ totalPrice: 0.000446, currency: 'RMB' } as never)
    const callback = jest.fn()
    const [handler] = model.createHandleUsageCallbacks({ role: AiProviderRole.Primary }, 'receipt-test', {}, callback)
    await handler.handleLLMEnd(
      result(
        new AIMessage({
          content: 'done',
          usage_metadata: {
            input_tokens: 31,
            output_tokens: 48,
            total_tokens: 79,
            output_token_details: { reasoning: 38 }
          }
        })
      ),
      'override-run'
    )
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: expect.objectContaining({
          promptTokens: 31,
          completionTokens: 48,
          totalTokens: 79,
          reasoningTokens: 38
        })
      })
    )
  })
})
