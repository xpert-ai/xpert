import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { Announcement } from '@xpert-ai/contracts'
import {
  ZardAccordionImports,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardEmptyComponent,
  ZardLoaderComponent
} from '@xpert-ai/headless-ui'
import { UserNotificationsService } from '../../../@core/services/user-notifications.service'
import { injectToastr } from '../../../@core/services/toastr.service'
import { getErrorMessage } from '../../../@core/types'
import { NotificationTextComponent } from '../../../@shared/notifications/notification-text.component'
import { AnnouncementEditorComponent, AnnouncementEditorData } from './announcement-editor.component'

@Component({
  standalone: true,
  selector: 'xp-announcements-settings',
  imports: [
    CommonModule,
    TranslateModule,
    ZardButtonComponent,
    ...ZardAccordionImports,
    ZardBadgeComponent,
    ZardEmptyComponent,
    ZardLoaderComponent,
    NotificationTextComponent
  ],
  host: { class: 'block w-full min-w-0' },
  templateUrl: './announcements.component.html'
})
export class AnnouncementsComponent implements OnInit, OnDestroy {
  private readonly service = inject(UserNotificationsService)
  private readonly dialog = inject(Dialog)
  private editorRef?: DialogRef<boolean, AnnouncementEditorComponent>
  private readonly toastr = injectToastr()
  readonly items = signal<Announcement[]>([])
  readonly busy = signal(false)
  readonly failed = signal(false)
  readonly total = signal(0)
  readonly page = signal(0)
  readonly audit = signal<Awaited<ReturnType<UserNotificationsService['audit']>>>([])
  readonly auditId = signal('')
  async showAudit(item: Announcement) {
    try {
      this.audit.set(await this.service.audit(item.id))
      this.auditId.set(item.id)
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
    }
  }
  phase(item: Announcement) {
    return item.status !== 'published'
      ? item.status
      : Date.parse(item.startsAt) > Date.now()
        ? 'scheduled'
        : item.expiresAt && Date.parse(item.expiresAt) <= Date.now()
          ? 'expired'
          : 'active'
  }
  ngOnInit() {
    void this.load()
  }
  async load() {
    this.busy.set(true)
    this.failed.set(false)
    try {
      const data = await this.service.adminList(this.page() * 30)
      this.items.set(data.items)
      this.total.set(data.total)
    } catch (error) {
      this.failed.set(true)
      this.toastr.error(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }
  changePage(step: number) {
    this.page.update((value) => value + step)
    void this.load()
  }
  edit(item?: Announcement, copy = false) {
    if (this.busy() || this.editorRef) return
    const ref = this.dialog.open<boolean, AnnouncementEditorData, AnnouncementEditorComponent>(
      AnnouncementEditorComponent,
      {
        data: { item, copy },
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog',
        autoFocus: '#announcement-title'
      }
    )
    this.editorRef = ref
    ref.closed.subscribe((saved) => {
      this.editorRef = undefined
      if (saved) void this.load()
    })
  }
  ngOnDestroy() {
    this.editorRef?.close()
  }
  async transition(item: Announcement, action: 'publish' | 'withdraw') {
    if (this.busy()) return
    this.busy.set(true)
    try {
      await this.service.transition(item, action)
      await this.load()
      this.service.scheduleRefresh()
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }
}
