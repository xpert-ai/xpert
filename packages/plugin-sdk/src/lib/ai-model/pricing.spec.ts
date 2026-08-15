import { AIMessageChunk } from '@langchain/core/messages'
import { ChatGenerationChunk } from '@langchain/core/outputs'
import { ModelUsagePricingConfig, PriceConfig, PriceType } from '@xpert-ai/contracts'
import { calcTokenUsage } from './llm'
import { calculateModelPrice, calculateModelUsageCharge, resolveModelUsagePricingSnapshot } from './pricing'

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

describe('usage pricing', () => {
  const pricing: ModelUsagePricingConfig = {
    type: 'usage',
    rules: [
      {
        id: 'video-1080p-audio',
        version: '2026-08-14',
        effective_from: '2026-08-14T00:00:00Z',
        unit: 'second',
        unit_size: 1,
        unit_price: 1.2,
        currency: 'CNY',
        charge_type: 'paid',
        dimensions: { resolution: '1080p', audio: true }
      }
    ]
  }

  it('snapshots the active rule and calculates a per-second charge', () => {
    const snapshot = resolveModelUsagePricingSnapshot(pricing, {
      model: 'video-model',
      modality: 'video',
      operation: 'text_to_video',
      pricingDimensions: { resolution: '1080p', audio: true },
      startedAt: '2026-08-14T01:00:00Z'
    })

    expect(snapshot).toMatchObject({ rules: [{ id: 'video-1080p-audio' }] })
    expect(calculateModelUsageCharge(snapshot, { unit: 'second', quantity: 8, authority: 'provider' })).toEqual(
      expect.objectContaining({ pricingStatus: 'priced', quantity: 8, amount: 9.6, currency: 'CNY' })
    )
  })

  it('keeps free and unpriced usage semantically distinct', () => {
    const freeSnapshot = resolveModelUsagePricingSnapshot(
      {
        type: 'usage',
        rules: [
          {
            id: 'free-generation',
            version: '2026-08-14',
            effective_from: '2026-08-14T00:00:00Z',
            unit: 'generation',
            unit_size: 1,
            charge_type: 'free',
            currency: 'CNY'
          }
        ]
      },
      {
        model: 'free-model',
        modality: 'video',
        operation: 'text_to_video',
        startedAt: '2026-08-14T01:00:00Z'
      }
    )

    expect(calculateModelUsageCharge(freeSnapshot, { unit: 'generation', quantity: 1, authority: 'contract' })).toEqual(
      expect.objectContaining({ pricingStatus: 'free', amount: 0 })
    )
    expect(
      calculateModelUsageCharge(
        { capturedAt: '2026-08-14T01:00:00Z', rules: [] },
        { unit: 'generation', quantity: 1, authority: 'contract' }
      )
    ).toEqual({ pricingStatus: 'unpriced', quantity: 1 })
  })

  it('requires zero-cost models to use an explicit free rule', () => {
    expect(() =>
      resolveModelUsagePricingSnapshot(
        {
          type: 'usage',
          rules: [
            {
              id: 'ambiguous-zero-price',
              version: '2026-08-14',
              effective_from: '2026-08-14T00:00:00Z',
              unit: 'generation',
              unit_size: 1,
              unit_price: 0,
              currency: 'CNY',
              charge_type: 'paid'
            }
          ]
        },
        {
          model: 'zero-price-model',
          modality: 'image',
          operation: 'text_to_image',
          startedAt: '2026-08-14T01:00:00Z'
        }
      )
    ).toThrow("Paid usage pricing rule 'ambiguous-zero-price' requires unit_price and currency")
  })

  it('uses the configured Provider token component', () => {
    const snapshot = resolveModelUsagePricingSnapshot(
      {
        type: 'usage',
        rules: [
          {
            id: 'completion-token-price',
            version: '2026-08-14',
            effective_from: '2026-08-14T00:00:00Z',
            unit: 'token',
            token_type: 'completion',
            unit_size: 1_000_000,
            unit_price: 46,
            currency: 'CNY',
            charge_type: 'paid'
          }
        ]
      },
      {
        model: 'token-video',
        modality: 'video',
        operation: 'text_to_video',
        startedAt: '2026-08-14T01:00:00Z'
      }
    )

    expect(
      calculateModelUsageCharge(snapshot, {
        unit: 'token',
        promptTokens: 20,
        completionTokens: 100_000,
        totalTokens: 100_020,
        authority: 'provider'
      })
    ).toEqual(expect.objectContaining({ quantity: 100_000, amount: 4.6 }))
  })
})
