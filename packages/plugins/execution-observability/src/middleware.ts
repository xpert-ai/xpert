import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import {
  executionObservationQuerySchema,
  executionObservationDetailQuerySchema,
  executionObservationCompareSchema,
  executionObservationAnomalySchema,
  type TAgentMiddlewareMeta,
  type ExecutionObservationSummary
} from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  ExecutionObservabilityRuntimeCapability,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy,
  type AgentMiddleware
} from '@xpert-ai/plugin-sdk'
import { PROVIDER, FEATURE, ICON, TOOL_NAMES, label } from './constants'

// Tools keep complete scalar aggregates; dense interval series belongs to the View.
function compactSummary(summary: ExecutionObservationSummary) {
  const { overlap, ...totals } = summary
  return { ...totals, intervalSeriesOmitted: true }
}

@Injectable()
@AgentMiddlewareStrategy(PROVIDER)
export class ExecutionObservationMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  getToolNames() {
    return TOOL_NAMES
  }
  readonly meta: TAgentMiddlewareMeta = {
    name: PROVIDER,
    label: label('Execution observability', '执行运行分析'),
    description: label('Read-only organization administrator execution analytics.', '组织管理员专用的只读执行分析。'),
    features: [FEATURE],
    icon: ICON,
    configSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): AgentMiddleware {
    const api = context.runtime?.capabilities?.require(ExecutionObservabilityRuntimeCapability)
    if (!api) throw new Error('Execution observability capability is unavailable')
    return {
      name: PROVIDER,
      tools: [
        tool(async (input) => JSON.stringify(await api.query(input)), {
          name: 'execution_query',
          schema: executionObservationQuerySchema,
          verboseParsingErrors: true,
          description:
            'List authorized execution records, paged at the database. Start with a bounded range; reuse returned IDs with execution_get. Dates are record lifecycle timestamps, not verified active phases. Unknown ends remain unknown.',
          metadata: { toolName: label('Query executions', '查询执行记录') }
        }),
        tool(async (input) => JSON.stringify(compactSummary(await api.summary(input))), {
          name: 'execution_summary',
          schema: executionObservationQuerySchema,
          verboseParsingErrors: true,
          description:
            'Summarize all matching records, independent of pagination: statuses, observed lifecycle overlap, duration samples and direct execution ledger usage by currency. Missing phase data cannot prove running concurrency or congestion; usage excludes unlinked descendant charges. Large ranges must be narrowed.',
          metadata: { toolName: label('Summarize executions', '汇总执行情况') }
        }),
        tool(async (input) => JSON.stringify(await api.get(input)), {
          name: 'execution_get',
          schema: executionObservationDetailQuerySchema,
          verboseParsingErrors: true,
          description:
            'Inspect one authorized execution ID discovered by query/summary, its direct child page and usage. Does not expose raw prompts, outputs, credentials or error bodies.',
          metadata: { toolName: label('Inspect execution', '查看执行详情') }
        }),
        tool(
          async (input) => {
            const result = await api.compare(input)
            return JSON.stringify({
              ...result,
              current: compactSummary(result.current),
              baseline: compactSummary(result.baseline)
            })
          },
          {
            name: 'execution_compare',
            schema: executionObservationCompareSchema,
            verboseParsingErrors: true,
            description:
              'Compare two explicitly scoped time windows. Keep filters and counting unit identical for meaningful comparisons. Reports matching records per window hour, including records that started before the window; this is not an arrival rate. Correlation does not establish a cause or capacity limit.',
            metadata: { toolName: label('Compare execution periods', '对比执行时段') }
          }
        ),
        tool(async (input) => JSON.stringify(await api.findAnomalies(input)), {
          name: 'execution_find_anomalies',
          schema: executionObservationAnomalySchema,
          verboseParsingErrors: true,
          description:
            'Find evidence candidates using a named deterministic rule: failed, long_running lifecycle age, or slow_completed reported elapsed time. Threshold unit is milliseconds. These are candidates, not confirmed bottlenecks or root causes; inspect returned execution IDs.',
          metadata: { toolName: label('Find execution anomalies', '查找异常候选') }
        })
      ]
    }
  }
}
