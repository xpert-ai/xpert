import { CallbackManager } from '@langchain/core/callbacks/manager'
import { AIMessageChunk } from '@langchain/core/messages'
import { ChatGenerationChunk, LLMResult } from '@langchain/core/outputs'
import { AIModelEntity, AiModelTypeEnum, AiProviderRole, FetchFrom, ICopilot, ILLMUsage } from '@xpert-ai/contracts'
import { ModelProvider } from './abstract-provider'
import { LargeLanguageModel, resolveTokenUsage } from './llm'

class TestModelProvider extends ModelProvider {
  getAuthorization(): string {
    return ''
  }

  getBaseUrl(): string {
    return ''
  }

  validateProviderCredentials(): Promise<void> {
    return Promise.resolve()
  }
}

class TestLargeLanguageModel extends LargeLanguageModel {
  constructor() {
    super(new TestModelProvider(), AiModelTypeEnum.LLM)
  }

  validateCredentials(): Promise<void> {
    return Promise.resolve()
  }

  protected override calcResponseUsage(
    _model: string,
    _credentials: Record<string, unknown>,
    promptTokens: number,
    completionTokens: number
  ): ILLMUsage {
    return {
      promptTokens,
      promptUnitPrice: 0,
      promptPriceUnit: 0,
      promptPrice: 0,
      completionTokens,
      completionUnitPrice: 0,
      completionPriceUnit: 0,
      completionPrice: 0,
      totalTokens: promptTokens + completionTokens,
      totalPrice: 0,
      currency: 'USD',
      latency: 0
    }
  }
}

class PricedLargeLanguageModel extends LargeLanguageModel {
  constructor() {
    super(new TestModelProvider(), AiModelTypeEnum.LLM)
  }

  validateCredentials(): Promise<void> {
    return Promise.resolve()
  }

  override predefinedModels(): AIModelEntity[] {
    return [
      {
        model: 'priced-model',
        label: { en_US: 'Priced model', zh_Hans: '计价模型' },
        model_type: AiModelTypeEnum.LLM,
        fetch_from: FetchFrom.PREDEFINED_MODEL,
        model_properties: {},
        pricing: {
          input: 1,
          output: 2,
          unit: 0.001,
          currency: 'CNY',
          rules: [
            { component: 'cache_read_input', unit_price: 0.5, unit_size: 1000 },
            { component: 'request', add_on: 'grounding', unit_price: 0.1, unit_size: 1 }
          ]
        }
      }
    ]
  }
}

class TimedPricedLargeLanguageModel extends LargeLanguageModel {
  constructor() {
    super(new TestModelProvider(), AiModelTypeEnum.LLM)
  }

  validateCredentials(): Promise<void> {
    return Promise.resolve()
  }

  override predefinedModels(): AIModelEntity[] {
    return [
      {
        model: 'timed-priced-model',
        label: { en_US: 'Timed priced model', zh_Hans: '周期计价模型' },
        model_type: AiModelTypeEnum.LLM,
        fetch_from: FetchFrom.PREDEFINED_MODEL,
        model_properties: {},
        pricing: {
          input: 1,
          output: 1,
          unit: 0.001,
          currency: 'CNY',
          rules: [
            {
              component: 'input',
              unit_price: 2,
              unit_size: 1000,
              daily_time_window: { time_zone: 'UTC', start_time: '08:00', end_time: '20:00' }
            },
            {
              component: 'output',
              unit_price: 4,
              unit_size: 1000,
              daily_time_window: { time_zone: 'UTC', start_time: '08:00', end_time: '20:00' }
            },
            {
              component: 'input',
              unit_price: 1,
              unit_size: 1000,
              daily_time_window: { time_zone: 'UTC', start_time: '20:00', end_time: '08:00' }
            },
            {
              component: 'output',
              unit_price: 2,
              unit_size: 1000,
              daily_time_window: { time_zone: 'UTC', start_time: '20:00', end_time: '08:00' }
            }
          ]
        }
      }
    ]
  }
}

function resultWithUsage(inputTokens: number, outputTokens: number, totalTokens: number): LLMResult {
  return {
    generations: [
      [
        new ChatGenerationChunk({
          text: '',
          message: new AIMessageChunk({
            content: '',
            usage_metadata: {
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              total_tokens: totalTokens
            }
          })
        })
      ]
    ]
  }
}

describe('resolveTokenUsage', () => {
  it('uses actual message usage when llmOutput contains an all-zero tokenUsage object', () => {
    const output = resultWithUsage(7264, 174, 7438)
    output.llmOutput = {
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      estimatedTokenUsage: { promptTokens: 7000, completionTokens: 170, totalTokens: 7170 }
    }

    expect(resolveTokenUsage(output)).toEqual({
      promptTokens: 7264,
      completionTokens: 174,
      totalTokens: 7438
    })
  })

  it('uses a valid llmOutput tokenUsage when message usage is unavailable', () => {
    expect(
      resolveTokenUsage({
        generations: [],
        llmOutput: {
          tokenUsage: { promptTokens: 1200, completionTokens: 80, totalTokens: 1280 }
        }
      })
    ).toEqual({ promptTokens: 1200, completionTokens: 80, totalTokens: 1280 })
  })

  it('falls back to estimated usage when actual usage is missing or all zero', () => {
    expect(
      resolveTokenUsage({
        generations: [],
        llmOutput: {
          tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          estimatedTokenUsage: { promptTokens: 900, completionTokens: 60, totalTokens: 960 }
        }
      })
    ).toEqual({ promptTokens: 900, completionTokens: 60, totalTokens: 960 })
  })

  it('preserves a legacy total-only llmOutput as the last fallback', () => {
    expect(
      resolveTokenUsage({
        generations: [],
        llmOutput: { totalTokens: 640 }
      })
    ).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 640 })
  })

  it('derives total tokens when a valid candidate omits or reports a zero total', () => {
    expect(
      resolveTokenUsage({
        generations: [],
        llmOutput: {
          tokenUsage: { promptTokens: 500, completionTokens: 25 }
        }
      })
    ).toEqual({ promptTokens: 500, completionTokens: 25, totalTokens: 525 })

    expect(
      resolveTokenUsage({
        generations: [],
        llmOutput: {
          tokenUsage: { promptTokens: 500, completionTokens: 25, totalTokens: 0 }
        }
      })
    ).toEqual({ promptTokens: 500, completionTokens: 25, totalTokens: 525 })
  })

  it('ignores invalid actual usage and falls back to a valid estimate', () => {
    expect(
      resolveTokenUsage({
        generations: [],
        llmOutput: {
          tokenUsage: { promptTokens: Number.NaN, completionTokens: -1, totalTokens: 0 },
          estimatedTokenUsage: { promptTokens: 300, completionTokens: 20, totalTokens: 320 }
        }
      })
    ).toEqual({ promptTokens: 300, completionTokens: 20, totalTokens: 320 })
  })

  it('returns zero usage when no valid source exists', () => {
    expect(resolveTokenUsage({ generations: [] })).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    })
  })

  it('reports the LangChain run ID with resolved usage', async () => {
    const copilot: ICopilot = { role: AiProviderRole.Primary }
    const handleLLMTokens = jest.fn()
    const output = resultWithUsage(7264, 174, 7438)
    output.llmOutput = {
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    }

    const [callbacks] = new TestLargeLanguageModel().createHandleUsageCallbacks(
      copilot,
      'provider-independent-model',
      {},
      handleLLMTokens
    )
    await callbacks.handleLLMEnd(output, 'run-usage-1')

    expect(handleLLMTokens).toHaveBeenCalledWith({
      copilot,
      model: 'provider-independent-model',
      requestId: 'run-usage-1',
      usage: expect.objectContaining({
        promptTokens: 7264,
        completionTokens: 174,
        totalTokens: 7438
      }),
      tokenUsed: 7438
    })
  })

  it('normalizes providers whose input count excludes cache tokens only when explicitly declared', async () => {
    const handleLLMTokens = jest.fn()
    const output = resultWithUsage(100, 10, 110)
    const message = (output.generations?.[0]?.[0] as ChatGenerationChunk).message as AIMessageChunk
    if (!message.usage_metadata) throw new Error('Expected usage metadata')
    message.usage_metadata.input_token_details = {
      cache_read: 20,
      cache_creation: 5
    }
    const [callbacks] = new TestLargeLanguageModel().createHandleUsageCallbacks(
      { role: AiProviderRole.Primary },
      'provider-independent-model',
      {},
      handleLLMTokens,
      { inputTokensIncludeCache: false }
    )

    await callbacks.handleLLMEnd(output, 'run-cache-usage-1')

    expect(handleLLMTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: expect.objectContaining({
          promptTokens: 125,
          completionTokens: 10,
          totalTokens: 135
        }),
        tokenUsed: 135
      })
    )
  })

  it('reports the conditional price breakdown from the model schema', async () => {
    const handleLLMTokens = jest.fn()
    const output = resultWithUsage(1000, 100, 1100)
    const message = (output.generations?.[0]?.[0] as ChatGenerationChunk).message as AIMessageChunk
    if (!message.usage_metadata) throw new Error('Expected usage metadata')
    message.usage_metadata.input_token_details = { cache_read: 200 }
    const [callbacks] = new PricedLargeLanguageModel().createHandleUsageCallbacks(
      { role: AiProviderRole.Primary },
      'priced-model',
      {},
      handleLLMTokens,
      { addOns: [{ type: 'grounding', quantity: 1 }] }
    )

    await callbacks.handleLLMEnd(output, 'run-priced-usage-1')

    expect(handleLLMTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: expect.objectContaining({
          promptTokens: 1000,
          completionTokens: 100,
          totalPrice: 1.2,
          pricingStatus: 'priced',
          pricingBreakdown: expect.arrayContaining([
            expect.objectContaining({ component: 'cache_read_input', quantity: 200, amount: 0.1 }),
            expect.objectContaining({ component: 'input', quantity: 800, amount: 0.8 }),
            expect.objectContaining({ component: 'output', quantity: 100, amount: 0.2 }),
            expect.objectContaining({ component: 'request', addOn: 'grounding', amount: 0.1 })
          ])
        })
      })
    )
  })

  it('freezes a recurring daily price window at invocation start', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-17T19:59:00.000Z'))
    try {
      const handleLLMTokens = jest.fn()
      const [callbacks] = new TimedPricedLargeLanguageModel().createHandleUsageCallbacks(
        { role: AiProviderRole.Primary },
        'timed-priced-model',
        {},
        handleLLMTokens
      )

      callbacks.handleLLMStart?.({}, ['prompt'], 'run-timed-price-1')
      jest.setSystemTime(new Date('2026-08-17T20:01:00.000Z'))
      await callbacks.handleLLMEnd(resultWithUsage(1000, 1000, 2000), 'run-timed-price-1')

      expect(handleLLMTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          usage: expect.objectContaining({ totalPrice: 6, pricingStatus: 'priced', currency: 'CNY' })
        })
      )
    } finally {
      jest.useRealTimers()
    }
  })

  it('uses a provider-reported price instead of catalog pricing', async () => {
    const handleLLMTokens = jest.fn()
    const output = resultWithUsage(1000, 100, 1100)
    const [callbacks] = new PricedLargeLanguageModel().createHandleUsageCallbacks(
      { role: AiProviderRole.Primary },
      'priced-model',
      {},
      handleLLMTokens,
      {
        resolveReportedPrice: () => ({ amount: 0.95, currency: 'OPENROUTER_CREDIT' }),
        reportedPriceRequired: true
      }
    )

    await callbacks.handleLLMEnd(output, 'run-provider-price-1')

    expect(handleLLMTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: expect.objectContaining({
          totalPrice: 0.95,
          currency: 'OPENROUTER_CREDIT',
          pricingStatus: 'priced',
          priceAuthority: 'provider',
          pricingBreakdown: undefined
        })
      })
    )
  })

  it('marks a required provider price unpriced when the response omits it', async () => {
    const handleLLMTokens = jest.fn()
    const [callbacks] = new PricedLargeLanguageModel().createHandleUsageCallbacks(
      { role: AiProviderRole.Primary },
      'priced-model',
      {},
      handleLLMTokens,
      {
        resolveReportedPrice: () => undefined,
        reportedPriceRequired: true
      }
    )

    await callbacks.handleLLMEnd(resultWithUsage(1000, 100, 1100), 'run-provider-price-2')

    expect(handleLLMTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: expect.objectContaining({
          totalPrice: 0,
          pricingStatus: 'unpriced',
          priceAuthority: 'provider',
          pricingBreakdown: undefined
        })
      })
    )
  })

  it('records estimated usage before an interrupted call rejects', async () => {
    const copilot: ICopilot = { role: AiProviderRole.Primary }
    let callbackFinished = false
    const handleLLMTokens = jest.fn(async () => {
      await Promise.resolve()
      callbackFinished = true
    })
    const [callbacks] = new TestLargeLanguageModel().createHandleUsageCallbacks(
      copilot,
      'provider-independent-model',
      {},
      handleLLMTokens
    )

    callbacks.handleLLMStart?.({}, ['system prompt\nhuman prompt'], 'run-1')
    callbacks.handleLLMNewToken?.('partial answer', { prompt: 0, completion: 0 }, 'run-1')
    await callbacks.handleLLMError?.(new Error('aborted'), 'run-1')

    expect(callbackFinished).toBe(true)
    expect(callbacks.awaitHandlers).toBe(true)
    expect(handleLLMTokens).toHaveBeenCalledWith({
      copilot,
      model: 'provider-independent-model',
      requestId: 'run-1',
      usage: expect.objectContaining({
        type: 'estimated',
        promptTokens: expect.any(Number),
        completionTokens: expect.any(Number),
        totalTokens: expect.any(Number)
      }),
      tokenUsed: expect.any(Number)
    })
    const recordedUsage = handleLLMTokens.mock.calls[0][0].usage
    expect(recordedUsage.promptTokens).toBeGreaterThan(0)
    expect(recordedUsage.completionTokens).toBeGreaterThan(0)
    expect(recordedUsage.totalTokens).toBe(recordedUsage.promptTokens + recordedUsage.completionTokens)
  })

  it('propagates awaited usage persistence failures through the callback manager', async () => {
    const persistenceError = new Error('usage persistence failed')
    const [callback] = new TestLargeLanguageModel().createHandleUsageCallbacks(
      { role: AiProviderRole.Primary },
      'provider-independent-model',
      {},
      async () => {
        throw persistenceError
      }
    )
    const manager = new CallbackManager()
    manager.addHandler(callback)
    const [run] = await manager.handleLLMStart(
      { lc: 1, type: 'not_implemented', id: ['test-model'] },
      ['prompt'],
      'run-1'
    )

    await expect(run.handleLLMEnd(resultWithUsage(10, 2, 12))).rejects.toThrow(persistenceError)
  })

  it('does not invent usage when a failed call produced no output', async () => {
    const handleLLMTokens = jest.fn()
    const [callbacks] = new TestLargeLanguageModel().createHandleUsageCallbacks(
      { role: AiProviderRole.Primary },
      'provider-independent-model',
      {},
      handleLLMTokens
    )

    callbacks.handleLLMStart?.({}, ['prompt'], 'run-1')
    await callbacks.handleLLMError?.(new Error('authentication failed'), 'run-1')

    expect(handleLLMTokens).not.toHaveBeenCalled()
  })

  it('records estimated prompt usage when an interrupted call produced no output yet', async () => {
    const handleLLMTokens = jest.fn()
    const [callbacks] = new TestLargeLanguageModel().createHandleUsageCallbacks(
      { role: AiProviderRole.Primary },
      'provider-independent-model',
      {},
      handleLLMTokens
    )

    callbacks.handleLLMStart?.({}, ['system prompt\nhuman prompt'], 'run-1')
    const abortError = new Error('Request was aborted')
    abortError.name = 'AbortError'
    await callbacks.handleLLMError?.(abortError, 'run-1')

    expect(handleLLMTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: expect.objectContaining({
          type: 'estimated',
          promptTokens: expect.any(Number),
          completionTokens: 0
        })
      })
    )
  })

  it('includes streamed tool-call arguments in interrupted completion usage', async () => {
    const handleLLMTokens = jest.fn()
    const [callbacks] = new TestLargeLanguageModel().createHandleUsageCallbacks(
      { role: AiProviderRole.Primary },
      'provider-independent-model',
      {},
      handleLLMTokens
    )

    callbacks.handleLLMStart?.({}, ['prompt'], 'run-1')
    callbacks.handleLLMNewToken?.('', { prompt: 0, completion: 0 }, 'run-1', undefined, undefined, {
      chunk: new ChatGenerationChunk({
        text: '',
        message: new AIMessageChunk({
          content: '',
          tool_call_chunks: [
            {
              name: 'search_documents',
              args: '{"query":"quarterly revenue by region"}',
              index: 0
            }
          ]
        })
      })
    })
    await callbacks.handleLLMError?.(new Error('aborted'), 'run-1')

    expect(handleLLMTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: expect.objectContaining({
          type: 'estimated',
          completionTokens: expect.any(Number)
        })
      })
    )
    expect(handleLLMTokens.mock.calls[0][0].usage.completionTokens).toBeGreaterThan(0)
  })

  it('does not count inline image base64 bytes as prompt text on interruption', async () => {
    const handleLLMTokens = jest.fn()
    const [callbacks] = new TestLargeLanguageModel().createHandleUsageCallbacks(
      { role: AiProviderRole.Primary },
      'provider-independent-model',
      {},
      handleLLMTokens
    )
    const prompt = JSON.stringify({
      role: 'human',
      content: [
        { type: 'text', text: 'Describe this image' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${'A'.repeat(8_000)}` } }
      ]
    })

    callbacks.handleLLMStart?.({}, [prompt], 'run-1')
    const abortError = new Error('Request was aborted')
    abortError.name = 'AbortError'
    await callbacks.handleLLMError?.(abortError, 'run-1')

    const recordedUsage = handleLLMTokens.mock.calls[0][0].usage
    expect(recordedUsage.type).toBe('estimated')
    expect(recordedUsage.promptTokens).toBeGreaterThan(0)
    expect(recordedUsage.promptTokens).toBeLessThan(100)
  })

  it('isolates timing and partial output for concurrent model runs', async () => {
    const copilot: ICopilot = { role: AiProviderRole.Primary }
    const handleLLMTokens = jest.fn()
    const [callbacks] = new TestLargeLanguageModel().createHandleUsageCallbacks(
      copilot,
      'provider-independent-model',
      {},
      handleLLMTokens
    )

    callbacks.handleLLMStart?.({}, ['first prompt'], 'run-1')
    callbacks.handleLLMStart?.({}, ['second prompt'], 'run-2')
    callbacks.handleLLMNewToken?.('first output', { prompt: 0, completion: 0 }, 'run-1')
    callbacks.handleLLMNewToken?.('second longer output', { prompt: 0, completion: 0 }, 'run-2')

    await callbacks.handleLLMError?.(new Error('aborted'), 'run-2')
    await callbacks.handleLLMError?.(new Error('aborted'), 'run-1')

    expect(handleLLMTokens).toHaveBeenCalledTimes(2)
    expect(handleLLMTokens.mock.calls[0][0].usage.completionTokens).toBeGreaterThan(
      handleLLMTokens.mock.calls[1][0].usage.completionTokens
    )
  })
})
