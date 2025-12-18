import { A11yModule } from '@angular/cdk/a11y'
import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { Component, computed, HostBinding, inject } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { EMPTY, isObservable, Observable, of, switchMap } from 'rxjs'

export type TConfirmDeleteInfo = {
  title?: string;
  value?: any;
  information: string
}

@Component({
  standalone: true,
  selector: 'cdk-confirm-delete',
  templateUrl: './confirm-delete.component.html',
  styleUrls: ['./confirm-delete.component.scss'],
  imports: [TranslateModule, A11yModule, DragDropModule, MatButtonModule, ButtonGroupDirective],
  host: {
    'class': 'cdk-dialog-card'
  }
})
export class CdkConfirmDeleteComponent {
  readonly #data = inject<TConfirmDeleteInfo>(DIALOG_DATA)
  readonly dialogRef = inject(DialogRef)

  @HostBinding('class.ngm-dialog-container') isDialogContainer = true

  readonly title = computed(() => this.#data?.title)
  readonly value = computed(() => this.#data?.value)
  readonly information = computed(() => this.#data?.information)
}

export function injectConfirmDelete() {
  const dialog = inject(Dialog)

  return <T>(info: TConfirmDeleteInfo, execution?: Observable<T> | (() => Observable<T>)) => {
    return dialog.open(CdkConfirmDeleteComponent, {
      data: info,
      minWidth: '480px',
    }).closed.pipe(
      switchMap((confirm) => {
        if (confirm) {
          if (isObservable(execution)) {
            return execution
          } else if (typeof execution === 'function') {
            return execution()
          }
          return of(confirm)
        }
        return EMPTY
      })
    )
  }
}