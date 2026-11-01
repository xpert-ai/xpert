import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, inject, signal } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { Announcement, createAnnouncementSchema } from '@xpert-ai/contracts'
import {
  XpDialogFrameImports,
  ZardAlertComponent,
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardDateTimePickerComponent,
  ZardFormFieldComponent,
  ZardFormLabelComponent,
  ZardInputDirective,
  ZardRadioComponent,
  ZardRadioGroupComponent
} from '@xpert-ai/headless-ui'
import { UserNotificationsService } from '../../../@core/services/user-notifications.service'
import { injectToastr } from '../../../@core/services/toastr.service'
import { getErrorMessage } from '../../../@core/types'
import { NotificationTextComponent } from '../../../@shared/notifications/notification-text.component'

export interface AnnouncementEditorData {
  item?: Announcement
  copy?: boolean
}

function localDate(value: string) {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

@Component({
  standalone: true,
  selector: 'xp-announcement-editor',
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    ...XpDialogFrameImports,
    ZardAlertComponent,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardDateTimePickerComponent,
    ZardFormFieldComponent,
    ZardFormLabelComponent,
    ZardInputDirective,
    ZardRadioComponent,
    ZardRadioGroupComponent,
    NotificationTextComponent
  ],
  templateUrl: './announcement-editor.component.html'
})
export class AnnouncementEditorComponent {
  private readonly service = inject(UserNotificationsService)
  private readonly fb = inject(FormBuilder)
  private readonly toastr = injectToastr()
  readonly ref = inject<DialogRef<boolean>>(DialogRef)
  readonly data = inject<AnnouncementEditorData>(DIALOG_DATA)
  readonly selected = signal(this.data.copy ? null : (this.data.item ?? null))
  readonly busy = signal(false)
  readonly submitted = signal(false)
  readonly preview = signal(false)
  readonly timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    body: ['', [Validators.required, Validators.maxLength(20000)]],
    category: ['general'],
    severity: ['info'],
    web: [true],
    desktop: [true],
    startsAt: ['', Validators.required],
    expiresAt: [''],
    actionLabel: ['', Validators.maxLength(80)],
    actionUrl: ['']
  })
  constructor() {
    const { item, copy } = this.data
    this.form.reset({
      title: item?.title ?? '',
      body: item?.body ?? '',
      category: item?.category ?? 'general',
      severity: item?.severity ?? 'info',
      web: item ? item.clients.includes('web') : true,
      desktop: item ? item.clients.includes('desktop') : true,
      startsAt: localDate(copy || !item ? new Date().toISOString() : item.startsAt),
      expiresAt: item?.expiresAt && !copy ? localDate(item.expiresAt) : '',
      actionLabel: item?.action?.label ?? '',
      actionUrl: item?.action?.url ?? ''
    })
  }
  close() {
    if (!this.busy()) this.ref.close()
  }
  async save() {
    this.submitted.set(true)
    this.form.markAllAsTouched()
    if (this.form.invalid || this.busy()) return
    const value = this.form.getRawValue()
    const start = new Date(value.startsAt)
    const expiry = value.expiresAt ? new Date(value.expiresAt) : null
    const parsed = createAnnouncementSchema.safeParse({
      title: value.title,
      body: value.body,
      category: value.category,
      severity: value.severity,
      clients: [...(value.web ? ['web'] : []), ...(value.desktop ? ['desktop'] : [])],
      startsAt: Number.isFinite(start.getTime()) ? start.toISOString() : '',
      expiresAt: expiry && Number.isFinite(expiry.getTime()) ? expiry.toISOString() : null,
      action:
        value.actionUrl || value.actionLabel ? { type: 'link', label: value.actionLabel, url: value.actionUrl } : null
    })
    if (!parsed.success) {
      this.toastr.error('XP.Notifications.Invalid')
      return
    }
    this.busy.set(true)
    this.ref.disableClose = true
    try {
      await this.service.save(parsed.data, this.selected() ?? undefined)
      this.ref.close(true)
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
    } finally {
      this.busy.set(false)
      this.ref.disableClose = false
    }
  }
}
