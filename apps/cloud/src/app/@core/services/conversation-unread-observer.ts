import { Observable, Subscription, auditTime } from 'rxjs'
import type { IChatConversationUnreadSnapshot, IChatConversationUnreadXpertSummary } from '@xpert-ai/contracts'

export const UNREAD_IDLE_INTERVAL = 45_000
export const UNREAD_ACTIVE_INTERVAL = 5_000

/** One in-flight request per scope. A 204 preserves the last snapshot and its identity. */
export function observeConversationUnread(
  load: (version?: string) => Observable<IChatConversationUnreadSnapshot | null>,
  changes: Observable<unknown>,
  documentRef: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> = document
): Observable<IChatConversationUnreadXpertSummary[]> {
  return new Observable((subscriber) => {
    const subscriptions = new Subscription()
    let snapshot: IChatConversationUnreadSnapshot | undefined
    let timer: ReturnType<typeof setTimeout>
    let fetching = false
    let dirty = false
    let failures = 0
    let unchanged = 0
    const visible = () => documentRef.visibilityState === 'visible'
    const schedule = () => {
      clearTimeout(timer)
      if (!visible() || subscriber.closed) return
      const active = snapshot?.items.some(
        (item) => item.hasActiveRuns || ['busy', 'pausing'].includes(item.latestConversationStatus)
      )
      // A stale busy status must not keep an unchanged page on the fast interval.
      const delay = failures
        ? Math.min(60_000, 5_000 * 2 ** (failures - 1))
        : active && unchanged < 3
          ? UNREAD_ACTIVE_INTERVAL
          : UNREAD_IDLE_INTERVAL
      timer = setTimeout(refresh, delay)
    }
    const refresh = () => {
      clearTimeout(timer)
      if (!visible() || subscriber.closed) return
      if (fetching) {
        dirty = true
        return
      }
      fetching = true
      const finish = () => {
        fetching = false
        if (dirty) {
          dirty = false
          refresh()
        } else schedule()
      }
      subscriptions.add(
        load(snapshot?.version).subscribe({
          next: (value) => {
            failures = 0
            if (value && value.version !== snapshot?.version) {
              unchanged = 0
              snapshot = value
              subscriber.next(value.items)
            } else unchanged++
          },
          error: () => {
            failures++
            finish()
          },
          complete: finish
        })
      )
    }
    const visibility = () => (visible() ? refresh() : clearTimeout(timer))
    documentRef.addEventListener('visibilitychange', visibility)
    subscriptions.add(changes.pipe(auditTime(250)).subscribe(refresh))
    refresh()
    return () => {
      clearTimeout(timer)
      subscriptions.unsubscribe()
      documentRef.removeEventListener('visibilitychange', visibility)
    }
  })
}
