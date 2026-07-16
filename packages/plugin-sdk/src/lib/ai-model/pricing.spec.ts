import { AIMessageChunk } from '@langchain/core/messages'
import { ChatGenerationChunk } from '@langchain/core/outputs'
import { PriceConfig, PriceType } from '@xpert-ai/contracts'
import { calcTokenUsage } from './llm'
import { calculateModelPrice } from './pricing'

describe('calculateModelPrice', () => {
  const pricing: PriceConfig = {
    input: 0.002,
    output: 0.012,
    unit: 0.001,
    currency: 'RMB',
    tiered_pricing: [
      { input: 0.002, output: 0.012, max_tokens: 256000 },
      { input: 0.008, output: 0.048, max_tokens: 1000000 }
    ]
  }

  it('selects input and output prices from the single-request input token tier', () => {
    expect(calculateModelPrice(pricing, PriceType.INPUT, 300000, 300000)).toMatchObject({
      unitPrice: 0.008,
      totalAmount: 2.4,
      currency: 'RMB'
    })
    expect(calculateModelPrice(pricing, PriceType.OUTPUT, 1000, 300000)).toMatchObject({
      unitPrice: 0.048,
      totalAmount: 0.048,
      currency: 'RMB'
    })
  })

  it('preserves flat pricing when a model has no tiers', () => {
    expect(
      calculateModelPrice({ input: 0.001, output: 0.002, unit: 0.001, currency: 'USD' }, PriceType.OUTPUT, 500, 300000)
    ).toMatchObject({ unitPrice: 0.002, totalAmount: 0.001, currency: 'USD' })
  })

  it('recalculates the investigated Qwen3.6 Plus usage at the official base tier', () => {
    const inputPrice = calculateModelPrice(pricing, PriceType.INPUT, 28_516_395, 88_420).totalAmount
    const outputPrice = calculateModelPrice(pricing, PriceType.OUTPUT, 371_122, 88_420).totalAmount

    expect(inputPrice + outputPrice).toBe(61.486254)
  })

  it('sums token usage across every generated message', () => {
    expect(
      calcTokenUsage({
        generations: [
          [
            new ChatGenerationChunk({
              text: '',
              message: new AIMessageChunk({
                content: '',
                usage_metadata: {
                  input_tokens: 1000,
                  output_tokens: 100,
                  total_tokens: 1100
                }
              })
            }),
            new ChatGenerationChunk({
              text: '',
              message: new AIMessageChunk({
                content: '',
                usage_metadata: {
                  input_tokens: 200,
                  output_tokens: 20,
                  total_tokens: 220
                }
              })
            })
          ]
        ]
      })
    ).toEqual({ promptTokens: 1200, completionTokens: 120, totalTokens: 1320 })
  })
})
