import { A11yModule } from '@angular/cdk/a11y'
import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { Component, computed, HostBinding, inject } from '@angular/core'

import { ButtonGroupDirective } from '../../core'
import { TranslateModule } from '@ngx-translate/core'
import { EMPTY, Observable, of, switchMap } from 'rxjs'
import { ZardButtonComponent } from '../../../../components/button'

export type TConfirmInfo = {
  title?: string
  information: string
}

/**
 * @deprecated 未找到直接使用位置，保留兼容导出，优先使用 `injectConfirm`。
 */
@Component({
  standalone: true,
  selector: 'cdk-confirm',
  templateUrl: './confirm.component.html',
  styleUrls: ['./confirm.component.scss'],
  imports: [TranslateModule, A11yModule, DragDropModule, ZardButtonComponent, ButtonGroupDirective],
  host: {
    class: 'cdk-dialog-card'
  }
})
export class CdkConfirmComponent {
  readonly #data = inject<TConfirmInfo>(DIALOG_DATA)
  readonly dialogRef = inject(DialogRef)

  @HostBinding('class.ngm-dialog-container') isDialogContainer = true

  readonly title = computed(() => this.#data?.title)
  readonly information = computed(() => this.#data?.information)
}

/**
 * @deprecated Use `injectConfirm` in ui instead
 */
export function injectConfirm() {
  const dialog = inject(Dialog)

  return <T>(info: TConfirmInfo, execution?: Observable<T>) => {
    return dialog
      .open(CdkConfirmComponent, {
        data: info
      })
      .closed.pipe(switchMap((confirm) => (confirm ? (execution ?? of(confirm)) : EMPTY)))
  }
}
