import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { Injectable, computed, inject, signal } from '@angular/core'
import {
  RequestScopeLevel,
  Announcement,
  AnnouncementInput,
  NotificationSnapshot,
  UserNotification,
  parseNotificationSnapshot,
  notificationChangeSchema
} from '@xpert-ai/contracts'
import { combineLatest, firstValueFrom, Subscription } from 'rxjs'
import { ChatConversationService } from './chat-conversation.service'
import { distinctUntilChanged, map } from 'rxjs/operators'
import { Store } from '../state'
import { API_PREFIX } from '../state/constants'
import { injectFetchEventSource } from './fetch-event-source'
import { coordinateNotificationStream } from './notification-stream-coordinator'

@Injectable({ providedIn: 'root' })
export class UserNotificationsService {
  private readonly conversations = inject(ChatConversationService)
  private readonly http = inject(HttpClient)
  private readonly store = inject(Store)
  private readonly stream = injectFetchEventSource()
  readonly supported = signal<boolean | null>(null)
  readonly snapshot = signal<NotificationSnapshot | null>(null)
  readonly unread = computed(
    () =>
      (this.snapshot()?.announcements.length ?? 0) +
      (this.snapshot()?.notifications.filter((item) => !item.readAt).length ?? 0)
  )
  readonly openRequested = signal(0)
  readonly identity = signal('')
  private scopeSubscription: Subscription
  private events: Subscription
  private timer: ReturnType<typeof setInterval>
  private retryTimer: ReturnType<typeof setTimeout>
  private refreshTimer: ReturnType<typeof setTimeout>
  private accountKey = ''
  private generation = 0
  private fetching = false
  private dirty = false
  private pending = new Set<string>()
  private unsupported = false
  private attempts = 0
  private streamStartedAt = 0
  private streamActivityAt = 0
  private coordination: (() => void) | null = null
  private connectionGeneration = 0
  private pageActive = true
  private readonly activation = () => this.updateActivity()
  private readonly pageHide = () => {
    this.pageActive = false
    this.updateActivity()
  }
  private readonly pageShow = () => {
    this.pageActive = true
    this.updateActivity()
  }
  private readonly storageChanged = () => {
    this.loadPending()
    this.scheduleRefresh()
  }

  start() {
    if (this.scopeSubscription) return
    this.pageActive = true
    this.scopeSubscription = combineLatest([this.store.user$, this.store.activeScope$])
      .pipe(
        map(([user, scope]) =>
          user?.id && user.tenantId
            ? JSON.stringify([
                new URL(API_PREFIX, location.origin).href,
                user.tenantId,
                user.id,
                scope.level,
                scope.level === RequestScopeLevel.ORGANIZATION ? scope.organizationId : null
              ])
            : ''
        ),
        distinctUntilChanged()
      )
      .subscribe((identity) => {
        this.generation++
        this.pauseStream()
        clearTimeout(this.refreshTimer)
        this.accountKey = identity ? JSON.stringify(JSON.parse(identity).slice(0, 3)) : ''
        this.refreshTimer = null
        this.retryTimer = null
        this.supported.set(null)
        this.identity.set(identity)
        this.snapshot.set(null)
        this.fetching = false
        this.dirty = false
        this.unsupported = false
        this.attempts = 0
        this.pending = new Set()
        this.loadPending()
        if (identity) {
          this.updateActivity()
        }
      })
    this.timer = setInterval(() => this.scheduleRefresh(), 90000)
    document.addEventListener('visibilitychange', this.activation)
    window.addEventListener('storage', this.storageChanged)
    window.addEventListener('pagehide', this.pageHide)
    window.addEventListener('pageshow', this.pageShow)
  }

  stop() {
    this.generation++
    this.scopeSubscription?.unsubscribe()
    this.scopeSubscription = null
    this.pauseStream()
    clearInterval(this.timer)
    clearTimeout(this.refreshTimer)
    document.removeEventListener('visibilitychange', this.activation)
    window.removeEventListener('storage', this.storageChanged)
    window.removeEventListener('pagehide', this.pageHide)
    window.removeEventListener('pageshow', this.pageShow)
    this.snapshot.set(null)
    this.identity.set('')
    this.refreshTimer = null
  }

  canShowLiveHint(previousSync: number) {
    return (
      previousSync >= this.streamStartedAt && this.streamActivityAt > 0 && Date.now() - this.streamActivityAt < 35000
    )
  }

  private isActive() {
    return this.pageActive && document.visibilityState === 'visible' && !!this.identity() && !this.unsupported
  }

  private pauseStream() {
    this.connectionGeneration++
    this.coordination?.()
    this.coordination = null
    this.events?.unsubscribe()
    clearTimeout(this.retryTimer)
    clearTimeout(this.refreshTimer)
    this.refreshTimer = null
    this.streamActivityAt = 0
  }

  private updateActivity() {
    if (!this.isActive()) {
      this.pauseStream()
      return
    }
    if (!this.coordination) {
      this.streamStartedAt = Date.now()
      this.attempts = 0
      const generation = this.connectionGeneration
      const invalidate = () => {
        if (generation !== this.connectionGeneration || !this.isActive()) return
        this.conversations.refreshUnread()
        this.streamActivityAt = Date.now()
        this.scheduleRefresh()
      }
      this.coordination = coordinateNotificationStream(
        this.identity(),
        (publish) => {
          this.connect(generation, () => {
            publish()
            invalidate()
          })
          return () => {
            this.events?.unsubscribe()
            clearTimeout(this.retryTimer)
          }
        },
        invalidate
      )
    }
    this.scheduleRefresh()
  }

  private connect(generation: number, invalidate: () => void) {
    if (!this.isActive() || generation !== this.connectionGeneration) return
    this.streamStartedAt = Date.now()
    this.streamActivityAt = 0
    const reconnect = () => {
      this.streamActivityAt = 0
      if (generation !== this.connectionGeneration || !this.isActive()) return
      this.retryTimer = setTimeout(
        () => this.connect(generation, invalidate),
        Math.min(30000, 1000 * 2 ** Math.min(this.attempts++, 5)) + Math.random() * 500
      )
    }
    this.events = this.stream({ url: `${API_PREFIX}/user-notifications/stream`, method: 'GET' }).subscribe({
      next: (message) => {
        if (generation !== this.connectionGeneration || !this.isActive()) return
        try {
          if (!notificationChangeSchema.safeParse(JSON.parse(message.data)).success) return
          this.attempts = 0
          invalidate()
        } catch {
          // Unknown events and transport heartbeats do not invalidate a snapshot.
        }
      },
      error: reconnect,
      complete: reconnect
    })
  }

  scheduleRefresh() {
    if (this.refreshTimer || !this.isActive()) return
    this.refreshTimer = setTimeout(
      () => {
        this.refreshTimer = null
        void this.refresh()
      },
      250 + Math.random() * 250
    )
  }

  async refresh() {
    if (!this.isActive()) return
    if (this.fetching) {
      this.dirty = true
      return
    }
    if (!this.identity() || this.unsupported) return
    const generation = this.generation
    this.fetching = true
    try {
      for (const id of [...this.pending]) {
        if (!this.isActive() || generation !== this.generation) return
        try {
          await firstValueFrom(this.http.put(`${API_PREFIX}/announcements/${id}/dismissal`, {}))
        } catch (error) {
          if (!(error instanceof HttpErrorResponse) || error.status !== 404) continue
        }
        if (generation !== this.generation) return
        this.pending.delete(id)
        this.removePending(id)
      }
      if (!this.isActive() || generation !== this.generation) return
      const response = await firstValueFrom(
        this.http.get<unknown>(`${API_PREFIX}/user-notifications/sync`, { params: { client: 'web' } })
      )
      if (generation !== this.generation) return
      const snapshot = parseNotificationSnapshot(response)
      snapshot.announcements = snapshot.announcements.filter((item) => !this.pending.has(item.id))
      this.supported.set(true)
      this.snapshot.set(snapshot)
    } catch (error) {
      if (generation === this.generation && error instanceof HttpErrorResponse && [401, 403].includes(error.status))
        this.snapshot.set(null)
      if (generation === this.generation && error instanceof HttpErrorResponse && error.status === 404) {
        this.supported.set(false)
        this.unsupported = true
        this.pauseStream()
        this.snapshot.set(null)
      }
    } finally {
      if (generation === this.generation) {
        this.fetching = false
        if (this.dirty) {
          this.dirty = false
          this.scheduleRefresh()
        }
      }
    }
  }

  dismiss(id: string) {
    this.pending.add(id)
    try {
      localStorage.setItem(`${this.key()}:${id}`, '1')
    } catch {
      /* Retry from memory when storage is unavailable. */
    }
    this.snapshot.update(
      (state) => state && { ...state, announcements: state.announcements.filter((item) => item.id !== id) }
    )
    this.scheduleRefresh()
  }
  open() {
    this.openRequested.update((n) => n + 1)
  }
  announcement(id: string) {
    return firstValueFrom(
      this.http.get<Announcement>(`${API_PREFIX}/announcements/${id}`, { params: { client: 'web' } })
    )
  }
  history(offset = 0) {
    return firstValueFrom(
      this.http.get<{ items: Announcement[]; total: number }>(`${API_PREFIX}/announcements/history`, {
        params: { client: 'web', offset }
      })
    )
  }
  notifications(offset = 0) {
    return firstValueFrom(
      this.http.get<{ items: UserNotification[]; hasMore: boolean; nextOffset: number }>(
        `${API_PREFIX}/user-notifications`,
        { params: { offset } }
      )
    )
  }
  async read(id: string) {
    await firstValueFrom(this.http.put(`${API_PREFIX}/user-notifications/${id}/read`, {}))
    this.scheduleRefresh()
  }
  adminList(offset = 0) {
    return firstValueFrom(
      this.http.get<{ items: Announcement[]; total: number }>(`${API_PREFIX}/announcement-admin`, {
        params: { offset }
      })
    )
  }
  save(input: AnnouncementInput, item?: Announcement) {
    return firstValueFrom(
      item
        ? this.http.patch<Announcement>(`${API_PREFIX}/announcement-admin/${item.id}`, {
            ...input,
            revision: item.revision
          })
        : this.http.post<Announcement>(`${API_PREFIX}/announcement-admin`, input)
    )
  }
  audit(id: string) {
    return firstValueFrom(
      this.http.get<
        {
          revision: number
          operation: 'create' | 'edit' | 'publish' | 'withdraw'
          actorId: string
          createdAt: string
          content: AnnouncementInput
        }[]
      >(`${API_PREFIX}/announcement-admin/${id}/audit`)
    )
  }
  transition(item: Announcement, action: 'publish' | 'withdraw') {
    return firstValueFrom(
      this.http.post<Announcement>(`${API_PREFIX}/announcement-admin/${item.id}/${action}`, { revision: item.revision })
    )
  }
  private key() {
    return `xpert:pending-announcement-dismissals:${this.accountKey}`
  }
  private loadPending() {
    try {
      const prefix = `${this.key()}:`
      const ids = Object.keys(localStorage)
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length))
      this.pending = new Set(ids.filter((id) => /^[a-f\d-]{36}$/i.test(id)))
    } catch {
      /* Retain the current in-memory retry queue. */
    }
  }
  private removePending(id: string) {
    try {
      localStorage.removeItem(`${this.key()}:${id}`)
    } catch {
      /* Repeating the idempotent write is safe. */
    }
  }
}
