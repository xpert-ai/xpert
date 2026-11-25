import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { DatePipe } from '@angular/common'
import { Component, computed, effect, inject, OnDestroy, OnInit, signal, untracked } from '@angular/core'
import { Router } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
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
import { OutputPreferencesComponent } from './output-preferences.component'
import { openConversation } from './open-conversation'
import { AnnouncementDialogComponent } from './announcement-dialog.component'
import { WorkbenchEntryNavigation } from '../../@core/services/workbench-entry-navigation.service'
import { outputWorkbenchEntry } from '@xpert-ai/contracts'

@Component({
  standalone: true,
  selector: 'xp-notification-center',
  imports: [
    OutputPreferencesComponent,
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
      <xp-output-preferences />
      @if (failed()) {
        <z-alert zType="destructive" [zDescription]="'XP.Notifications.LoadFailed' | translate" />
        <button z-button (click)="load()">{{ 'XP.Notifications.Retry' | translate }}</button>
      }
      @if (loading()) {
        <div role="status" class="flex items-center gap-2">
          <z-loader zSize="sm" />{{ 'XP.Notifications.Loading' | translate }}
        </div>
      }
      @if (pending().length) {
        <h3 class="font-semibold">{{ 'XP.Notifications.PendingActions' | translate }}</h3>
        @for (item of pending(); track item.id) {
          @if (item.kind === 'action.required') {
            <article class="space-y-2 rounded-lg border p-3">
              <p class="font-medium">{{ item.presentation.title }}</p>
              <p class="text-sm text-muted-foreground">{{ 'XP.Notifications.AwaitingDecision' | translate }}</p>
              <button z-button (click)="open(item)">{{ 'XP.Notifications.ViewAndAct' | translate }}</button>
            </article>
          }
        }
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
      @for (item of recent(); track item.id) {
        <button
          z-button
          zType="ghost"
          class="w-full justify-start"
          [class.font-semibold]="!item.readAt"
          (click)="open(item)"
        >
          {{
            item.kind === 'action.required'
              ? item.presentation.title
              : item.kind === 'agent.output'
                ? item.titles.join(' · ')
                : ('XP.Notifications.TaskCompleted' | translate)
          }}
          @if (item.kind === 'action.required') {
            ·
            {{
              (item.presentation.state === 'handled' ? 'XP.Notifications.Handled' : 'XP.Notifications.Closed')
                | translate
            }}
          }
          · {{ item.createdAt | date: 'short' }}
        </button>
        @if (expanded()?.id === item.id) {
          <ul>
            @for (entry of expanded()?.items; track entry.id) {
              <li>
                @if (entry.action || entry.workbench) {
                  <button z-button zType="link" (click)="open(item, entry.id)">{{ entry.title }}</button>
                } @else {
                  {{ entry.title }}
                }
                @if (entry.fields?.length) {
                  <dl>
                    @for (field of entry.fields; track $index) {
                      <dt>{{ language.currentLang?.startsWith('zh') ? field.label.zh_Hans : field.label.en_US }}</dt>
                      <dd class="whitespace-pre-wrap">{{ field.value }}</dd>
                    }
                  </dl>
                }
              </li>
            }
          </ul>
        }
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
  readonly language = inject(TranslateService)
  private readonly router = inject(Router)
  private readonly workbench = inject(WorkbenchEntryNavigation)
  readonly announcements = signal<Announcement[]>([])
  readonly notifications = signal<UserNotification[]>([])
  readonly pending = computed(() =>
    this.notifications().filter((item) => item.kind === 'action.required' && item.presentation.state === 'pending')
  )
  readonly recent = computed(() =>
    this.notifications().filter((item) => !(item.kind === 'action.required' && item.presentation.state === 'pending'))
  )
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
      untracked(() => {
        if (this.offset) void this.refreshNotifications()
      })
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
  private async refreshNotifications() {
    if (this.loadingNotifications || this.destroyed) return
    this.loadingNotifications = true
    try {
      const items: UserNotification[] = []
      let offset = 0
      let hasMore = false
      do {
        const page = await this.service.notifications(offset)
        items.push(...page.items)
        if (page.nextOffset <= offset) break
        offset = page.nextOffset
        hasMore = page.hasMore
      } while (hasMore && offset < this.offset)
      if (!this.destroyed) {
        this.notifications.set(items)
        this.offset = offset
        this.moreNotifications.set(hasMore)
      }
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
  readonly expanded = signal<{
    id: string
    items: NonNullable<Awaited<ReturnType<UserNotificationsService['read']>>['items']>
  } | null>(null)
  async open(item: UserNotification, memberId?: string) {
    try {
      const { items, notification } = await this.service.read(item.id)
      if (this.destroyed) return
      if (item.kind === 'action.required') {
        if (notification?.kind !== 'action.required') throw new Error('ACTION_NOTIFICATION_UNAVAILABLE')
        if (!(await this.workbench.open(notification.presentation.workbench)))
          throw new Error('ACTION_NOTIFICATION_UNAVAILABLE')
        this.ref.close()
        return
      }
      if (item.kind === 'agent.output') this.expanded.set({ id: item.id, items: items ?? [] })
      const entry =
        item.kind === 'agent.output'
          ? memberId
            ? items?.find((entry) => entry.id === memberId)
            : items?.length === 1
              ? items[0]
              : null
          : null
      if (entry?.workbench) {
        if (!(await this.workbench.open(outputWorkbenchEntry(entry.workbench))))
          throw new Error('WORKBENCH_UNAVAILABLE')
        this.ref.close()
        return
      }
      const action = item.kind === 'agent.output' ? entry?.action : item.action
      if (action) {
        this.ref.close()
        await openConversation(this.router, action)
      } else {
        this.notifications.update((rows) =>
          rows.map((r) => (r.id === item.id ? { ...r, readAt: new Date().toISOString() } : r))
        )
      }
    } catch {
      this.expanded.set(null)
      this.failed.set(true)
    }
  }
}
