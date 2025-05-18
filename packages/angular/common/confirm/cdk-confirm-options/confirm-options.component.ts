import { A11yModule } from '@angular/cdk/a11y'
import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, HostBinding, inject, signal } from '@angular/core'
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { assign } from '@metad/ocap-core'
import { FormlyFieldConfig, FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [A11yModule, CommonModule, FormsModule, ReactiveFormsModule, FormlyModule, TranslateModule, DragDropModule],
  selector: 'cdk-confirm-options',
  templateUrl: './confirm-options.component.html',
  styleUrls: ['./confirm-options.component.scss'],
  host: {
    class: 'cdk-dialog-card'
  }
})
export class CdkConfirmOptionsComponent<T> {
  readonly data = inject<{ formFields: FormlyFieldConfig[]; information: string; value: T }>(DIALOG_DATA)
  readonly dialogRef = inject(DialogRef)

  @HostBinding('class.ngm-dialog-container') isDialogContainer = true

  formGroup = new FormGroup({})
  model = {}
  options = {}

  readonly fields = signal(this.data.formFields)

  constructor() {
    assign(this.model, this.data.value)
  }

  onModelChange(event) {
    // console.log(event)
  }

  cancel() {
    this.dialogRef.close()
  }

  apply() {
    this.dialogRef.close(this.model)
  }
}

export function injectConfirmOptions() {
  const dialog = inject(Dialog)

  return <T>(info: { formFields: FormlyFieldConfig[]; information?: string; value?: T }) => {
    return dialog.open<T>(CdkConfirmOptionsComponent, {
      data: info
    }).closed
  }
}
