import { useEffect, useState } from 'react'
import { Bell, Box, Calendar, CalendarClock, ChevronLeft, Megaphone, Settings, X } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Tabs,
  TabsHeader,
  TabsList,
  TabsTrigger,
  TabsContent
} from '@xpert-ai/shadcn-ui'
import {
  parseAnnouncement,
  parseUserNotification,
  type AgentOutputItem,
  type Announcement,
  type UserNotification
} from '@xpert-ai/contracts'
import { invoke } from '../host'
import { t, useLocale } from '../i18n'
import { localizedText } from '../../electron/i18n/index.mjs'
import { OutputPreferences } from './OutputPreferences'
import type { OutputDetails } from './NotificationProvider'

const filters = {
  all: 'All',
  assistant: 'Assistant notifications',
  scheduled: 'Scheduled tasks',
  announcements: 'Announcements'
} as const
const queryNotifications = async (offset: number) => {
  const page = await invoke('notificationList', offset)
  return { ...page, items: page.items.map(parseUserNotification) }
}
const queryAnnouncements = async (offset: number) => {
  const page = await invoke('notificationHistory', offset)
  const nextOffset = offset + page.items.length
  return { items: page.items.map(parseAnnouncement), nextOffset, hasMore: nextOffset < page.total }
}

function usePages<T>(
  query: (offset: number) => Promise<{ items: T[]; nextOffset: number; hasMore: boolean }>,
  revision: number
) {
  const [pages, setPages] = useState(1)
  const [result, setResult] = useState({ items: [] as T[], hasMore: false, busy: true, failed: false })
  useEffect(() => {
    let current = true
    async function read() {
      setResult((old) => ({ ...old, busy: true }))
      const items: T[] = []
      let offset = 0
      for (let n = 0; n < pages && current; n++) {
        const page = await query(offset)
        items.push(...page.items)
        if (!page.hasMore || page.nextOffset <= offset || n === pages - 1) {
          if (current)
            setResult({ items, hasMore: page.hasMore && page.nextOffset > offset, busy: false, failed: false })
          break
        }
        offset = page.nextOffset
      }
    }
    void read().catch(() => {
      if (current) setResult({ items: [], hasMore: false, busy: false, failed: true })
    })
    return () => {
      current = false
    }
  }, [query, pages, revision])
  return { ...result, more: () => setPages((p) => p + 1) }
}

type Row = { notice: UserNotification; item?: AgentOutputItem }
function NotificationRow({
  row: { notice, item },
  onOpen
}: {
  row: Row
  onOpen: (notice: UserNotification, id?: string) => void
}) {
  const locale = useLocale()
  if (notice.kind === 'action.required')
    return (
      <article className="space-y-2 rounded-lg border p-3">
        <p className="font-medium">{notice.presentation.title}</p>
        <p className="text-sm text-muted-foreground">
          {t(
            notice.presentation.state === 'pending'
              ? 'Awaiting decision'
              : notice.presentation.state === 'handled'
                ? 'Handled'
                : 'Closed'
          )}
        </p>
        <Button
          size="sm"
          variant={notice.presentation.state === 'pending' ? 'default' : 'outline'}
          onClick={() => onOpen(notice)}
        >
          {t(notice.presentation.state === 'pending' ? 'View and act' : 'View details')}
        </Button>
      </article>
    )
  const target = item?.workbench
  const isOutput = notice.kind === 'agent.output'
  const title = target
    ? localizedText(target.title, locale)
    : (item?.title ?? (isOutput ? notice.titles.join(' · ') : t('Your scheduled task has completed')))
  const Icon = target ? CalendarClock : isOutput ? Box : Calendar
  const date = new Date(notice.createdAt)
  const today = new Date()
  const dateLabel =
    date.toDateString() === today.toDateString()
      ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
  const open = () => onOpen(notice, item?.id)
  const summary = (
    <>
      <span
        aria-hidden="true"
        className={`grid size-10 shrink-0 place-items-center rounded-lg ${target?.state === 'pending' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1 text-start">
        <strong className="break-words">{title}</strong>
        {target?.state === 'pending' && (
          <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{t('Awaiting decision')}</span>
        )}
        {target && <span className="mt-0.5 block break-words text-sm text-muted-foreground">{item.title}</span>}
      </span>
      <time
        dateTime={notice.createdAt}
        title={date.toLocaleString(locale)}
        className="shrink-0 self-start text-xs text-muted-foreground"
      >
        {dateLabel}
      </time>
    </>
  )
  if (target?.state === 'handled')
    return (
      <article className="py-1">
        <Button
          variant="ghost"
          className="h-auto w-full items-start gap-3 whitespace-normal text-start"
          onClick={open}
          title={localizedText(target.openLabel, locale)}
        >
          <span className="sr-only">{localizedText(target.openLabel, locale)}</span>
          {summary}
        </Button>
        <dl className="ms-14 flex flex-wrap gap-x-3 gap-y-1 pb-2 text-xs text-muted-foreground">
          {item?.fields?.map((f, n) => (
            <div className="flex flex-wrap gap-x-1" key={n}>
              <dt>{localizedText(f.label, locale)}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      </article>
    )
  if (target)
    return (
      <article className="space-y-2 py-3">
        <div className="flex items-start gap-3">{summary}</div>
        <div className="ms-0 flex flex-wrap items-end justify-between gap-2 sm:ms-[3.25rem]">
          <dl className="min-w-0 space-y-0.5 text-sm">
            {item.fields?.map((field, i) => (
              <div className="flex flex-wrap gap-x-2" key={i}>
                <dt className="text-muted-foreground">{localizedText(field.label, locale)}</dt>
                <dd className="break-words">{field.value}</dd>
              </div>
            ))}
          </dl>
          <Button size="sm" variant="default" onClick={open}>
            {localizedText(target.openLabel, locale)}
          </Button>
        </div>
      </article>
    )
  return (
    <Button variant="ghost" className="h-auto w-full justify-start gap-3 whitespace-normal px-1 py-3" onClick={open}>
      <span
        className={`size-1.5 shrink-0 rounded-full ${notice.readAt ? 'bg-muted-foreground/30' : 'bg-primary'}`}
        aria-label={t(notice.readAt ? 'Read' : 'Unread')}
      />
      {summary}
    </Button>
  )
}

export function NotificationCenter({
  details,
  onClose,
  onRestoreFocus,
  onOpen,
  onAnnouncement
}: {
  details: OutputDetails | null
  onClose: () => void
  onRestoreFocus: () => void
  onOpen: (n: UserNotification, id?: string) => Promise<void>
  onAnnouncement: (a: Announcement) => void
}) {
  const locale = useLocale()
  const [filter, setFilter] = useState('all')
  const [preferences, setPreferences] = useState(false)
  const [revision, setRevision] = useState(0)
  const [actionError, setActionError] = useState(false)
  const refresh = () => setRevision((v) => v + 1)
  const notifications = usePages(queryNotifications, revision)
  const announcements = usePages(queryAnnouncements, revision)
  useEffect(() => {
    const visible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const interval = window.setInterval(visible, 30000)
    window.addEventListener('focus', visible)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', visible)
    }
  }, [])
  const showAnnouncements = filter === 'all' || filter === 'announcements'
  const showResults = filter !== 'announcements'
  const rows = notifications.items.flatMap((notice): Row[] => {
    if (
      !showResults ||
      (filter === 'assistant' && notice.kind !== 'agent.output') ||
      (filter === 'scheduled' && notice.kind !== 'agent.completed')
    )
      return []
    return notice.kind === 'agent.output' && notice.items?.length
      ? notice.items.map((item) => ({ notice, item }))
      : [{ notice }]
  })
  const detailNotice = rows.find((row) => row.notice.id === details?.id)?.notice
  const isPending = (r: Row) =>
    r.item?.workbench?.state === 'pending' ||
    (r.notice.kind === 'action.required' && r.notice.presentation.state === 'pending')
  const pending = rows.filter(isPending)
  const recent = rows.filter((r) => !isPending(r))
  const open = async (n: UserNotification, id?: string) => {
    await onOpen(n, id)
    refresh()
  }
  const render = (row: Row) => <NotificationRow key={row.item?.id ?? row.notice.id} row={row} onOpen={open} />
  const busy = (showResults && notifications.busy) || (showAnnouncements && announcements.busy)
  const failed = actionError || (showResults && notifications.failed) || (showAnnouncements && announcements.failed)
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <DialogContent
        className="flex max-h-[85vh] flex-col gap-0 overflow-hidden sm:max-w-2xl"
        showCloseButton={false}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          onRestoreFocus()
        }}
      >
        <div className="flex items-center gap-2 pb-2">
          {preferences ? (
            <Button size="icon" variant="ghost" aria-label={t('Back')} onClick={() => setPreferences(false)}>
              <ChevronLeft />
            </Button>
          ) : (
            <Bell className="size-5" />
          )}
          <DialogTitle>{t(preferences ? 'Delivery preferences' : 'Notifications')}</DialogTitle>
          <div className="ms-auto flex items-center gap-1">
            {!preferences && (
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('Delivery preferences')}
                onClick={() => setPreferences(true)}
              >
                <Settings />
              </Button>
            )}
            <Button size="icon" variant="ghost" aria-label={t('Close')} onClick={onClose}>
              <X />
            </Button>
          </div>
        </div>
        <DialogDescription className="sr-only">
          {t('Assistant notifications, scheduled tasks and announcements')}
        </DialogDescription>
        {preferences ? (
          <div className="min-h-0 overflow-auto">
            <OutputPreferences />
          </div>
        ) : (
          <Tabs className="min-h-0" value={filter} onValueChange={setFilter}>
            <TabsHeader>
              <TabsList variant="line" aria-label={t('Notifications')}>
                {Object.entries(filters).map(([key, label]) => (
                  <TabsTrigger key={key} value={key}>
                    {t(label)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </TabsHeader>
            <TabsContent key={filter} value={filter} className="min-h-0 overflow-y-auto">
              {pending.length > 0 && (
                <section className="border-b py-2">
                  <h3 className="font-semibold">{t('Needs your attention')}</h3>
                  <div className="divide-y">{pending.map(render)}</div>
                </section>
              )}
              {recent.length > 0 && (
                <section className="pt-3">
                  <h3 className="font-semibold">{t('Recent notifications')}</h3>
                  <div className="divide-y">{recent.map(render)}</div>
                </section>
              )}
              {details && showResults && detailNotice && details.items.some((i) => !i.workbench) && (
                <dl className="space-y-1 text-sm">
                  {details.items
                    .filter(
                      (i) =>
                        !i.workbench &&
                        (detailNotice.kind !== 'agent.output' ||
                          !detailNotice.items ||
                          detailNotice.items.some((current) => current.id === i.id))
                    )
                    .map((i) => (
                      <div key={i.id}>
                        <dt className="font-medium">
                          {i.action ? (
                            <Button variant="link" onClick={() => void open(detailNotice, i.id)}>
                              {i.title}
                            </Button>
                          ) : (
                            i.title
                          )}
                        </dt>
                        {i.fields?.map((f, n) => (
                          <dd key={n}>
                            {localizedText(f.label, locale)} · {f.value}
                          </dd>
                        ))}
                      </div>
                    ))}
                </dl>
              )}
              {showResults && notifications.hasMore && (
                <Button variant="outline" disabled={busy} onClick={notifications.more}>
                  {t('Load more')}
                </Button>
              )}
              {showAnnouncements && announcements.items.length > 0 && (
                <section className="pt-3">
                  <h3 className="font-semibold">{t('Announcements')}</h3>
                  {announcements.items.map((a) => (
                    <Button
                      key={a.id}
                      variant="ghost"
                      className="h-auto w-full justify-start whitespace-normal text-start"
                      onClick={async () => {
                        try {
                          onAnnouncement(parseAnnouncement(await invoke('notificationAnnouncement', a.id)))
                        } catch {
                          setActionError(true)
                        }
                      }}
                    >
                      <Megaphone />
                      {a.title}
                      {a.expiresAt && Date.parse(a.expiresAt) <= Date.now() ? ' · ' + t('Expired') : ''}
                    </Button>
                  ))}
                </section>
              )}
              {showAnnouncements && announcements.hasMore && (
                <Button variant="outline" disabled={busy} onClick={announcements.more}>
                  {t('Load more')}
                </Button>
              )}
              {failed && (
                <p role="alert">
                  {t('Could not load notifications. Please retry.')}{' '}
                  <Button
                    variant="outline"
                    onClick={() => {
                      setActionError(false)
                      refresh()
                    }}
                  >
                    {t('Retry')}
                  </Button>
                </p>
              )}
              {busy && <p role="status">{t('Loading…')}</p>}
              {!busy && !failed && !rows.length && (!showAnnouncements || !announcements.items.length) && (
                <p className="py-8 text-center text-muted-foreground">{t('No notifications yet')}</p>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
