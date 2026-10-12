import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { EMPTY, Observable, of, switchMap } from 'rxjs'

import { ZardAlertDialogService } from '../../components/alert-dialog/alert-dialog.service'
import { Z_MODAL_DATA } from '../../components/dialog/dialog.service'
import { injectUiI18nService } from '../../core'

export type TConfirmInfo = {
  title?: string
  information: string
}

@Component({
  standalone: true,
  selector: 'xp-confirm-dialog-content',
  template: `
    <div class="min-h-[100px] py-1 text-sm leading-relaxed whitespace-pre-line text-foreground/90">
      {{ data?.information ?? '' }}
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UiConfirmDialogContentComponent {
  readonly data = inject<TConfirmInfo>(Z_MODAL_DATA)
}

export function injectConfirm() {
  const dialog = inject(ZardAlertDialogService)
  const i18n = injectUiI18nService()

  return <T>(info: TConfirmInfo, execution?: Observable<T>) => {
    const decision$ = dialog.confirm({
      closable: true,
      title: info.title ?? i18n.t('xp-ui:confirm.confirm', { Default: 'Confirm' }),
      description: info.information,
      actionText: i18n.t('xp-ui:confirm.confirm', { Default: 'Confirm' }),
      cancelText: i18n.t('xp-ui:confirm.cancel', { Default: 'Cancel' })
    })

    return decision$.pipe(switchMap((confirm) => (confirm ? (execution ?? of(confirm as T)) : EMPTY)))
  }
}
