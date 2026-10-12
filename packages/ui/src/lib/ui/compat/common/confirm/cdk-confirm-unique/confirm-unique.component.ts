import { DragDropModule } from '@angular/cdk/drag-drop'
import {
  ZardButtonComponent,
  XpDialogFrameImports,
  ZardInputDirective,
  ZardFormImports
} from '../../../../../components'
import { A11yModule } from '@angular/cdk/a11y'
import { Dialog, DIALOG_DATA, DialogModule, DialogRef } from '@angular/cdk/dialog'

import { Component, OnInit, inject } from '@angular/core'
import { AbstractControl, FormControl, FormsModule, ReactiveFormsModule, ValidationErrors } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { EMPTY, Observable, switchMap } from 'rxjs'

export type TConfirmUniqueInfo = {
  title?: string
  description?: string
  value?: any
  validators?: Array<(value: string) => Promise<ValidationErrors>>
}

@Component({
  standalone: true,
  imports: [
    DragDropModule,
    ...XpDialogFrameImports,
    A11yModule,
    FormsModule,
    ReactiveFormsModule,
    DialogModule,
    ZardButtonComponent,
    ...ZardFormImports,
    ZardInputDirective,
    TranslateModule
  ],
  selector: 'cdk-confirm-unique',
  templateUrl: './confirm-unique.component.html',
  host: {
    class: 'block min-w-0'
  }
})
export class CdkConfirmUniqueComponent implements OnInit {
  public data = inject<TConfirmUniqueInfo>(DIALOG_DATA)
  private _dialogRef = inject(DialogRef<string, CdkConfirmUniqueComponent>)

  readonly value = new FormControl<string>(null)
  title: string

  readonly validators = this.data?.validators
  get invalid() {
    return this.value.invalid
  }
  get error() {
    return this.value.errors?.['error']
  }

  ngOnInit(): void {
    this.value.setAsyncValidators(
      this.validators?.map((validator) => async (control: AbstractControl) => await validator(control.value))
    )
    this.reset()
  }

  reset() {
    this.value.setValue(this.data?.value)
    this.title = this.data?.title
  }

  onCancel() {
    this._dialogRef.close()
  }

  onApply() {
    this._dialogRef.close(this.value.value)
  }
}

export function injectConfirmUnique() {
  const dialog = inject(Dialog)

  return <T>(info: TConfirmUniqueInfo, execution?: (value: string) => Observable<T>) => {
    const dialogRef = dialog.open<string>(CdkConfirmUniqueComponent, {
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog',
      maxWidth: 'calc(100vw - 32px)',
      data: info
    }).closed

    if (execution) {
      return dialogRef.pipe(switchMap((value) => (value ? execution(value) : EMPTY)))
    }
    return dialogRef as Observable<T>
  }
}
