import { A11yModule } from '@angular/cdk/a11y'
import { Dialog, DIALOG_DATA, DialogModule, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, HostBinding, OnInit, inject } from '@angular/core'
import { AbstractControl, FormControl, FormsModule, ReactiveFormsModule, ValidationErrors } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { EMPTY, Observable, switchMap } from 'rxjs'

export type TConfirmUniqueInfo = {
  title?: string;
  value?: any;
  validators?: Array<(value: string) => Promise<ValidationErrors>>
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    A11yModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    DialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    TranslateModule,

    ButtonGroupDirective
  ],
  selector: 'cdk-confirm-unique',
  templateUrl: './confirm-unique.component.html',
  styleUrls: ['./confirm-unique.component.scss'],
  host: {
    'class': 'cdk-dialog-card'
  }
})
export class CdkConfirmUniqueComponent implements OnInit {
  @HostBinding('class.ngm-dialog-container') isDialogContainer = true

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
    this.value.setAsyncValidators(this.validators?.map((validator) => async (control: AbstractControl) => await validator(control.value)))
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

  return <T>(info: TConfirmUniqueInfo, execution: (value: string) => Observable<T>) => {
    return dialog.open<string>(CdkConfirmUniqueComponent, {
      data: info
    }).closed.pipe(
      switchMap((value) => value ? execution(value) : EMPTY)
    )
  }
}