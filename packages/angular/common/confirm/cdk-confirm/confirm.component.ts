import { A11yModule } from '@angular/cdk/a11y'
import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { Component, computed, HostBinding, inject } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { EMPTY, Observable, of, switchMap } from 'rxjs'

export type TConfirmInfo = {
  title?: string;
  information: string
}

@Component({
  standalone: true,
  selector: 'cdk-confirm',
  templateUrl: './confirm.component.html',
  styleUrls: ['./confirm.component.scss'],
  imports: [TranslateModule, A11yModule, DragDropModule, MatButtonModule, ButtonGroupDirective],
  host: {
    'class': 'cdk-dialog-card'
  }
})
export class CdkConfirmComponent {
  readonly #data = inject<TConfirmInfo>(DIALOG_DATA)
  readonly dialogRef = inject(DialogRef)

  @HostBinding('class.ngm-dialog-container') isDialogContainer = true

  readonly title = computed(() => this.#data?.title)
  readonly information = computed(() => this.#data?.information)
}

export function injectConfirm() {
  const dialog = inject(Dialog)

  return <T>(info: TConfirmInfo, execution?: Observable<T>) => {
    return dialog.open(CdkConfirmComponent, {
      data: info
    }).closed.pipe(
      switchMap((confirm) => confirm ? (execution ?? of(confirm)) : EMPTY)
    )
  }
}