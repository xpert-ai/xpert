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

  it('reports the same resolved usage to execution and pricing callbacks', () => {
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
    callbacks.handleLLMEnd(output)

    expect(handleLLMTokens).toHaveBeenCalledWith({
      copilot,
      model: 'provider-independent-model',
      usage: expect.objectContaining({
        promptTokens: 7264,
        completionTokens: 174,
        totalTokens: 7438
      }),
      tokenUsed: 7438
    })
  })
})
