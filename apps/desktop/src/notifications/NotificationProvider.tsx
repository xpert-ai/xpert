import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { CircleCheck, X } from 'lucide-react'
import {
  parseAnnouncement,
  parseNotificationSnapshot,
  parseUserNotification,
  outputWorkbenchEntry,
  type NotificationWorkbench,
  type Announcement,
  type NotificationSnapshot,
  type AgentOutputItem,
  type UserNotification
} from '@xpert-ai/contracts'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@xpert-ai/shadcn-ui'
import { invoke } from '../host'
import { t } from '../i18n'
import { NotificationCenter } from './NotificationCenter'
import { AnnouncementNotice, AnnouncementText } from './AnnouncementNotice'

export type OutputDetails = { id: string; items: AgentOutputItem[] }

const Context = createContext({ open: (_opener?: HTMLElement | null) => {}, count: 0, available: false })
export const useNotifications = () => useContext(Context)

export function NotificationProvider({
  children,
  activeThreadId,
  suspended = false,
  onWorkbench,
  onOpen
}: {
  children: ReactNode
  suspended?: boolean
  activeThreadId: string | null
  onWorkbench?: (target: NotificationWorkbench) => Promise<boolean>
  onOpen: (item: UserNotification) => Promise<void>
}) {
  const [snapshot, setSnapshot] = useState<NotificationSnapshot | null>(null)
  const [center, setCenter] = useState(false)
  const [details, setDetails] = useState<OutputDetails | null>(null)
  const [announcement, setAnnouncement] = useState<{ item: Announcement; automatic: boolean } | null>(null)
  const [hint, setHint] = useState<UserNotification | null>(null)
  const [error, setError] = useState('')
  const centerOpener = useRef<HTMLElement | null>(null)
  const announcementOpener = useRef<HTMLElement | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const shown = useRef(new Set<string>())
  const seen = useRef<Set<string> | null>(null)
  const lastSync = useRef(0)
  const snapshotRef = useRef(snapshot)
  const thread = useRef(activeThreadId)
  thread.current = activeThreadId
  useEffect(() => {
    let alive = true
    const read = async (force = false) => {
      try {
        const raw = await invoke(force ? 'notificationRefresh' : 'notificationSnapshot')
        if (!alive) return
        const value = raw && parseNotificationSnapshot(raw)
        if (value) {
          const fresh =
            seen.current && Date.now() - lastSync.current < 35000
              ? value.notifications.find(
                  (item) =>
                    !seen.current!.has(item.id) &&
                    !item.readAt &&
                    Date.parse(item.createdAt) > lastSync.current - 3000 &&
                    (!thread.current || item.action?.threadId !== thread.current)
                )
              : null
          if (fresh) setHint(fresh)
          seen.current = new Set(value.notifications.map((item) => item.id))
          lastSync.current = Date.now()
        }
        if (!value) {
          setCenter(false)
          setDetails(null)
          setAnnouncement(null)
          setHint(null)
        }
        snapshotRef.current = value
        setSnapshot(value)
        setAnnouncement((current) =>
          current?.automatic && !value?.announcements.some((item) => item.id === current.item.id) ? null : current
        )
      } catch {
        /* Existing content remains available during a temporary outage. */
      }
    }
    void read()
    const changed = window.xpertDesktop?.onNotificationsChanged?.(() => void read())
    const activated = window.xpertDesktop?.onWindowActivated?.(() => void read(true))
    const visible = () => {
      if (document.visibilityState === 'visible') void read(true)
    }
    document.addEventListener('visibilitychange', visible)
    const timer = setInterval(() => void read(!window.xpertDesktop), window.xpertDesktop ? 25000 : 15000)
    return () => {
      alive = false
      changed?.()
      activated?.()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [])
  useEffect(() => {
    let checking = false,
      alive = true
    const timer = setInterval(async () => {
      if (
        suspended ||
        checking ||
        center ||
        announcement ||
        document.visibilityState !== 'visible' ||
        document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')
      )
        return
      const item = snapshotRef.current?.announcements.find((item) => !shown.current.has(item.id))
      if (!item) return
      checking = true
      try {
        const current = parseAnnouncement(await invoke('notificationAnnouncement', item.id))
        if (
          !alive ||
          !snapshotRef.current?.announcements.some((entry) => entry.id === current.id) ||
          current.dismissedAt ||
          (current.expiresAt && Date.parse(current.expiresAt) <= Date.now()) ||
          document.querySelector('[role="dialog"], [role="alertdialog"]')
        )
          return
        announcementOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        shown.current.add(current.id)
        setAnnouncement({ item: current, automatic: true })
      } catch {
        /* Withdrawn or inaccessible announcements must not open. */
      } finally {
        checking = false
      }
    }, 1000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [center, announcement, suspended])
  useEffect(() => {
    if (!announcement || announcement.automatic) return
    let alive = true
    void invoke('notificationAnnouncement', announcement.item.id)
      .then((value) => {
        if (alive) setAnnouncement({ item: parseAnnouncement(value), automatic: false })
      })
      .catch(() => {
        if (alive) {
          setAnnouncement(null)
          setError(t('This result is unavailable. Refresh your workspace and retry.'))
        }
      })
    return () => {
      alive = false
    }
  }, [announcement?.item.id, announcement?.automatic, snapshot?.version])
  const closeAnnouncement = () => {
    const current = announcement
    const focusedNotice = document.activeElement?.closest('[data-announcement-notice]')
    setAnnouncement(null)
    if (current?.automatic && focusedNotice && announcementOpener.current?.isConnected)
      announcementOpener.current.focus()
    if (current && !current.item.dismissedAt) {
      if (current.automatic) snapshotRef.current?.announcements.forEach((item) => shown.current.add(item.id))
      setSnapshot(
        (value) =>
          value && { ...value, announcements: value.announcements.filter((item) => item.id !== current.item.id) }
      )
      if (snapshotRef.current)
        snapshotRef.current = {
          ...snapshotRef.current,
          announcements: snapshotRef.current.announcements.filter((item) => item.id !== current.item.id)
        }
      void invoke('notificationDismiss', current.item.id).catch(() =>
        setError(t('Could not save dismissal. Please retry.'))
      )
    }
  }
  const openResult = async (item: UserNotification, memberId?: string) => {
    setError('')
    try {
      const { items = [], notification } = await invoke('notificationRead', item.id)
      if (!mounted.current) return
      if (item.kind === 'action.required') {
        const current = parseUserNotification(notification)
        if (current.kind !== 'action.required' || !onWorkbench || !(await onWorkbench(current.presentation.workbench)))
          throw new Error(t('Unavailable'))
      } else if (item.kind === 'agent.output') {
        setDetails({ id: item.id, items })
        const entry = memberId ? items.find((entry) => entry.id === memberId) : items.length === 1 ? items[0] : null
        if (memberId && !entry) throw new Error(t('Unavailable'))
        if (entry?.workbench && onWorkbench) {
          if (!(await onWorkbench(outputWorkbenchEntry(entry.workbench)))) throw new Error(t('Unavailable'))
        } else if (!entry?.action) {
          setHint(null)
          setCenter(true)
          return
        } else await onOpen({ ...item, action: entry.action })
      } else {
        await onOpen(item)
      }
      setDetails(null)
      centerOpener.current = null
      setCenter(false)
      setHint(null)
      setError('')
    } catch {
      setDetails(null)
      setError(t('This result is unavailable. Refresh your workspace and retry.'))
    }
  }
  const count =
    (snapshot?.announcements.length ?? 0) +
    (snapshot?.pendingCount ?? 0) +
    (snapshot?.notifications.filter(
      (item) => !item.readAt && !(item.kind === 'action.required' && item.presentation.state === 'pending')
    ).length ?? 0)
  return (
    <Context.Provider
      value={{
        count,
        available: !!snapshot,
        open: (opener) => {
          centerOpener.current = opener ?? null
          setAnnouncement(null)
          setDetails(null)
          setError('')
          setHint(null)
          setCenter(true)
        }
      }}
    >
      {children}
      {announcement?.automatic && !center && !suspended && (
        <aside
          aria-label={t('Notifications')}
          className="pointer-events-none fixed right-4 top-16 z-40 w-96 max-w-[calc(100vw-2rem)]"
        >
          <AnnouncementNotice key={announcement.item.id} item={announcement.item} onClose={closeAnnouncement} />
        </aside>
      )}
      {hint && !center && !announcement && !suspended && (
        <div
          role="status"
          className="fixed right-4 top-16 z-40 flex w-fit max-w-[min(24rem,calc(100vw-2rem))] items-center gap-1 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-md"
        >
          <Button
            variant="ghost"
            className="h-auto min-h-8 min-w-0 flex-1 justify-start gap-2 px-2 py-1 text-start whitespace-normal"
            onClick={() => void openResult(hint)}
          >
            <CircleCheck className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 break-words">
              {hint.kind === 'action.required'
                ? hint.presentation.title
                : hint.kind === 'agent.output'
                  ? hint.titles.join(' · ')
                  : t('Your scheduled task has completed')}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            aria-label={t('Close')}
            onClick={() => setHint(null)}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="fixed bottom-5 right-5 z-50 rounded-xl border bg-popover p-3 text-popover-foreground"
        >
          <p>{error}</p>
          <Button variant="ghost" onClick={() => setError('')}>
            {t('Close')}
          </Button>
        </div>
      )}
      <Dialog
        open={!!announcement && !announcement.automatic}
        onOpenChange={(open) => {
          if (!open) closeAnnouncement()
        }}
      >
        <DialogContent
          className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-xl"
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (announcementOpener.current?.isConnected) announcementOpener.current.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{announcement?.item.title}</DialogTitle>
            <DialogDescription>
              {t('Announcement')}
              {announcement?.item.severity === 'important' ? ` · ${t('Important')}` : ''}
            </DialogDescription>
          </DialogHeader>
          {announcement && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <AnnouncementText text={announcement.item.body} />
            </div>
          )}
          <div className="flex shrink-0 justify-end gap-2">
            {announcement?.item.action && (
              <Button variant="outline" asChild>
                <a href={announcement.item.action.url} target="_blank" rel="noopener noreferrer">
                  {announcement.item.action.label}
                </a>
              </Button>
            )}
            <Button onClick={closeAnnouncement}>{t('Dismiss announcement')}</Button>
          </div>
        </DialogContent>
      </Dialog>
      {center && (
        <NotificationCenter
          details={details}
          onClose={() => {
            setCenter(false)
            setDetails(null)
          }}
          onRestoreFocus={() => {
            if (centerOpener.current?.isConnected) centerOpener.current.focus()
          }}
          onOpen={openResult}
          onAnnouncement={(item) => {
            announcementOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
            setAnnouncement({ item, automatic: false })
          }}
        />
      )}
    </Context.Provider>
  )
}
