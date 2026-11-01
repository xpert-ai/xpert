import { useEffect, useState } from 'react'
import { z } from 'zod/v3'
import { Button, Badge } from '@xpert-ai/shadcn-ui'
import {
  executionObservationListSchema,
  type ExecutionObservationQuery,
  type ExecutionObservationList
} from '@xpert-ai/contracts'
import { request } from './bridge'
import { useI18n } from './i18n'
import { queryParameters } from './navigation'

export function ExecutionList({ query, open }: { query: ExecutionObservationQuery; open: (id: string) => void }) {
  const { t, date } = useI18n(),
    [data, setData] = useState<ExecutionObservationList | null>(null),
    [page, setPage] = useState(1),
    [error, setError] = useState(false)
  const queryKey = JSON.stringify(query)
  useEffect(() => setPage(1), [queryKey])
  useEffect(() => {
    let active = true
    setData(null)
    setError(false)
    request('requestData', {
      query: { page, pageSize: 25, parameters: { ...queryParameters(query), operation: 'list' } }
    })
      .then((response) => {
        if (active) setData(z.object({ item: executionObservationListSchema }).parse(response).item)
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
    }
  }, [queryKey, page])
  if (error)
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
