import { Injectable, inject } from '@angular/core'

import { ZardAlertDialogOptions, ZardAlertDialogService } from '@xpert-ai/headless-ui'
import { TranslateService } from '@ngx-translate/core'

export interface NgmConfirmDeleteData {
  title?: string
  value?: unknown
  information?: string
  actionText?: string | null
  cancelText?: string | null
}

@Injectable({
  providedIn: 'root'
})
export class NgmConfirmDeleteService {
  readonly #alertDialog = inject(ZardAlertDialogService)
  readonly #translate = inject(TranslateService)

  confirm(
    data: NgmConfirmDeleteData = {},
    options: Pick<ZardAlertDialogOptions, 'closable' | 'customClasses' | 'maskClosable' | 'viewContainerRef' | 'width'> = {}
  ) {
    return this.#alertDialog.confirm({
      title: this.getTitle(data),
      description: data.information,
      actionText: data.actionText ?? this.#translate.instant('COMPONENTS.COMMON.Confirm', { Default: 'Confirm' }),
      cancelText: data.cancelText ?? this.#translate.instant('COMPONENTS.COMMON.CANCEL', { Default: 'Cancel' }),
      destructive: true,
      ...options
    })
  }

  private getTitle(data: NgmConfirmDeleteData) {
    if (data.title) {
      return data.title
    }

    const title = this.#translate.instant('COMPONENTS.CONFIRM.DELETE', { Default: 'Confirm Delete' })
    const value = data.value == null || data.value === '' ? null : String(data.value)

    return value ? `${title} [${value}]?` : `${title}?`
  }
}
