import { useState } from 'react'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { Button, Input } from '../ui'
import { invoke } from '../host'
import { t } from '../i18n'
import { formatDate, formatNumber, RangeControl, summaryTitle, UsageState, useUsageResource } from './shared'
import type { UsageQuery, UsageSummary } from './types'

const PAGE_SIZE = 5

function DeductionInspector({
  summary,
  query,
  refresh,
  onRefresh
}: {
  summary: UsageSummary
  query: UsageQuery
  refresh: number
  onRefresh: () => void
}) {
  const [pages, setPages] = useState([0])
  const skip = pages[pages.length - 1]
  const resource = useUsageResource(`${JSON.stringify(query)}:${refresh}:${skip}`, () =>
    invoke('usageEntries', { ...query, group: summary.group, take: 20, skip })
  )
  return (
    <aside className="min-w-0 border-t p-5 xl:border-t-0 xl:border-l" aria-label={t('Deduction records')}>
      <h4 className="text-sm font-semibold">{t('Deduction records')}</h4>
      <p className="mt-3 break-words text-xl font-semibold">{summaryTitle(summary)}</p>
      <p className="mt-2 text-xs text-muted-foreground">{formatDate(summary.firstUsedAt, true)}</p>
      <div className="my-5 border-y py-5">
        <p className="text-sm text-muted-foreground">{t('Points deducted')}</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums text-accent-foreground">
          {formatNumber(summary.pointsUsed)}
        </p>
      </div>
      <dl className="mb-5 space-y-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t('Model')}</dt>
          <dd className="break-all text-right">{summary.group.model || '—'}</dd>
        </div>
      </dl>
      <UsageState {...resource} onRetry={onRefresh}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                {['Time', 'Points', 'Source'].map((key) => (
                  <th key={key} className="px-2 py-3 font-normal">
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resource.data?.items.map((entry, index) => (
                <tr key={entry.id ?? index} className="border-t">
                  <td className="px-2 py-3">{formatDate(entry.createdAt, true)}</td>
                  <td className="px-2 py-3 tabular-nums">{formatNumber(entry.points)}</td>
                  <td className="px-2 py-3">
                    {t(
                      entry.source === 'usage'
                        ? 'Plan points'
                        : entry.source === 'personal_usage'
                          ? 'Personal points'
                          : 'Unknown source'
                    )}
                  </td>
                </tr>
              ))}
              {!resource.data?.items.length && (
                <tr>
                  <td colSpan={3} className="p-4 text-muted-foreground">
                    {t('No matching deductions on this page.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pages.length === 1}
            onClick={() => setPages((value) => value.slice(0, -1))}
          >
            {t('Previous')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={resource.data?.nextSkip == null}
            onClick={() => {
              const next = resource.data?.nextSkip
              if (next != null) setPages((value) => [...value, next])
            }}
          >
            {t('More records')}
          </Button>
        </div>
      </UsageState>
    </aside>
  )
}

export function UsageDetails({
  query,
  days,
  onDays,
  refresh,
  onRefresh,
  filterLabel,
  onFilter,
  onClear,
  onAnalytics
}: {
  query: UsageQuery
  days: 7 | 30
  onDays: (days: 7 | 30) => void
  refresh: number
  onRefresh: () => void
  filterLabel: string
  onFilter: (model: string) => void
  onClear: () => void
  onAnalytics: () => void
}) {
  const [skip, setSkip] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [model, setModel] = useState(query.model ?? '')
  const resource = useUsageResource(`${JSON.stringify(query)}:${refresh}:${skip}`, () =>
    invoke('usageSummaries', { ...query, take: PAGE_SIZE, skip })
  )
  const summary = resource.data?.items.find((row) => JSON.stringify(row.group) === selected) ?? resource.data?.items[0]
  const total = resource.data?.total ?? 0
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{t('My deductions')}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('Grouped by hour, conversation and model. Select a row to inspect deductions.')}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {t('Deductions record points charged. Usage analytics may also include consumption without a deduction.')}
          </p>
        </div>
        <RangeControl days={days} onChange={onDays} />
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {filterLabel ? (
          <Button type="button" variant="secondary" className="max-w-full" onClick={onClear}>
            <span className="truncate">{filterLabel}</span>
            <X className="size-4 shrink-0" />
            <span className="sr-only">{t('Clear filters')}</span>
          </Button>
        ) : (
          <span />
        )}
        <div role="search" className="flex min-w-0 items-center gap-2">
          <Input
            aria-label={t('Filter by exact model name')}
            placeholder={t('Filter by exact model name')}
            value={model}
            className="w-52"
            onChange={(event) => setModel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onFilter(model.trim())
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            aria-label={t('Apply model filter')}
            onClick={() => onFilter(model.trim())}
          >
            <Search className="size-4" />
          </Button>
        </div>
      </div>
      <UsageState {...resource} onRetry={onRefresh}>
        {resource.data?.items.length === 0 && skip === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border p-6 text-center">
            <p className="text-sm font-medium">
              {t(filterLabel ? 'No deductions match the current filters.' : 'No deductions in this date range.')}
            </p>
            <p className="max-w-lg text-sm leading-6 text-muted-foreground">
              {t('Usage without a points deduction appears in analytics, but does not create a deduction record here.')}
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {filterLabel && (
                <Button type="button" variant="outline" onClick={onClear}>
                  {t('Clear filters')}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={onAnalytics}>
                {t('View usage analytics')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid min-w-0 overflow-hidden rounded-2xl border xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-normal">{t('Conversation / time')}</th>
                      <th className="px-3 py-3 font-normal">{t('Model')}</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right font-normal">{t('Points deducted')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resource.data?.items.map((row) => {
                      const key = JSON.stringify(row.group)
                      const active = row === summary
                      return (
                        <tr key={key} className={`border-t ${active ? 'bg-accent/70' : 'hover:bg-muted/40'}`}>
                          <td className="max-w-60">
                            <button
                              type="button"
                              aria-pressed={active}
                              className={`w-full border-l-4 py-4 pr-2 pl-3 text-left ${active ? 'border-primary' : 'border-transparent'}`}
                              onClick={() => setSelected(key)}
                            >
                              <span className="line-clamp-2 break-words font-medium">{summaryTitle(row)}</span>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {formatDate(row.firstUsedAt, true)}
                              </span>
                            </button>
                          </td>
                          <td className="max-w-32 break-all px-3 py-4">{row.group.model || '—'}</td>
                          <td className="px-4 py-4 text-right tabular-nums">{formatNumber(row.pointsUsed)}</td>
                        </tr>
                      )
                    })}
                    {!resource.data?.items.length && (
                      <tr>
                        <td colSpan={3} className="p-8 text-center text-muted-foreground">
                          {t('No deductions in this date range.')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <nav aria-label={t('Deduction pages')} className="mt-auto flex items-center gap-3 border-t p-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={skip === 0}
                  onClick={() => {
                    setSkip(Math.max(0, skip - PAGE_SIZE))
                    setSelected(null)
                  }}
                >
                  <ChevronLeft className="size-4" />
                  {t('Previous')}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {t('Page {{page}}', { page: Math.floor(skip / PAGE_SIZE) + 1 })}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={skip + (resource.data?.items.length ?? 0) >= total || !resource.data?.items.length}
                  onClick={() => {
                    setSkip(skip + PAGE_SIZE)
                    setSelected(null)
                  }}
                >
                  {t('Next')}
                  <ChevronRight className="size-4" />
                </Button>
              </nav>
            </div>
            {summary ? (
              <DeductionInspector
                key={`${JSON.stringify(summary.group)}:${refresh}`}
                summary={summary}
                query={query}
                refresh={refresh}
                onRefresh={onRefresh}
              />
            ) : (
              <p className="flex min-h-48 items-center justify-center border-t p-5 text-sm text-muted-foreground xl:border-t-0 xl:border-l">
                {t('Select a deduction record to see details.')}
              </p>
            )}
          </div>
        )}
      </UsageState>
    </div>
  )
}
