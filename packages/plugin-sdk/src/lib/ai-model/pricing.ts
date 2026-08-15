import {
  type ModelUsagePricingSnapshot,
  type ModelUsageMetric,
  type ModelUsagePriceRule,
  type ModelUsagePricingConfig,
  type ModelUsagePricingContext,
  type ModelUsagePricingStatus,
  PriceConfig,
  PriceInfo,
  PriceType
} from '@xpert-ai/contracts'

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

export type ModelUsageChargeCalculation = {
  pricingStatus: ModelUsagePricingStatus
  pricingRule?: ModelUsagePriceRule
  quantity: number
  unitSize?: number
  unitPrice?: number
  currency?: string
  amount?: number
}

export function resolveModelUsagePricingSnapshot(
  pricing: PriceConfig | ModelUsagePricingConfig | undefined,
  context: ModelUsagePricingContext
): ModelUsagePricingSnapshot {
  const capturedAt = normalizeDate(context.startedAt)?.toISOString() ?? new Date().toISOString()
  if (!isModelUsagePricingConfig(pricing)) {
    return { capturedAt, rules: [] }
  }

  const at = new Date(capturedAt)
  const rules = pricing.rules.filter((rule) => matchesUsagePriceRule(rule, context, at))
  const units = new Set<ModelUsageMetric['unit']>()
  for (const rule of rules) {
    validateUsagePriceRule(rule)
    if (units.has(rule.unit)) {
      throw new Error(`Ambiguous usage pricing rules for unit '${rule.unit}'`)
    }
    units.add(rule.unit)
  }

  return {
    capturedAt,
    rules
  }
}

export function calculateModelUsageCharge(
  snapshot: ModelUsagePricingSnapshot | null | undefined,
  metric: ModelUsageMetric
): ModelUsageChargeCalculation {
  const rule = snapshot?.rules.find((candidate) => candidate.unit === metric.unit)
  const fallbackQuantity = metricQuantity(metric)
  if (!rule) {
    return { pricingStatus: 'unpriced', quantity: fallbackQuantity }
  }

  const quantity = rule.unit === 'token' ? tokenQuantity(metric, rule.token_type) : fallbackQuantity
  if (rule.charge_type === 'free') {
    return {
      pricingStatus: 'free',
      pricingRule: rule,
      quantity,
      unitSize: rule.unit_size,
      unitPrice: 0,
      ...(rule.currency ? { currency: rule.currency } : {}),
      amount: 0
    }
  }

  const unitPrice = Number(rule.unit_price)
  const unitSize = Number(rule.unit_size)
  return {
    pricingStatus: 'priced',
    pricingRule: rule,
    quantity,
    unitSize,
    unitPrice,
    currency: rule.currency,
    amount: roundCharge((quantity / unitSize) * unitPrice)
  }
}

export function isModelUsagePricingConfig(
  pricing: PriceConfig | ModelUsagePricingConfig | undefined
): pricing is ModelUsagePricingConfig {
  return pricing !== undefined && 'type' in pricing && pricing.type === 'usage' && Array.isArray(pricing.rules)
}

function matchesUsagePriceRule(rule: ModelUsagePriceRule, context: ModelUsagePricingContext, at: Date) {
  const effectiveFrom = normalizeDate(rule.effective_from)
  const effectiveTo = normalizeDate(rule.effective_to)
  if (!effectiveFrom || effectiveFrom > at || (effectiveTo && effectiveTo <= at)) return false
  if (rule.operations?.length && !rule.operations.includes(context.operation)) return false

  const dimensions = context.pricingDimensions ?? {}
  return Object.entries(rule.dimensions ?? {}).every(([key, value]) => {
    if (key === 'resolution') return dimensions.resolution === value
    if (key === 'audio') return dimensions.audio === value
    if (key === 'videoInput') return dimensions.videoInput === value
    if (key === 'mode') return dimensions.mode === value
    return false
  })
}

function validateUsagePriceRule(rule: ModelUsagePriceRule) {
  if (!rule.id?.trim() || !rule.version?.trim()) throw new Error('Usage pricing rules require id and version')
  if (!Number.isFinite(Number(rule.unit_size)) || Number(rule.unit_size) <= 0) {
    throw new Error(`Usage pricing rule '${rule.id}' requires a positive unit_size`)
  }
  if (rule.unit !== 'token' && rule.token_type) {
    throw new Error(`Usage pricing rule '${rule.id}' can only use token_type with token pricing`)
  }
  if (rule.charge_type === 'paid') {
    if (!Number.isFinite(Number(rule.unit_price)) || Number(rule.unit_price) <= 0 || !rule.currency?.trim()) {
      throw new Error(`Paid usage pricing rule '${rule.id}' requires unit_price and currency`)
    }
  }
}

function metricQuantity(metric: ModelUsageMetric) {
  if (metric.unit !== 'token') return finiteQuantity(metric.quantity)
  return finiteQuantity(metric.totalTokens ?? metric.promptTokens ?? metric.completionTokens)
}

function tokenQuantity(metric: ModelUsageMetric, tokenType: ModelUsagePriceRule['token_type']) {
  if (metric.unit !== 'token') return 0
  if (tokenType === 'prompt') return finiteQuantity(metric.promptTokens)
  if (tokenType === 'completion') return finiteQuantity(metric.completionTokens)
  return finiteQuantity(metric.totalTokens)
}

function finiteQuantity(value: number | null | undefined) {
  const quantity = Number(value)
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0
}

function normalizeDate(value: Date | string | undefined) {
  if (!value) return undefined
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function roundCharge(value: number) {
  return Number(value.toFixed(10))
}
