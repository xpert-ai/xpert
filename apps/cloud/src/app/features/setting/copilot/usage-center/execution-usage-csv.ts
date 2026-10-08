import { modelExecutionSourceId } from '@xpert-ai/contracts'
import type { IModelUsageLedger } from '@xpert-ai/contracts'

/** Export facts, not a sum of the same attempt's account and task rollups. */
export function executionUsageCsv(items: IModelUsageLedger[]): string {
  const rows = [
    [
      'attempt_id',
      'entry',
      'environment',
      'assistant_version',
      'conversation',
      'execution',
      'tool',
      'tool_version',
      'model',
      'input_tokens',
      'output_tokens',
      'total_tokens',
      'cache_read_tokens',
      'cache_write_tokens',
      'reasoning_tokens',
      'pricing_status',
      'amount',
      'currency'
    ]
  ]
  for (const item of items) {
    const context = item.executionContext
    rows.push(
      [
        item.requestId,
        item.usageChannel ?? 'xpert',
        context?.environment.type,
        context?.assistantVersion,
        context?.conversationId,
        context ? modelExecutionSourceId(context.source) : undefined,
        context?.tool.id,
        context?.tool.version,
        item.model,
        item.promptTokens,
        item.completionTokens,
        item.totalTokens,
        item.tokenDetails?.cacheReadInputTokens,
        item.tokenDetails?.cacheWriteInputTokens,
        item.tokenDetails?.reasoningTokens,
        item.charge?.pricingStatus,
        item.charge?.amount,
        item.charge?.currency
      ].map((value) => (value == null ? '' : String(value)))
    )
  }
  return (
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((value) => {
            const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value
            return `"${safe.replace(/"/g, '""')}"`
          })
          .join(',')
      )
      .join('\r\n')
  )
}
