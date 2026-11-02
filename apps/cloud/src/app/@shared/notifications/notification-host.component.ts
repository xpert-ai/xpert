import { Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardCardComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import type { Announcement, UserNotification } from '@xpert-ai/contracts'
import { Dialog } from '@angular/cdk/dialog'
import { Component, effect, inject, input, OnDestroy, OnInit, signal, untracked } from '@angular/core'
import { UserNotificationsService } from '../../@core/services/user-notifications.service'
import { AnnouncementNoticeComponent } from './announcement-notice.component'
import { NotificationCenterComponent } from './notification-center.component'

@Component({
  standalone: true,
  selector: 'xp-notification-host',
  imports: [AnnouncementNoticeComponent, TranslateModule, ZardButtonComponent, ZardCardComponent, ZardIconComponent],
  template: `@if (!suspended()) {
    <aside
      class="pointer-events-none fixed right-4 top-20 z-40 w-96 max-w-[calc(100vw-2rem)]"
      [attr.aria-label]="'XP.Notifications.Title' | translate"
    >
      @if (notice(); as item) {
        <xp-announcement-notice [item]="item" (dismissed)="dismissNotice()" />
      } @else if (hint()) {
        <z-card role="status" class="pointer-events-auto flex-row items-center gap-3 p-4 shadow-lg">
          <button z-button zType="ghost" class="min-w-0 flex-1 whitespace-normal" (click)="openCenter()">
            {{ 'XP.Notifications.TaskCompleted' | translate }}
          </button>
          <button
            z-button
            zType="ghost"
            zSize="icon"
            [attr.aria-label]="'XP.ACTIONS.Close' | translate"
            (click)="hint.set(null)"
          >
            <z-icon zType="x" />
          </button>
        </z-card>
      }
    </aside>
  }`
})
export class NotificationHostComponent implements OnInit, OnDestroy {
  readonly suspended = input(false)
  private readonly service = inject(UserNotificationsService)
  private readonly dialog = inject(Dialog)
  private readonly router = inject(Router)
  readonly notice = signal<Announcement | null>(null)
  readonly hint = signal<UserNotification | null>(null)
  private noticeOpener: HTMLElement | null = null
  private seen: Set<string> | null = null
  private lastSync = 0
  private active: { close(result?: string): void }
  private presenting = false
  private destroyed = false
  private identity = ''
  private openRequest = 0
  private shown = new Set<string>()
  private timer: ReturnType<typeof setInterval>
  constructor() {
    effect(() => {
      const identity = this.service.identity()
      if (identity !== this.identity) {
        this.identity = identity
        this.active?.close('reset')
        this.notice.set(null)
        this.hint.set(null)
        this.shown.clear()
        this.seen = null
        this.lastSync = 0
      }
      const snapshot = this.service.snapshot()
      if (snapshot) {
        const fresh =
          this.seen && this.service.canShowLiveHint(this.lastSync)
            ? snapshot.notifications.find(
                (item) =>
                  !this.seen.has(item.id) &&
                  !item.readAt &&
                  Date.parse(item.createdAt) > this.lastSync - 3000 &&
                  !this.router.url.includes(item.action.conversationId) &&
                  (!item.action.threadId || !this.router.url.includes(item.action.threadId))
              )
            : null
        this.seen = new Set(snapshot.notifications.map((item) => item.id))
        this.lastSync = Date.now()
        if (fresh) this.hint.set(fresh)
      }
      if (!snapshot) {
        this.active?.close('reset')
        this.hint.set(null)
      }
      const notice = untracked(this.notice)
      if (notice && !snapshot?.announcements.some((item) => item.id === notice.id)) this.notice.set(null)
      const request = this.service.openRequested()
      if (request !== this.openRequest) {
        this.openRequest = request
        this.active?.close('reset')
        this.notice.set(null)
        this.hint.set(null)
        this.active = this.dialog.open(NotificationCenterComponent, {
          backdropClass: 'backdrop-blur-xs-black',
          panelClass: 'xp-overlay-pane-dialog'
        })
      }
    })
  }
  ngOnInit() {
    this.service.start()
    this.timer = setInterval(() => void this.present(), 1000)
  }
  private async present() {
    if (
      this.destroyed ||
      this.suspended() ||
      this.presenting ||
      this.notice() ||
      !this.identity ||
      document.visibilityState !== 'visible' ||
      this.dialog.openDialogs.length
    )
      return
    let item = this.service.snapshot()?.announcements.find((item) => !this.shown.has(item.id))
    if (!item) return
    const identity = this.identity
    this.presenting = true
    try {
      item = await this.service.announcement(item.id)
    } catch {
      this.service.scheduleRefresh()
      return
    } finally {
      this.presenting = false
    }
    if (
      this.destroyed ||
      identity !== this.identity ||
      this.suspended() ||
      !this.service.snapshot()?.announcements.some((entry) => entry.id === item.id) ||
      item.dismissedAt ||
      (item.expiresAt && Date.parse(item.expiresAt) <= Date.now()) ||
      this.dialog.openDialogs.length
    )
      return
    this.shown.add(item.id)
    this.noticeOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    this.notice.set(item)
  }
  dismissNotice() {
    const item = this.notice()
    if (!item) return
    const focusedNotice = document.activeElement?.closest('xp-announcement-notice')
    this.notice.set(null)
    if (focusedNotice && this.noticeOpener?.isConnected) this.noticeOpener.focus()
    this.service.dismiss(item.id)
    // Leave the rest in history without replacing the card immediately after dismissal.
    this.service.snapshot()?.announcements.forEach((entry) => this.shown.add(entry.id))
  }
  openCenter() {
    this.service.open()
  }
  ngOnDestroy() {
    this.destroyed = true
    clearInterval(this.timer)
    this.active?.close('reset')
    this.service.stop()
  }
}
