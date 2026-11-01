import { useEffect, useState } from 'react'
import { z } from 'zod/v3'
import { Button } from '@xpert-ai/shadcn-ui'
import {
  executionObservationSummarySchema,
  type ExecutionObservationQuery,
  type ExecutionObservationSummary
} from '@xpert-ai/contracts'
import { request } from './bridge'
import { queryParameters } from './navigation'
import { useI18n } from './i18n'

export function SummaryMetrics({ query }: { query: ExecutionObservationQuery }) {
  const { t, number, currency } = useI18n()
  const [data, setData] = useState<ExecutionObservationSummary | null>(null),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setData(null)
    setFailed(false)
    request('requestData', { query: { parameters: { ...queryParameters(query), operation: 'summary' } } })
      .then((response) => {
        const value = z.object({ item: executionObservationSummarySchema }).parse(response).item
        if (active) setData(value)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [query, retry])
  if (!data)
    return (
      <div role={failed ? 'alert' : 'status'} className="py-4 text-sm text-muted-foreground">
        {t(failed ? 'failed' : 'loading')}
        {failed && (
          <Button variant="ghost" onClick={() => setRetry(retry + 1)}>
            {t('retry')}
          </Button>
        )}
      </div>
    )
  return (
    <dl className="space-y-4 text-sm">
      <div>
        <dt className="text-muted-foreground">{t('successRate')}</dt>
        <dd className="text-xl font-semibold">
          {data.successRate === null ? t('missing') : `${number(data.successRate * 100)}%`}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{t('p95')}</dt>
        <dd>
          {data.p95ElapsedMs === null ? t('missing') : `${number(data.p95ElapsedMs / 1000)} s`} ·{' '}
          {t('samples', { count: data.durationSamples })}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{t('tokens')}</dt>
        <dd>{data.usage.totalTokens === null ? t('missing') : number(data.usage.totalTokens)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{t('cost')}</dt>
        <dd>
          {data.usage.currencies.length
            ? data.usage.currencies.map((cost) => currency(cost.amount, cost.currency)).join(' · ')
            : t('missing')}
        </dd>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('usageNote')} {t('coverage', { count: data.usage.coveredExecutions })} ·{' '}
        {t('unpriced', { count: data.usage.unpricedRecords })}
      </p>
    </dl>
  )
}
