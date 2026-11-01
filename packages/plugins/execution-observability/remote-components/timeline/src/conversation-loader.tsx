import type { ReactNode } from 'react'
import { Button } from '@xpert-ai/shadcn-ui'
import type { ExecutionObservationConversation, ExecutionObservationQuery } from '@xpert-ai/contracts'
import { useAssistantConversations } from './lazy-executions'
import type { ReadQueue } from './read-queue'
import { useI18n } from './i18n'

export function ConversationLoader({
  query,
  assistantId,
  expanded,
  queued,
  children
}: {
  query: ExecutionObservationQuery
  assistantId: string | null
  expanded: boolean
  queued: ReadQueue
  children: (items: ExecutionObservationConversation[]) => ReactNode
}) {
  const { data, failed, page, setPage, retry } = useAssistantConversations(query, assistantId, expanded, queued)
  const { t } = useI18n()
  if (!expanded) return null
  if (!data)
    return (
      <div
        className="flex h-12 items-center gap-2 px-8 text-xs text-muted-foreground"
        role={failed ? 'alert' : 'status'}
      >
        {t(failed ? 'failed' : 'loading')}
        {failed && (
          <Button variant="ghost" size="sm" onClick={retry}>
            {t('retry')}
          </Button>
        )}
      </div>
    )
  return (
    <>
      {children(data.items)}
      {data.total === 0 && <p className="px-8 py-2 text-xs text-muted-foreground">{t('empty')}</p>}
      {data.total > data.pageSize && (
        <div className="sticky left-0 flex w-fit items-center gap-2 px-8 py-1 text-xs text-muted-foreground">
          <span>{t('conversationPage', { count: data.items.length, total: data.total })}</span>
          <Button size="sm" variant="ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>
            {t('previous')}
          </Button>
          <span>{t('page', { page, pages: Math.ceil(data.total / data.pageSize) })}</span>
          <Button
            size="sm"
            variant="ghost"
            disabled={page * data.pageSize >= data.total}
            onClick={() => setPage(page + 1)}
          >
            {t('next')}
          </Button>
        </div>
      )}
    </>
  )
}
