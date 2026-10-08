import { AiModelTypeEnum, IModelUsageLedger } from '@xpert-ai/contracts'
import { executionUsageCsv } from './execution-usage-csv'

function usage(model: string): IModelUsageLedger {
  return {
    requestId: 'attempt',
    revision: 1,
    originType: 'execution',
    originId: 'run',
    copilotId: 'copilot',
    providerScopeId: 'scope',
    provider: 'provider',
    model,
    modelType: AiModelTypeEnum.LLM,
    modality: 'text',
    operation: AiModelTypeEnum.LLM,
    metricKey: 'tokens',
    unit: 'token',
    authority: 'provider',
    recordedAt: new Date(),
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    tokenDetails: { cacheReadInputTokens: 4, reasoningTokens: 2 }
  }
}

describe('execution usage CSV export', () => {
  it('preserves actual totals and keeps missing prices empty', () => {
    const lines = executionUsageCsv([usage('model')]).split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('"cache_read_tokens","cache_write_tokens","reasoning_tokens"')
    expect(lines[1]).toContain('"10","5","15","4","","2","","",""')
  })
  it.each(['=SUM(1,2)', '+cmd', '-cmd', '@cmd', '\t=cmd'])('neutralizes spreadsheet formulas in %j', (model) => {
    expect(executionUsageCsv([usage(model)])).toContain(`"'${model}"`)
  })
  it('quotes commas, line breaks and double quotes without creating extra cells', () => {
    expect(executionUsageCsv([usage('a,"b"\nc')])).toContain('"a,""b""\nc"')
  })
})
