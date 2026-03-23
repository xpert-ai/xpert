import { TThreadContextUsageEvent } from '@cloud/app/@core'

type THistoricalMessage = {
  role?: string | null
  execution?: {
    tokens?: number | string | null
  } | null
}

export type TContextUsageSource = 'realtime' | 'historical'

export function toPositiveNumber(value: unknown): number {
  const number = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

export function getHistoricalContextTokens(messages?: THistoricalMessage[] | null): number {
  if (!messages?.length) {
    return 0
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'ai') {
      continue
    }

    const tokens = toPositiveNumber(message.execution?.tokens)
    if (tokens > 0) {
      return tokens
    }
  }

  return 0
}

export function resolveContextUsage(options: {
  answering?: boolean | null
  realtimeUsage?: TThreadContextUsageEvent | null
  historicalTokens?: number | null
}) {
  const realtimeTokens = toPositiveNumber(options.realtimeUsage?.usage?.totalTokens)
  const historicalTokens = toPositiveNumber(options.historicalTokens)

  if (options.realtimeUsage) {
    if (realtimeTokens > 0) {
      return {
        source: 'realtime' as const,
        usedTokens: realtimeTokens
      }
    }
  }

  if (historicalTokens > 0) {
    return {
      source: 'historical' as const,
      usedTokens: historicalTokens
    }
  }

  return {
    source: null,
    usedTokens: 0
  }
}

export function buildContextUsageTooltip(options: {
  usedTokens: number
  contextWindowSize: number | null
  usage?: TThreadContextUsageEvent | null
}) {
  const usedTokens = toPositiveNumber(options.usedTokens)
  const contextWindowSize = toPositiveNumber(options.contextWindowSize)

  if (!usedTokens || !contextWindowSize) {
    return null
  }

  const percent = Math.min(Math.round((usedTokens / contextWindowSize) * 100), 100)
  const lines = [
    'Context window:',
    `${percent}% full`,
    `${formatCompactTokens(usedTokens)} / ${formatCompactTokens(contextWindowSize)} tokens used`
  ]

  if (options.usage && toPositiveNumber(options.usage.usage.totalTokens) === usedTokens) {
    lines.push(
      `Input: ${formatCompactTokens(options.usage.usage.inputTokens)}  Output: ${formatCompactTokens(options.usage.usage.outputTokens)}`
    )
  }

  return lines.join('\n')
}

export function formatCompactTokens(value: number) {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: value >= 100000 ? 0 : 1
  })
    .format(value)
    .toLowerCase()
}
