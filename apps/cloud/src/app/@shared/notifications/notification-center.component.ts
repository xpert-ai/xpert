import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { DatePipe } from '@angular/common'
import { Component, effect, inject, OnDestroy, OnInit, signal } from '@angular/core'
import { Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { Announcement, UserNotification } from '@xpert-ai/contracts'
import {
  XpDialogFrameImports,
  ZardButtonComponent,
  ZardIconComponent,
  ZardAlertComponent,
  ZardEmptyComponent,
  ZardLoaderComponent
} from '@xpert-ai/headless-ui'
import { UserNotificationsService } from '../../@core/services/user-notifications.service'
import { AnnouncementDialogComponent } from './announcement-dialog.component'

@Component({
  standalone: true,
  selector: 'xp-notification-center',
  imports: [
    TranslateModule,
    DatePipe,
    ...XpDialogFrameImports,
    ZardButtonComponent,
    ZardIconComponent,
    ZardAlertComponent,
    ZardEmptyComponent,
    ZardLoaderComponent
  ],
  template: `<section xpDialogLayout="standard">
    <header xpDialogHeader>
      <h2 xpDialogHeading>{{ 'XP.Notifications.Title' | translate }}</h2>
      <p xpDialogDescription>{{ 'XP.Notifications.HistoryHint' | translate }}</p>
      <button
        xpDialogCloseButton
        z-button
        zType="ghost"
        zSize="icon"
        (click)="ref.close()"
        [attr.aria-label]="'XP.ACTIONS.Close' | translate"
      >
        <z-icon zType="x" />
      </button>
    </header>
    <div xpDialogBody class="space-y-4">
      @if (failed()) {
        <z-alert zType="destructive" [zDescription]="'XP.Notifications.LoadFailed' | translate" />
        <button z-button (click)="load()">{{ 'XP.Notifications.Retry' | translate }}</button>
      }
      @if (loading()) {
        <div role="status" class="flex items-center gap-2">
          <z-loader zSize="sm" />{{ 'XP.Notifications.Loading' | translate }}
        </div>
      }
      <h3 class="font-semibold">{{ 'XP.Notifications.Announcements' | translate }}</h3>
      @for (item of announcements(); track item.id) {
        <button z-button zType="ghost" class="w-full justify-start" (click)="show(item)">
          {{ item.title }}
          @if (item.expiresAt && expired(item.expiresAt)) {
            · {{ 'XP.Notifications.Expired' | translate }}
          }
        </button>
      }
      @if (moreAnnouncements()) {
        <button z-button zType="secondary" (click)="loadAnnouncements()">
          {{ 'XP.Notifications.More' | translate }}
        </button>
      }
      <h3 class="font-semibold">{{ 'XP.Notifications.Results' | translate }}</h3>
      @for (item of notifications(); track item.id) {
        <button
          z-button
          zType="ghost"
          class="w-full justify-start"
          [class.font-semibold]="!item.readAt"
          (click)="open(item)"
        >
          {{ 'XP.Notifications.TaskCompleted' | translate }} · {{ item.createdAt | date: 'short' }}
        </button>
      }
      @if (moreNotifications()) {
        <button z-button zType="secondary" (click)="loadNotifications()">
          {{ 'XP.Notifications.More' | translate }}
        </button>
      }
      @if (!loading() && !announcements().length && !notifications().length && !failed()) {
        <z-empty zIcon="bell" [zTitle]="'XP.Notifications.Empty' | translate" />
      }
    </div>
  </section>`
})
export class NotificationCenterComponent implements OnInit, OnDestroy {
  readonly ref = inject(DialogRef)
  private readonly service = inject(UserNotificationsService)
  private readonly dialog = inject(Dialog)
  private readonly router = inject(Router)
  readonly announcements = signal<Announcement[]>([])
  readonly notifications = signal<UserNotification[]>([])
  readonly moreAnnouncements = signal(false)
  readonly moreNotifications = signal(false)
  readonly loading = signal(false)
  readonly failed = signal(false)
  expired(value: string) {
    return Date.parse(value) <= Date.now()
  }
  private loadingAnnouncements = false
  private loadingNotifications = false
  private announcementOffset = 0
  private offset = 0
  private destroyed = false
  private historyDialog: { close(result?: string): void }
  private historyId: string | null = null
  constructor() {
    effect(() => {
      this.service.snapshot()
      const id = this.historyId
      if (id)
        void this.service.announcement(id).catch(() => {
          if (this.historyId === id) this.historyDialog?.close('reset')
        })
    })
  }
  ngOnDestroy() {
    this.destroyed = true
    this.historyDialog?.close('reset')
  }
  ngOnInit() {
    void this.load()
  }
  async load() {
    this.loading.set(true)
    this.failed.set(false)
    try {
      await Promise.all([this.loadAnnouncements(), this.loadNotifications()])
    } catch {
      this.failed.set(true)
    } finally {
      this.loading.set(false)
    }
  }
  async loadAnnouncements() {
    if (this.loadingAnnouncements) return
    this.loadingAnnouncements = true
    try {
      const data = await this.service.history(this.announcementOffset)
      this.announcementOffset += data.items.length
      this.announcements.update((items) => [
        ...new Map([...items, ...data.items].map((item) => [item.id, item])).values()
      ])
      this.moreAnnouncements.set(this.announcementOffset < data.total)
    } catch {
      this.failed.set(true)
    } finally {
      this.loadingAnnouncements = false
    }
  }
  async loadNotifications() {
    if (this.loadingNotifications) return
    this.loadingNotifications = true
    try {
      const data = await this.service.notifications(this.offset)
      this.offset = data.nextOffset
      this.notifications.update((items) => [
        ...new Map([...items, ...data.items].map((item) => [item.id, item])).values()
      ])
      this.moreNotifications.set(data.hasMore)
    } catch {
      this.failed.set(true)
    } finally {
      this.loadingNotifications = false
    }
  }
  async show(item: Announcement) {
    try {
      const current = await this.service.announcement(item.id)
      if (this.destroyed) return
      this.historyId = item.id
      const ref = this.dialog.open(AnnouncementDialogComponent, {
        data: current,
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog'
      })
      this.historyDialog = ref
      ref.closed.subscribe((result) => {
        this.historyId = null
        if (result !== 'reset' && !this.destroyed) this.service.dismiss(item.id)
      })
    } catch {
      if (!this.destroyed) this.failed.set(true)
    }
  }
  async open(item: UserNotification) {
    try {
      await this.service.read(item.id)
      if (this.destroyed) return
      this.ref.close()
      await this.router.navigate(['/chat/c', item.action.conversationId])
    } catch {
      this.failed.set(true)
    }
  }
}
