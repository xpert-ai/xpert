import { useMemo } from 'react'
import { Button, Badge } from '@xpert-ai/shadcn-ui'
import { executionObservationListSchema, type ExecutionObservationQuery } from '@xpert-ai/contracts'
import { createReadQueue } from './read-queue'
import { useObservationPage } from './lazy-executions'
import { useI18n } from './i18n'
import { RefreshError } from './refresh-error'

export function ExecutionList({
  query,
  refreshScope,
  open
}: {
  query: ExecutionObservationQuery
  refreshScope?: string
  open: (id: string) => void
}) {
  const { t, date } = useI18n()
  const queued = useMemo(() => createReadQueue(1), [])
  const {
    data,
    failed: error,
    page,
    setPage,
    retry
  } = useObservationPage(query, true, queued, executionObservationListSchema, 'list', 25, refreshScope)
  if (error && !data)
    return (
      <p role="alert" className="p-4 text-sm text-destructive">
        {t('failed')}
      </p>
    )
  if (!data)
    return (
      <p role="status" className="p-4 text-sm text-muted-foreground">
        {t('loading')}
      </p>
    )
  return (
    <div className="min-h-0 overflow-auto">
      {error && <RefreshError retry={retry} />}
      {!data.total && <p className="p-4 text-sm text-muted-foreground">{t('empty')}</p>}
      {data.items.map((record) => (
        <Button
          key={record.id}
          variant="ghost"
          className="h-auto w-full justify-between gap-4 rounded-none border-b border-border py-4 text-left"
          onClick={() => open(record.id)}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{record.title || t('unknownTitle')}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {record.assistantName || t('unknownAssistant')} · {date(record.createdAt, query.timeZone)}
            </span>
          </span>
          <Badge variant="secondary">{t(record.status)}</Badge>
        </Button>
      ))}
      <div className="flex items-center justify-between gap-2 py-3">
        <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
          {t('previous')}
        </Button>
        <span className="text-xs text-muted-foreground">{t('records', { count: data.total })}</span>
        <Button variant="outline" size="sm" disabled={page * 25 >= data.total} onClick={() => setPage(page + 1)}>
          {t('next')}
        </Button>
      </div>
    </div>
  )
}
