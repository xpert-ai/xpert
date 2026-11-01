import { Button } from '@xpert-ai/shadcn-ui'
import { ChevronDown, ChevronRight, GitBranch, MessageSquare } from 'lucide-react'
import {
  executionObservationListSchema,
  type ExecutionObservationQuery,
  type ExecutionObservationConversation,
  type ExecutionObservationRecord
} from '@xpert-ai/contracts'
import { useI18n } from './i18n'
import { shortId, type TimelineViewport } from './timeline-layout'
import { ExecutionTrack, SummaryTrack } from './timeline-track'
import { useObservationPage } from './lazy-executions'
import type { ReadQueue } from './read-queue'

export function ConversationRows({
  item,
  query,
  view,
  expanded,
  toggle,
  queued,
  open
}: {
  item: ExecutionObservationConversation
  query: ExecutionObservationQuery
  view: TimelineViewport
  expanded: boolean
  toggle: () => void
  queued: ReadQueue
  open: (id: string) => void
}) {
  const { t } = useI18n()
  const name = item.conversationId
    ? `${t('conversation')} ${shortId(item.conversationId)}`
    : item.threadId
      ? `${t('thread')} ${shortId(item.threadId)}`
      : t('noConversation')
  const inspect = () => (item.executionId ? open(item.executionId) : toggle())
  const detailQuery = {
    ...query,
    conversationId: item.conversationId ?? undefined,
    threadId: item.threadId ?? undefined
  }
  return (
    <section aria-label={name}>
      <div className="grid grid-cols-[288px_minmax(0,1fr)] border-b border-border/70">
        <div className="sticky left-0 z-20 flex h-[52px] items-center gap-1 border-r border-border bg-background py-1 pl-4 pr-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label={t(expanded ? 'collapseConversation' : 'expandConversation', { name })}
            aria-expanded={expanded}
            onClick={inspect}
          >
            {expanded ? <ChevronDown /> : <ChevronRight />}
          </Button>
          <MessageSquare className="size-3 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p
              className="truncate text-xs font-medium"
              title={item.conversationId ?? item.threadId ?? item.executionId ?? ''}
            >
              {name}
            </p>
            <p
              className="truncate text-xs text-muted-foreground"
              title={`${t('conversationSummary', { threads: item.threads, count: item.total, children: item.childExecutions })} · ${t('unknownEndCount', { count: item.unknownEnds })}`}
            >
              {t('threadCount', { count: item.threads })}
              {item.branches > 0 && ` · ${t('branchCount', { count: item.branches })}`} ·{' '}
              {t('records', { count: item.total })}
              {item.childExecutions > 0 && ` · ${t('childCount', { count: item.childExecutions })}`}
            </p>
          </div>
        </div>
        <div className="relative h-[52px]" data-testid="conversation-track">
          <SummaryTrack
            view={view}
            name={name}
            overlap={item.overlap}
            failures={item.failures}
            open={open}
            select={() => {
              if (!expanded) inspect()
            }}
          />
        </div>
      </div>
      <ThreadRows
        query={detailQuery}
        expanded={expanded && !item.executionId}
        queued={queued}
        view={view}
        open={open}
      />
    </section>
  )
}
function ThreadRows({
  query,
  expanded,
  queued,
  view,
  open
}: {
  query: ExecutionObservationQuery
  expanded: boolean
  queued: ReadQueue
  view: TimelineViewport
  open: (id: string) => void
}) {
  const { t } = useI18n(),
    { data, failed, page, setPage, retry } = useObservationPage(
      query,
      expanded,
      queued,
      executionObservationListSchema,
      'list',
      50
    )
  if (!expanded) return null
  if (!data)
    return (
      <div
        className="sticky left-0 flex h-12 w-fit items-center gap-2 px-8 text-xs text-muted-foreground"
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
  const threads = new Map<string, ExecutionObservationRecord[]>()
  for (const record of data.items) {
    const key = record.threadId ?? record.id,
      records = threads.get(key)
    if (records) records.push(record)
    else threads.set(key, [record])
  }
  return (
    <>
      {[...threads].map(([key, records]) => {
        const record = records[0],
          branch = Boolean(record.parentThreadId || record.forkedFromMessageId)
        return (
          <div key={key} className="grid grid-cols-[288px_minmax(0,1fr)] border-b border-border/70">
            <div className="sticky left-0 z-20 flex items-center gap-2 border-r border-border bg-muted/40 py-1 pl-10 pr-2">
              <GitBranch className="size-3 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p
                  className="truncate text-xs font-medium"
                  title={`${record.threadId ?? ''} · ${t('executionLanesNote')}`}
                >
                  {t(branch ? 'branchThread' : 'thread')} {record.threadId ? shortId(record.threadId) : '—'}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {t('records', { count: records.length })}
                  {branch && record.parentThreadId && ` · ${t('branchedFrom')} ${shortId(record.parentThreadId)}`}
                </p>
              </div>
            </div>
            <ExecutionTrack records={records} view={view} open={open} />
          </div>
        )
      })}
      {data.total > data.pageSize && (
        <div className="sticky left-0 flex w-fit items-center gap-2 px-8 py-1 text-xs text-muted-foreground">
          <span>{t('detailPage', { count: data.items.length, total: data.total })}</span>
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
