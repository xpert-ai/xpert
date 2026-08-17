import {
  type LLMPriceAddOn,
  type LLMPriceBreakdownItem,
  type LLMPriceCalculation,
  type LLMPriceComponent,
  type LLMPriceContext,
  type LLMPriceRule,
  type ModelUsagePricingSnapshot,
  type ModelUsageMetric,
  type ModelUsagePriceRule,
  type ModelUsagePricingConfig,
  type ModelUsagePricingContext,
  type ModelUsagePricingStatus,
  PriceConfig,
  PriceInfo,
  PriceType,
  type TTokenUsage
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

export function calculateLLMUsagePrice(
  pricing: PriceConfig,
  usage: TTokenUsage,
  context: LLMPriceContext = {}
): LLMPriceCalculation {
  validateLLMPriceRules(pricing.rules ?? [])
  const pricingContext: LLMPriceContext = {
    ...context,
    pricingTime: resolvePricingTime(context.pricingTime)
  }
  const promptTokens = tokenCount(usage.promptTokens, 'promptTokens')
  const completionTokens = tokenCount(usage.completionTokens, 'completionTokens')
  const cacheReadInputTokens = tokenCount(usage.cacheReadInputTokens ?? 0, 'cacheReadInputTokens')
  const cacheWriteInputTokens = tokenCount(usage.cacheWriteInputTokens ?? 0, 'cacheWriteInputTokens')
  const cacheTokens = cacheReadInputTokens + cacheWriteInputTokens
  const inputTokens = context.inputTokensIncludeCache === false ? promptTokens + cacheTokens : promptTokens
  let standardInputTokens = context.inputTokensIncludeCache === false ? promptTokens : promptTokens - cacheTokens
  if (standardInputTokens < 0) {
    throw new Error('Cache read and write tokens cannot exceed prompt tokens when input includes cache tokens')
  }

  const selectionContext: LLMPriceRuleSelectionContext = {
    inputTokens,
    outputTokens: completionTokens,
    context: pricingContext
  }
  const breakdown: LLMPriceBreakdownItem[] = []

  const cacheReadRule = selectLLMPriceRule(pricing.rules, 'cache_read_input', selectionContext)
  if (cacheReadInputTokens > 0) {
    if (cacheReadRule) {
      breakdown.push(priceRuleComponent(cacheReadRule, cacheReadInputTokens, pricing.currency))
    } else if (hasLLMPriceRule(pricing.rules, 'cache_read_input')) {
      breakdown.push(unpricedComponent('cache_read_input', cacheReadInputTokens))
    } else {
      standardInputTokens += cacheReadInputTokens
    }
  }

  for (const cacheWrite of resolveCacheWriteInputTokens(cacheWriteInputTokens, context)) {
    const cacheWriteSelection = {
      ...selectionContext,
      context: {
        ...pricingContext,
        cacheWriteTtl: cacheWrite.cacheTtl
      }
    }
    const cacheWriteRule = selectLLMPriceRule(pricing.rules, 'cache_write_input', cacheWriteSelection)
    if (cacheWriteRule) {
      breakdown.push(
        priceRuleComponent(cacheWriteRule, cacheWrite.quantity, pricing.currency, {
          cacheTtl: cacheWrite.cacheTtl
        })
      )
    } else if (hasLLMPriceRule(pricing.rules, 'cache_write_input')) {
      breakdown.push(unpricedComponent('cache_write_input', cacheWrite.quantity, { cacheTtl: cacheWrite.cacheTtl }))
    } else {
      standardInputTokens += cacheWrite.quantity
    }
  }

  if (standardInputTokens > 0) {
    const inputRule = selectLLMPriceRule(pricing.rules, 'input', selectionContext)
    breakdown.push(
      inputRule
        ? priceRuleComponent(inputRule, standardInputTokens, pricing.currency)
        : hasLLMPriceRule(pricing.rules, 'input')
          ? unpricedComponent('input', standardInputTokens)
          : legacyPriceComponent(pricing, PriceType.INPUT, standardInputTokens, inputTokens)
    )
  }

  if (completionTokens > 0) {
    const outputRule = selectLLMPriceRule(pricing.rules, 'output', selectionContext)
    breakdown.push(
      outputRule
        ? priceRuleComponent(outputRule, completionTokens, pricing.currency)
        : hasLLMPriceRule(pricing.rules, 'output')
          ? unpricedComponent('output', completionTokens)
          : legacyPriceComponent(pricing, PriceType.OUTPUT, completionTokens, inputTokens)
    )
  }

  const addOns = new Map<LLMPriceAddOn, number>()
  for (const addOn of context.addOns ?? []) {
    const quantity = nonNegativeQuantity(addOn.quantity, `add-on '${addOn.type}'`)
    if (quantity === 0) continue
    addOns.set(addOn.type, (addOns.get(addOn.type) ?? 0) + quantity)
  }
  for (const [addOn, quantity] of addOns) {
    const rule = selectLLMPriceRule(pricing.rules, 'request', selectionContext, addOn)
    breakdown.push(
      rule
        ? priceRuleComponent(rule, quantity, pricing.currency, { addOn })
        : unpricedComponent('request', quantity, { addOn })
    )
  }

  for (const addOn of context.unpricedAddOns ?? []) {
    const quantity = nonNegativeQuantity(addOn.quantity, `unpriced add-on '${addOn.type}'`)
    if (quantity === 0) continue
    breakdown.push(
      unpricedComponent('request', quantity, {
        addOn: addOn.type,
        addOnAuthority: addOn.authority
      })
    )
  }

  if (context.cacheStorageTokenHours !== undefined) {
    const quantity = nonNegativeQuantity(context.cacheStorageTokenHours, 'cacheStorageTokenHours')
    if (quantity > 0) {
      const rule = selectLLMPriceRule(pricing.rules, 'cache_storage', selectionContext)
      breakdown.push(
        rule ? priceRuleComponent(rule, quantity, pricing.currency) : unpricedComponent('cache_storage', quantity)
      )
    }
  }

  return summarizeLLMPrice(pricing.currency, breakdown)
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
    return {
      capturedAt,
      ...(context.pricingDimensions ? { pricingDimensions: context.pricingDimensions } : {}),
      rules: []
    }
  }

  const at = new Date(capturedAt)
  const matchingRules = pricing.rules.filter((rule) => matchesUsagePriceRule(rule, context, at))
  const rules: ModelUsagePriceRule[] = []
  for (const rule of matchingRules) {
    validateUsagePriceRule(rule)
    const selector = usagePriceRuleSelector(rule)
    const existingIndex = rules.findIndex((candidate) => usagePriceRuleSelector(candidate) === selector)
    if (existingIndex < 0) {
      rules.push(rule)
      continue
    }

    const existing = rules[existingIndex]
    const existingHasWindow = Boolean(existing.daily_time_window)
    const currentHasWindow = Boolean(rule.daily_time_window)
    if (existingHasWindow === currentHasWindow) {
      throw new Error(`Ambiguous usage pricing rules for unit '${rule.unit}'`)
    }
    if (currentHasWindow) rules[existingIndex] = rule
  }

  return {
    capturedAt,
    ...(context.pricingDimensions ? { pricingDimensions: context.pricingDimensions } : {}),
    rules
  }
}

export function calculateModelUsageCharge(
  snapshot: ModelUsagePricingSnapshot | null | undefined,
  metric: ModelUsageMetric
): ModelUsageChargeCalculation {
  const rule = selectUsagePriceRule(snapshot, metric)
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
  if (rule.daily_time_window) {
    validateRecurringDailyWindow(rule.daily_time_window)
    if (!isInRecurringDailyWindow(rule.daily_time_window, at)) return false
  }

  const dimensions = context.pricingDimensions ?? {}
  return Object.entries(rule.dimensions ?? {}).every(([key, value]) => {
    if (key === 'resolution') return dimensions.resolution === undefined || dimensions.resolution === value
    if (key === 'audio') return dimensions.audio === undefined || dimensions.audio === value
    if (key === 'videoInput') return dimensions.videoInput === undefined || dimensions.videoInput === value
    if (key === 'mode') return dimensions.mode === undefined || dimensions.mode === value
    return false
  })
}

function selectUsagePriceRule(snapshot: ModelUsagePricingSnapshot | null | undefined, metric: ModelUsageMetric) {
  const dimensions = {
    ...(snapshot?.pricingDimensions ?? {}),
    ...(metric.pricingDimensions ?? {})
  }
  const matches = (snapshot?.rules ?? []).filter((rule) => {
    if (rule.unit !== metric.unit) return false
    if (rule.component && rule.component !== metric.component) return false
    return matchesUsagePriceDimensions(rule, dimensions)
  })
  if (!matches.length) return undefined

  const specificity = Math.max(...matches.map(usagePriceRuleSpecificity))
  const mostSpecific = matches.filter((rule) => usagePriceRuleSpecificity(rule) === specificity)
  if (mostSpecific.length > 1) {
    throw new Error(`Ambiguous usage pricing rules for metric '${metric.key ?? metric.unit}'`)
  }
  return mostSpecific[0]
}

function matchesUsagePriceDimensions(
  rule: ModelUsagePriceRule,
  dimensions: NonNullable<ModelUsagePricingSnapshot['pricingDimensions']>
) {
  return Object.entries(rule.dimensions ?? {}).every(([key, value]) => {
    if (key === 'resolution') return dimensions.resolution === value
    if (key === 'audio') return dimensions.audio === value
    if (key === 'videoInput') return dimensions.videoInput === value
    if (key === 'mode') return dimensions.mode === value
    return false
  })
}

function usagePriceRuleSpecificity(rule: ModelUsagePriceRule) {
  return (rule.component ? 1 : 0) + Object.keys(rule.dimensions ?? {}).length
}

function usagePriceRuleSelector(rule: ModelUsagePriceRule) {
  return JSON.stringify([
    rule.unit,
    rule.token_type ?? null,
    rule.component ?? null,
    Object.entries(rule.dimensions ?? {}).sort(([left], [right]) => left.localeCompare(right))
  ])
}

function validateUsagePriceRule(rule: ModelUsagePriceRule) {
  if (!rule.id?.trim() || !rule.version?.trim()) throw new Error('Usage pricing rules require id and version')
  if (rule.component && !['input', 'output', 'request'].includes(rule.component)) {
    throw new Error(`Usage pricing rule '${rule.id}' has an invalid component`)
  }
  if (!Number.isFinite(Number(rule.unit_size)) || Number(rule.unit_size) <= 0) {
    throw new Error(`Usage pricing rule '${rule.id}' requires a positive unit_size`)
  }
  if (rule.unit !== 'token' && rule.token_type) {
    throw new Error(`Usage pricing rule '${rule.id}' can only use token_type with token pricing`)
  }
  if (rule.daily_time_window) validateRecurringDailyWindow(rule.daily_time_window)
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

type LLMPriceRuleSelectionContext = {
  inputTokens: number
  outputTokens: number
  context: LLMPriceContext
}

function hasLLMPriceRule(rules: LLMPriceRule[] | undefined, component: LLMPriceComponent) {
  return rules?.some((rule) => rule.component === component) ?? false
}

function selectLLMPriceRule(
  rules: LLMPriceRule[] | undefined,
  component: LLMPriceComponent,
  selection: LLMPriceRuleSelectionContext,
  addOn?: LLMPriceAddOn
) {
  const matches = (rules ?? []).filter((rule) => {
    if (rule.component !== component) return false
    if (component === 'request' && rule.add_on !== addOn) return false
    if (rule.cache_ttl && rule.cache_ttl !== selection.context.cacheWriteTtl) return false
    if (rule.mode && rule.mode !== selection.context.mode) return false
    if (rule.region && rule.region !== selection.context.region) return false
    if (rule.service_tier && rule.service_tier !== selection.context.serviceTier) return false
    if (rule.daily_time_window && !isInRecurringDailyWindow(rule.daily_time_window, selection.context.pricingTime)) {
      return false
    }
    if (rule.min_input_tokens !== undefined && selection.inputTokens < Number(rule.min_input_tokens)) return false
    if (rule.max_input_tokens !== undefined && selection.inputTokens > Number(rule.max_input_tokens)) return false
    if (rule.min_output_tokens !== undefined && selection.outputTokens < Number(rule.min_output_tokens)) return false
    if (rule.max_output_tokens !== undefined && selection.outputTokens > Number(rule.max_output_tokens)) return false
    return true
  })
  if (!matches.length) return undefined

  const specificity = Math.max(...matches.map(ruleSpecificity))
  const mostSpecific = matches.filter((rule) => ruleSpecificity(rule) === specificity)
  if (mostSpecific.length > 1) {
    throw new Error(`Ambiguous LLM pricing rules for component '${component}'`)
  }
  return mostSpecific[0]
}

function ruleSpecificity(rule: LLMPriceRule) {
  return [
    rule.min_input_tokens,
    rule.max_input_tokens,
    rule.min_output_tokens,
    rule.max_output_tokens,
    rule.mode,
    rule.region,
    rule.service_tier,
    rule.add_on,
    rule.cache_ttl,
    rule.daily_time_window
  ].filter((value) => value !== undefined).length
}

function validateLLMPriceRules(rules: LLMPriceRule[]) {
  for (const rule of rules) {
    if (!Number.isFinite(Number(rule.unit_price)) || Number(rule.unit_price) < 0) {
      throw new Error(`LLM pricing rule '${rule.component}' requires a non-negative unit_price`)
    }
    if (!Number.isFinite(Number(rule.unit_size)) || Number(rule.unit_size) <= 0) {
      throw new Error(`LLM pricing rule '${rule.component}' requires a positive unit_size`)
    }
    if (rule.currency !== undefined && !rule.currency.trim()) {
      throw new Error(`LLM pricing rule '${rule.component}' requires a non-empty currency when provided`)
    }
    validateTokenRange(rule, 'input', rule.min_input_tokens, rule.max_input_tokens)
    validateTokenRange(rule, 'output', rule.min_output_tokens, rule.max_output_tokens)
    if (rule.component === 'request' && !rule.add_on) {
      throw new Error('LLM request pricing rules require add_on')
    }
    if (rule.component !== 'request' && rule.add_on) {
      throw new Error(`LLM pricing rule '${rule.component}' cannot declare add_on`)
    }
    if (rule.component !== 'cache_write_input' && rule.cache_ttl) {
      throw new Error(`LLM pricing rule '${rule.component}' cannot declare cache_ttl`)
    }
    if (rule.daily_time_window) validateRecurringDailyWindow(rule.daily_time_window)
  }
}

function validateTokenRange(rule: LLMPriceRule, name: 'input' | 'output', min?: number, max?: number) {
  const normalizedMin = min === undefined ? undefined : Number(min)
  const normalizedMax = max === undefined ? undefined : Number(max)
  if (normalizedMin !== undefined) tokenCount(normalizedMin, `min_${name}_tokens`)
  if (normalizedMax !== undefined) tokenCount(normalizedMax, `max_${name}_tokens`)
  if (normalizedMin !== undefined && normalizedMax !== undefined && normalizedMin > normalizedMax) {
    throw new Error(`LLM pricing rule '${rule.component}' has an invalid ${name} token range`)
  }
}

function validateRecurringDailyWindow(window: NonNullable<LLMPriceRule['daily_time_window']>) {
  validateTimeZone(window.time_zone)
  const start = parseLocalTime(window.start_time, 'start_time')
  const end = parseLocalTime(window.end_time, 'end_time')
  if (start === end) {
    throw new Error('Recurring daily pricing window start_time and end_time must differ')
  }
}

function validateTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format()
  } catch {
    throw new Error(`Invalid IANA time zone '${timeZone}'`)
  }
}

function parseLocalTime(value: string, name: 'start_time' | 'end_time') {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!match) {
    throw new Error(`Recurring daily pricing window ${name} must use HH:mm or HH:mm:ss`)
  }
  const hour = Number(match[1])
  const minute = Number(match[2])
  const second = Number(match[3] ?? 0)
  if (hour > 23 || minute > 59 || second > 59) {
    throw new Error(`Recurring daily pricing window ${name} must be a valid wall-clock time`)
  }
  return hour * 3600 + minute * 60 + second
}

function isInRecurringDailyWindow(
  window: NonNullable<LLMPriceRule['daily_time_window']>,
  pricingTime: Date | string | undefined
) {
  const instant = resolvePricingTime(pricingTime)
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: window.time_zone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  const values = Object.fromEntries(
    formatter
      .formatToParts(instant)
      .filter((part) => part.type === 'hour' || part.type === 'minute' || part.type === 'second')
      .map((part) => [part.type, Number(part.value)])
  )
  const localTime = values['hour'] * 3600 + values['minute'] * 60 + values['second']
  const start = parseLocalTime(window.start_time, 'start_time')
  const end = parseLocalTime(window.end_time, 'end_time')
  return start < end ? localTime >= start && localTime < end : localTime >= start || localTime < end
}

function resolvePricingTime(value: Date | string | undefined) {
  const instant = value instanceof Date ? new Date(value.getTime()) : value === undefined ? new Date() : new Date(value)
  if (!Number.isFinite(instant.getTime())) {
    throw new Error('pricingTime must be a valid date')
  }
  return instant
}

function priceRuleComponent(
  rule: LLMPriceRule,
  quantity: number,
  fallbackCurrency: string,
  qualifiers: Pick<LLMPriceBreakdownItem, 'addOn' | 'cacheTtl'> = {}
): LLMPriceBreakdownItem {
  const unitPrice = Number(rule.unit_price)
  const unit = 1 / Number(rule.unit_size)
  const amount = roundCharge(quantity * unitPrice * unit)
  return {
    component: rule.component,
    quantity,
    pricingStatus: unitPrice === 0 ? 'free' : 'priced',
    unitPrice,
    unit,
    amount,
    currency: normalizeCurrency(rule.currency ?? fallbackCurrency),
    ...qualifiers,
    rule
  }
}

function legacyPriceComponent(
  pricing: PriceConfig,
  priceType: PriceType,
  quantity: number,
  inputTokens: number
): LLMPriceBreakdownItem {
  const price = calculateModelPrice(pricing, priceType, quantity, inputTokens)
  return {
    component: priceType,
    quantity,
    pricingStatus: price.unitPrice === 0 ? 'free' : 'priced',
    unitPrice: price.unitPrice,
    unit: price.unit,
    amount: price.totalAmount,
    currency: normalizeCurrency(price.currency)
  }
}

function unpricedComponent(
  component: LLMPriceComponent,
  quantity: number,
  qualifiers: Pick<LLMPriceBreakdownItem, 'addOn' | 'addOnAuthority' | 'cacheTtl'> = {}
): LLMPriceBreakdownItem {
  return {
    component,
    quantity,
    pricingStatus: 'unpriced',
    ...qualifiers
  }
}

function tokenCount(value: number, name: string) {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative integer`)
  }
  return value
}

function nonNegativeQuantity(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number`)
  }
  return value
}

function resolveCacheWriteInputTokens(total: number, context: LLMPriceContext) {
  if (!context.cacheWriteInputTokensByTtl) {
    return total > 0 ? [{ quantity: total, cacheTtl: context.cacheWriteTtl }] : []
  }

  const cacheWrites = (['5m', '1h'] as const)
    .map((cacheTtl) => ({
      cacheTtl,
      quantity: tokenCount(
        context.cacheWriteInputTokensByTtl?.[cacheTtl] ?? 0,
        `cacheWriteInputTokensByTtl.${cacheTtl}`
      )
    }))
    .filter(({ quantity }) => quantity > 0)
  const detailedTotal = cacheWrites.reduce((sum, item) => sum + item.quantity, 0)
  if (detailedTotal !== total) {
    throw new Error('Cache write token counts by TTL must equal cacheWriteInputTokens')
  }
  return cacheWrites
}

function summarizeLLMPrice(currency: string, breakdown: LLMPriceBreakdownItem[]): LLMPriceCalculation {
  const hasUnpricedComponent = breakdown.some((item) => item.pricingStatus === 'unpriced')
  const hasPaidComponent = breakdown.some((item) => item.pricingStatus === 'priced')
  const currencies = new Set(
    breakdown
      .map((item) => item.currency)
      .filter((value): value is string => Boolean(value))
      .map(normalizeCurrency)
  )
  if (currencies.size > 1) {
    throw new Error('LLM pricing calculation cannot mix currencies')
  }
  return {
    pricingStatus: hasUnpricedComponent ? 'unpriced' : hasPaidComponent ? 'priced' : 'free',
    totalAmount: Number(breakdown.reduce((total, item) => total + (item.amount ?? 0), 0).toFixed(7)),
    currency: currencies.values().next().value ?? normalizeCurrency(currency),
    breakdown
  }
}

function normalizeCurrency(currency: string) {
  return currency.trim().toUpperCase()
}
