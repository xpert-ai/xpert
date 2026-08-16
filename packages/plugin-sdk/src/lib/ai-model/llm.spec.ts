import { CallbackManager } from '@langchain/core/callbacks/manager'
import { AIMessageChunk } from '@langchain/core/messages'
import { ChatGenerationChunk, LLMResult } from '@langchain/core/outputs'
import { AiModelTypeEnum, AiProviderRole, ICopilot, ILLMUsage } from '@xpert-ai/contracts'
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
