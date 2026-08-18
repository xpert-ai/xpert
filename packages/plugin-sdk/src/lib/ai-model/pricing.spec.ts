import { AIMessageChunk } from '@langchain/core/messages'
import { ChatGenerationChunk } from '@langchain/core/outputs'
import { AiModelTypeEnum, ModelUsagePricingConfig, PriceConfig, PriceType } from '@xpert-ai/contracts'
import { calcTokenUsage } from './llm'
import {
  calculateLLMUsagePrice,
  calculateModelPrice,
  calculateModelUsageCharge,
  resolveModelUsagePricingSnapshot
} from './pricing'

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

  it('preserves cache token details as input subsets', () => {
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
                  total_tokens: 1100,
                  input_token_details: {
                    cache_read: 200,
                    cache_creation: 50
                  }
                }
              })
            })
          ]
        ]
      })
    ).toEqual({
      promptTokens: 1000,
      completionTokens: 100,
      totalTokens: 1100,
      cacheReadInputTokens: 200,
      cacheWriteInputTokens: 50
    })
  })

  it('prices cache categories, conditional token tiers, add-ons and cache storage together', () => {
    const conditionalPricing: PriceConfig = {
      input: 2,
      output: 8,
      unit: 0.000001,
      currency: 'CNY',
      rules: [
        {
          component: 'input',
          unit_price: 4,
          unit_size: 1_000_000,
          min_input_tokens: 32_001,
          max_input_tokens: 128_000,
          max_output_tokens: 8_000,
          mode: 'thinking',
          region: 'cn',
          service_tier: 'standard'
        },
        {
          component: 'output',
          unit_price: 16,
          unit_size: 1_000_000,
          min_input_tokens: 32_001,
          max_input_tokens: 128_000,
          max_output_tokens: 8_000,
          mode: 'thinking',
          region: 'cn',
          service_tier: 'standard'
        },
        { component: 'cache_read_input', unit_price: 0.2, unit_size: 1_000_000 },
        {
          component: 'cache_write_input',
          unit_price: 2.5,
          unit_size: 1_000_000,
          cache_ttl: '5m'
        },
        { component: 'request', add_on: 'web_search', unit_price: 0.01, unit_size: 1 },
        { component: 'request', add_on: 'grounding', unit_price: 0.02, unit_size: 1 },
        { component: 'cache_storage', unit_price: 1, unit_size: 1_000_000 }
      ]
    }

    const result = calculateLLMUsagePrice(
      conditionalPricing,
      {
        promptTokens: 100_000,
        completionTokens: 5_000,
        totalTokens: 105_000,
        cacheReadInputTokens: 20_000,
        cacheWriteInputTokens: 10_000
      },
      {
        mode: 'thinking',
        region: 'cn',
        serviceTier: 'standard',
        cacheWriteTtl: '5m',
        addOns: [
          { type: 'web_search', quantity: 2 },
          { type: 'grounding', quantity: 1 }
        ],
        cacheStorageTokenHours: 500_000
      }
    )

    expect(result).toMatchObject({ totalAmount: 0.929, currency: 'CNY' })
    expect(result.breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ component: 'input', quantity: 70_000, unitPrice: 4, amount: 0.28 }),
        expect.objectContaining({ component: 'cache_read_input', quantity: 20_000, amount: 0.004 }),
        expect.objectContaining({ component: 'cache_write_input', quantity: 10_000, amount: 0.025 }),
        expect.objectContaining({ component: 'output', quantity: 5_000, unitPrice: 16, amount: 0.08 }),
        expect.objectContaining({ component: 'request', addOn: 'web_search', quantity: 2, amount: 0.02 }),
        expect.objectContaining({ component: 'request', addOn: 'grounding', quantity: 1, amount: 0.02 }),
        expect.objectContaining({ component: 'cache_storage', quantity: 500_000, amount: 0.5 })
      ])
    )
  })

  it('does not fall back to legacy flat prices when conditional dimensions do not match', () => {
    const conditionalPricing: PriceConfig = {
      input: 2,
      output: 8,
      unit: 0.000001,
      currency: 'CNY',
      rules: [
        {
          component: 'input',
          unit_price: 4,
          unit_size: 1_000_000,
          mode: 'thinking',
          region: 'cn',
          service_tier: 'priority'
        },
        {
          component: 'output',
          unit_price: 16,
          unit_size: 1_000_000,
          mode: 'thinking',
          region: 'cn',
          service_tier: 'priority'
        }
      ]
    }

    const result = calculateLLMUsagePrice(
      conditionalPricing,
      { promptTokens: 100_000, completionTokens: 5_000, totalTokens: 105_000 },
      { mode: 'thinking', region: 'international', serviceTier: 'standard' }
    )

    expect(result).toMatchObject({ pricingStatus: 'unpriced', totalAmount: 0, currency: 'CNY' })
    expect(result.breakdown).toEqual([
      expect.objectContaining({ component: 'input', quantity: 100_000, pricingStatus: 'unpriced' }),
      expect.objectContaining({ component: 'output', quantity: 5_000, pricingStatus: 'unpriced' })
    ])
  })

  it('uses the currency declared by the selected regional pricing rules', () => {
    const result = calculateLLMUsagePrice(
      {
        input: 0.8,
        output: 2,
        unit: 0.000001,
        currency: 'RMB',
        rules: [
          {
            component: 'input',
            unit_price: 0.4,
            unit_size: 1_000_000,
            currency: 'USD',
            region: 'international'
          },
          {
            component: 'output',
            unit_price: 1.2,
            unit_size: 1_000_000,
            currency: 'USD',
            region: 'international',
            mode: 'standard'
          }
        ]
      },
      { promptTokens: 1_000_000, completionTokens: 500_000, totalTokens: 1_500_000 },
      { region: 'international', mode: 'standard' }
    )

    expect(result).toMatchObject({ pricingStatus: 'priced', totalAmount: 1, currency: 'USD' })
    expect(result.breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ component: 'input', currency: 'USD', amount: 0.4 }),
        expect.objectContaining({ component: 'output', currency: 'USD', amount: 0.6 })
      ])
    )
  })

  it.each([
    ['day window start', '2026-08-17T00:00:00.000Z', 6],
    ['night window start', '2026-08-17T12:00:00.000Z', 3],
    ['cross-midnight night window', '2026-08-16T23:59:00.000Z', 3]
  ])('selects the recurring daily price at the invocation time: %s', (_label, pricingTime, totalAmount) => {
    const periodicPricing: PriceConfig = {
      input: 2,
      output: 4,
      unit: 0.000001,
      currency: 'CNY',
      rules: [
        {
          component: 'input',
          unit_price: 2,
          unit_size: 1_000_000,
          daily_time_window: { time_zone: 'Asia/Shanghai', start_time: '08:00', end_time: '20:00' }
        },
        {
          component: 'output',
          unit_price: 4,
          unit_size: 1_000_000,
          daily_time_window: { time_zone: 'Asia/Shanghai', start_time: '08:00', end_time: '20:00' }
        },
        {
          component: 'input',
          unit_price: 1,
          unit_size: 1_000_000,
          daily_time_window: { time_zone: 'Asia/Shanghai', start_time: '20:00', end_time: '08:00' }
        },
        {
          component: 'output',
          unit_price: 2,
          unit_size: 1_000_000,
          daily_time_window: { time_zone: 'Asia/Shanghai', start_time: '20:00', end_time: '08:00' }
        }
      ]
    }

    expect(
      calculateLLMUsagePrice(
        periodicPricing,
        { promptTokens: 1_000_000, completionTokens: 1_000_000, totalTokens: 2_000_000 },
        { pricingTime }
      )
    ).toMatchObject({ pricingStatus: 'priced', totalAmount, currency: 'CNY' })
  })

  it.each([
    ['before first peak', '2026-08-17T00:59:00.000Z', 6.05],
    ['first peak start', '2026-08-17T01:00:00.000Z', 12.1],
    ['between peaks', '2026-08-17T04:00:00.000Z', 6.05],
    ['second peak start', '2026-08-17T06:00:00.000Z', 12.1],
    ['second peak end', '2026-08-17T10:00:00.000Z', 6.05]
  ])('supports two disjoint recurring peak windows: %s', (_label, pricingTime, totalAmount) => {
    const pricing: PriceConfig = {
      input: 1.5,
      output: 4.5,
      unit: 0.000001,
      currency: 'RMB',
      rules: [
        { component: 'input', unit_price: 1.5, unit_size: 1_000_000 },
        { component: 'cache_read_input', unit_price: 0.05, unit_size: 1_000_000 },
        { component: 'output', unit_price: 4.5, unit_size: 1_000_000 },
        {
          component: 'input',
          unit_price: 3,
          unit_size: 1_000_000,
          daily_time_window: { time_zone: 'Asia/Shanghai', start_time: '09:00', end_time: '12:00' }
        },
        {
          component: 'cache_read_input',
          unit_price: 0.1,
          unit_size: 1_000_000,
          daily_time_window: { time_zone: 'Asia/Shanghai', start_time: '09:00', end_time: '12:00' }
        },
        {
          component: 'output',
          unit_price: 9,
          unit_size: 1_000_000,
          daily_time_window: { time_zone: 'Asia/Shanghai', start_time: '09:00', end_time: '12:00' }
        },
        {
          component: 'input',
          unit_price: 3,
          unit_size: 1_000_000,
          daily_time_window: { time_zone: 'Asia/Shanghai', start_time: '14:00', end_time: '18:00' }
        },
        {
          component: 'cache_read_input',
          unit_price: 0.1,
          unit_size: 1_000_000,
          daily_time_window: { time_zone: 'Asia/Shanghai', start_time: '14:00', end_time: '18:00' }
        },
        {
          component: 'output',
          unit_price: 9,
          unit_size: 1_000_000,
          daily_time_window: { time_zone: 'Asia/Shanghai', start_time: '14:00', end_time: '18:00' }
        }
      ]
    }

    expect(
      calculateLLMUsagePrice(
        pricing,
        {
          promptTokens: 2_000_000,
          cacheReadInputTokens: 1_000_000,
          completionTokens: 1_000_000,
          totalTokens: 3_000_000
        },
        { pricingTime }
      )
    ).toMatchObject({ pricingStatus: 'priced', totalAmount, currency: 'RMB' })
  })

  it('rejects invalid recurring daily pricing windows', () => {
    const usage = { promptTokens: 1000, completionTokens: 100, totalTokens: 1100 }

    expect(() =>
      calculateLLMUsagePrice(
        {
          input: 2,
          output: 4,
          unit: 0.000001,
          currency: 'CNY',
          rules: [
            {
              component: 'input',
              unit_price: 2,
              unit_size: 1_000_000,
              daily_time_window: { time_zone: 'Mars/Olympus', start_time: '08:00', end_time: '20:00' }
            }
          ]
        },
        usage,
        { pricingTime: '2026-08-17T00:00:00.000Z' }
      )
    ).toThrow("Invalid IANA time zone 'Mars/Olympus'")

    expect(() =>
      calculateLLMUsagePrice(
        {
          input: 2,
          output: 4,
          unit: 0.000001,
          currency: 'CNY',
          rules: [
            {
              component: 'input',
              unit_price: 2,
              unit_size: 1_000_000,
              daily_time_window: { time_zone: 'Asia/Shanghai', start_time: '08:00', end_time: '08:00' }
            }
          ]
        },
        usage,
        { pricingTime: '2026-08-17T00:00:00.000Z' }
      )
    ).toThrow('Recurring daily pricing window start_time and end_time must differ')
  })

  it('rejects a calculation that would add prices in different currencies', () => {
    expect(() =>
      calculateLLMUsagePrice(
        {
          input: 0.8,
          output: 2,
          unit: 0.000001,
          currency: 'RMB',
          rules: [
            { component: 'input', unit_price: 0.8, unit_size: 1_000_000, currency: 'RMB' },
            { component: 'output', unit_price: 1.2, unit_size: 1_000_000, currency: 'USD' }
          ]
        },
        { promptTokens: 1000, completionTokens: 100, totalTokens: 1100 }
      )
    ).toThrow('LLM pricing calculation cannot mix currencies')
  })

  it('marks the whole calculation unpriced when a reported add-on has no rule', () => {
    const result = calculateLLMUsagePrice(
      { input: 2, output: 8, unit: 0.000001, currency: 'CNY' },
      { promptTokens: 1000, completionTokens: 100, totalTokens: 1100 },
      { addOns: [{ type: 'grounding', quantity: 1 }] }
    )

    expect(result).toMatchObject({ pricingStatus: 'unpriced', totalAmount: 0.0028 })
    expect(result.breakdown).toContainEqual(
      expect.objectContaining({ component: 'request', addOn: 'grounding', pricingStatus: 'unpriced' })
    )
  })

  it('keeps request-enabled add-ons unpriced when the provider response cannot report actual usage', () => {
    const result = calculateLLMUsagePrice(
      {
        input: 2,
        output: 8,
        unit: 0.000001,
        currency: 'CNY',
        rules: [{ component: 'request', add_on: 'web_search', unit_price: 3, unit_size: 1000 }]
      },
      { promptTokens: 1000, completionTokens: 100, totalTokens: 1100 },
      { unpricedAddOns: [{ type: 'web_search', quantity: 1, authority: 'request' }] }
    )

    expect(result).toMatchObject({ pricingStatus: 'unpriced', totalAmount: 0.0028 })
    expect(result.breakdown).toContainEqual(
      expect.objectContaining({
        component: 'request',
        addOn: 'web_search',
        addOnAuthority: 'request',
        quantity: 1,
        pricingStatus: 'unpriced'
      })
    )
  })

  it('does not fall back to ordinary input pricing when a cache rule needs missing context', () => {
    const result = calculateLLMUsagePrice(
      {
        input: 2,
        output: 8,
        unit: 0.000001,
        currency: 'CNY',
        rules: [
          {
            component: 'cache_write_input',
            cache_ttl: '5m',
            unit_price: 2.5,
            unit_size: 1_000_000
          }
        ]
      },
      {
        promptTokens: 1000,
        completionTokens: 100,
        totalTokens: 1100,
        cacheWriteInputTokens: 200
      }
    )

    expect(result.pricingStatus).toBe('unpriced')
    expect(result.breakdown).toContainEqual(
      expect.objectContaining({ component: 'cache_write_input', quantity: 200, pricingStatus: 'unpriced' })
    )
    expect(result.breakdown).toContainEqual(expect.objectContaining({ component: 'input', quantity: 800 }))
  })

  it('prices mixed cache writes with the provider-reported token count for each TTL', () => {
    const result = calculateLLMUsagePrice(
      {
        input: 3,
        output: 15,
        unit: 0.000001,
        currency: 'USD',
        rules: [
          { component: 'input', unit_price: 3, unit_size: 1_000_000 },
          {
            component: 'cache_write_input',
            cache_ttl: '5m',
            unit_price: 3.75,
            unit_size: 1_000_000
          },
          {
            component: 'cache_write_input',
            cache_ttl: '1h',
            unit_price: 6,
            unit_size: 1_000_000
          }
        ]
      },
      {
        promptTokens: 1000,
        completionTokens: 100,
        totalTokens: 1100,
        cacheWriteInputTokens: 300
      },
      {
        cacheWriteInputTokensByTtl: {
          '5m': 200,
          '1h': 100
        }
      }
    )

    expect(result).toMatchObject({ pricingStatus: 'priced', totalAmount: 0.00495, currency: 'USD' })
    expect(result.breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ component: 'input', quantity: 700, amount: 0.0021 }),
        expect.objectContaining({ component: 'cache_write_input', cacheTtl: '5m', quantity: 200, amount: 0.00075 }),
        expect.objectContaining({ component: 'cache_write_input', cacheTtl: '1h', quantity: 100, amount: 0.0006 })
      ])
    )
  })

  it('rejects cache write TTL details that do not reconcile to the aggregate usage', () => {
    expect(() =>
      calculateLLMUsagePrice(
        {
          input: 3,
          output: 15,
          unit: 0.000001,
          currency: 'USD',
          rules: [
            {
              component: 'cache_write_input',
              cache_ttl: '5m',
              unit_price: 3.75,
              unit_size: 1_000_000
            }
          ]
        },
        {
          promptTokens: 1000,
          completionTokens: 100,
          totalTokens: 1100,
          cacheWriteInputTokens: 300
        },
        { cacheWriteInputTokensByTtl: { '5m': 200, '1h': 50 } }
      )
    ).toThrow('Cache write token counts by TTL must equal cacheWriteInputTokens')
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

  it('prices character and request metrics without converting them to tokens', () => {
    const snapshot = resolveModelUsagePricingSnapshot(
      {
        type: 'usage',
        rules: [
          {
            id: 'tts-input-characters',
            version: '2026-08-17',
            effective_from: '2026-08-17T00:00:00Z',
            unit: 'character',
            component: 'input',
            unit_size: 1_000,
            unit_price: 0.1,
            currency: 'CNY',
            charge_type: 'paid'
          },
          {
            id: 'rerank-request',
            version: '2026-08-17',
            effective_from: '2026-08-17T00:00:00Z',
            unit: 'request',
            component: 'request',
            unit_size: 1,
            unit_price: 0.02,
            currency: 'CNY',
            charge_type: 'paid'
          }
        ]
      },
      {
        model: 'specialized-model',
        modality: 'text',
        operation: AiModelTypeEnum.RERANK,
        startedAt: '2026-08-17T01:00:00Z'
      }
    )

    expect(
      calculateModelUsageCharge(snapshot, {
        key: 'tts-input',
        component: 'input',
        unit: 'character',
        quantity: 2_500,
        authority: 'request'
      })
    ).toEqual(expect.objectContaining({ pricingStatus: 'priced', quantity: 2_500, amount: 0.25 }))
    expect(
      calculateModelUsageCharge(snapshot, {
        key: 'rerank-call',
        component: 'request',
        unit: 'request',
        quantity: 1,
        authority: 'contract'
      })
    ).toEqual(expect.objectContaining({ pricingStatus: 'priced', quantity: 1, amount: 0.02 }))
  })

  it('selects component and per-metric dimensions for multiple metrics with the same unit', () => {
    const snapshot = resolveModelUsagePricingSnapshot(
      {
        type: 'usage',
        rules: [
          {
            id: 'input-image',
            version: '2026-08-17',
            effective_from: '2026-08-17T00:00:00Z',
            unit: 'generation',
            component: 'input',
            unit_size: 1,
            unit_price: 0.1,
            currency: 'CNY',
            charge_type: 'paid'
          },
          {
            id: 'output-image-1k',
            version: '2026-08-17',
            effective_from: '2026-08-17T00:00:00Z',
            unit: 'generation',
            component: 'output',
            unit_size: 1,
            unit_price: 0.2,
            currency: 'CNY',
            charge_type: 'paid',
            dimensions: { resolution: '1k' }
          },
          {
            id: 'output-image-2k',
            version: '2026-08-17',
            effective_from: '2026-08-17T00:00:00Z',
            unit: 'generation',
            component: 'output',
            unit_size: 1,
            unit_price: 0.4,
            currency: 'CNY',
            charge_type: 'paid',
            dimensions: { resolution: '2k' }
          }
        ]
      },
      {
        model: 'image-edit-model',
        modality: 'image',
        operation: 'image_to_image',
        startedAt: '2026-08-17T01:00:00Z'
      }
    )

    expect(snapshot.rules).toHaveLength(3)
    expect(
      calculateModelUsageCharge(snapshot, {
        key: 'input:0',
        component: 'input',
        unit: 'generation',
        quantity: 1,
        authority: 'provider'
      })
    ).toEqual(expect.objectContaining({ pricingRule: expect.objectContaining({ id: 'input-image' }), amount: 0.1 }))
    expect(
      calculateModelUsageCharge(snapshot, {
        key: 'output:0',
        component: 'output',
        pricingDimensions: { resolution: '2k' },
        unit: 'generation',
        quantity: 1,
        authority: 'provider'
      })
    ).toEqual(expect.objectContaining({ pricingRule: expect.objectContaining({ id: 'output-image-2k' }), amount: 0.4 }))
  })

  it('snapshots only the recurring daily usage price active at invocation start', () => {
    const periodicPricing: ModelUsagePricingConfig = {
      type: 'usage',
      rules: [
        {
          id: 'generation-base',
          version: '2026-08-17',
          effective_from: '2026-08-17T00:00:00Z',
          unit: 'generation',
          unit_size: 1,
          unit_price: 2,
          currency: 'CNY',
          charge_type: 'paid'
        },
        {
          id: 'generation-night',
          version: '2026-08-17',
          effective_from: '2026-08-17T00:00:00Z',
          unit: 'generation',
          unit_size: 1,
          unit_price: 1,
          currency: 'CNY',
          charge_type: 'paid',
          daily_time_window: { time_zone: 'Asia/Shanghai', start_time: '20:00', end_time: '08:00' }
        }
      ]
    }

    const snapshot = resolveModelUsagePricingSnapshot(periodicPricing, {
      model: 'periodic-video-model',
      modality: 'video',
      operation: 'text_to_video',
      startedAt: '2026-08-17T13:00:00Z'
    })

    expect(snapshot.rules).toEqual([expect.objectContaining({ id: 'generation-night', unit_price: 1 })])

    expect(
      resolveModelUsagePricingSnapshot(periodicPricing, {
        model: 'periodic-video-model',
        modality: 'video',
        operation: 'text_to_video',
        startedAt: '2026-08-17T02:00:00Z'
      }).rules
    ).toEqual([expect.objectContaining({ id: 'generation-base', unit_price: 2 })])
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
