import { A11yModule } from '@angular/cdk/a11y'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, HostBinding, inject, signal } from '@angular/core'
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [
    MatButtonModule,
    A11yModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FormlyModule,
    TranslateModule,
    DragDropModule,

    ButtonGroupDirective
  ],
  selector: 'cdk-confirm-options',
  templateUrl: './confirm-options.component.html',
  styleUrls: ['./confirm-options.component.scss'],
  host: {
    'class': 'cdk-dialog-card'
  }
})
export class CdkConfirmOptionsComponent {
  readonly data = inject<{ formFields: any; information: string }>(DIALOG_DATA)
  readonly dialogRef = inject(DialogRef)

  @HostBinding('class.ngm-dialog-container') isDialogContainer = true

  formGroup = new FormGroup({})
  model = {}
  options = {}

  readonly fields = signal(this.data.formFields)

  onModelChange(event) {
    //
  }

  apply() {
    this.dialogRef.close(this.model)
  }
}
