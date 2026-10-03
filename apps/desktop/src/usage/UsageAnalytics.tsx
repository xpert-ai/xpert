import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '../ui'
import { invoke } from '../host'
import { t } from '../i18n'
import { formatNumber, RangeControl, UsageState, useUsageResource } from './shared'
import { UsageChart } from './UsageChart'
import type { UsageQuery, UsageBucket } from './types'

export function UsageAnalytics({
  query,
  days,
  onDays,
  refresh,
  onRefresh,
  onDrill
}: {
  query: UsageQuery
  days: 7 | 30
  onDays: (value: 7 | 30) => void
  refresh: number
  onRefresh: () => void
  onDrill: (filter: Pick<UsageQuery, 'model' | 'threadId' | 'xpertId'>, label: string) => void
}) {
  const resource = useUsageResource(`${JSON.stringify(query)}:${refresh}`, () => invoke('usageOverview', query))
  const [dimension, setDimension] = useState<'topThreads' | 'topXperts' | 'topModels'>('topThreads')
  const buckets = useMemo(() => {
    const existing = new Map(resource.data?.buckets.map((row) => [row.date.slice(0, 10), row]))
    const result: UsageBucket[] = []
    const cursor = new Date(query.start)
    for (let i = 0; i < days; i++) {
      const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`
      result.push(existing.get(key) ?? { date: key, pointsUsed: 0, tokenUsed: 0 })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return result
  }, [resource.data, query.start, days])
  const data = resource.data
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{t('Usage trend')}</h3>
        <RangeControl days={days} onChange={onDays} />
      </div>
      <UsageState {...resource} onRetry={onRefresh}>
        <section aria-label={t('Usage trend')}>
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">{t('Points consumed')}</p>
            <p className="mt-1 text-4xl font-semibold tabular-nums">
              {formatNumber(data?.buckets.reduce((sum, row) => sum + row.pointsUsed, 0))}
            </p>
          </div>
          {!data?.buckets.length ? (
            <p className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              {t('No usage records in this date range.')}
            </p>
          ) : (
            <>
              <UsageChart buckets={buckets} />
              <details className="mt-3 text-xs text-muted-foreground">
                <summary className="cursor-pointer">{t('View daily data')}</summary>
                <table className="mt-2 w-full text-left">
                  <thead>
                    <tr>
                      <th className="py-2">{t('Date')}</th>
                      <th>{t('Points consumed')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buckets.map((row) => (
                      <tr key={row.date} className="border-t">
                        <td className="py-2">{row.date}</td>
                        <td>{formatNumber(row.pointsUsed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          )}
        </section>
        <section aria-labelledby="usage-ranking">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 id="usage-ranking" className="text-lg font-semibold">
                {t('Usage ranking')}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('Top 5, sorted by points. Select a row to view deductions.')}
              </p>
            </div>
            <div role="group" aria-label={t('Ranking dimension')} className="flex rounded-xl bg-muted p-1">
              {(['topThreads', 'topXperts', 'topModels'] as const).map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant="ghost"
                  aria-pressed={dimension === value}
                  className={`h-8 ${dimension === value ? 'bg-background text-accent-foreground shadow-sm' : ''}`}
                  onClick={() => setDimension(value)}
                >
                  {t(value === 'topThreads' ? 'Conversations' : value === 'topXperts' ? 'Assistants' : 'Models')}
                </Button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-normal">
                    {t(dimension === 'topThreads' ? 'Conversation' : dimension === 'topXperts' ? 'Assistant' : 'Model')}
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-normal">{t('Points consumed')}</th>
                </tr>
              </thead>
              <tbody>
                {data?.[dimension].slice(0, 5).map((row) => (
                  <tr key={row.key} className="border-t hover:bg-muted/40">
                    <td>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-4 py-3.5 text-left focus-visible:outline-ring"
                        onClick={() =>
                          onDrill(
                            dimension === 'topThreads'
                              ? { threadId: row.key }
                              : dimension === 'topXperts'
                                ? { xpertId: row.key }
                                : { model: row.key },
                            row.label
                          )
                        }
                      >
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        <span className="line-clamp-2 break-all">{row.label}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{formatNumber(row.pointsUsed)}</td>
                  </tr>
                ))}
                {!data?.[dimension].length && (
                  <tr>
                    <td colSpan={2} className="p-8 text-center text-muted-foreground">
                      {t('No ranked usage in this date range.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </UsageState>
    </div>
  )
}
