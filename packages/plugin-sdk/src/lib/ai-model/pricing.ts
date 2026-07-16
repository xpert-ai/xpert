import { PriceConfig, PriceInfo, PriceType } from '@xpert-ai/contracts'

export function calculateModelPrice(
  pricing: PriceConfig,
  priceType: PriceType,
  tokens: number,
  inputTokens = tokens
): PriceInfo {
  const tier = pricing.tiered_pricing?.find(({ max_tokens }) => inputTokens <= Number(max_tokens))
  const configuredUnitPrice =
    priceType === PriceType.INPUT ? (tier?.input ?? pricing.input) : (tier?.output ?? pricing.output)
  const unitPrice = Number(configuredUnitPrice)

  if (!Number.isFinite(unitPrice)) {
    return {
      unitPrice: 0,
      unit: 0,
      totalAmount: 0,
      currency: 'USD'
    }
  }

  return {
    unitPrice,
    unit: Number(pricing.unit),
    totalAmount: Number((tokens * unitPrice * Number(pricing.unit)).toFixed(7)),
    currency: pricing.currency
  }
}
