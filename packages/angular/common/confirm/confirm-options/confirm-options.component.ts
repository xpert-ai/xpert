import { DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { Component, HostBinding, inject, signal } from '@angular/core';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ButtonGroupDirective } from '@metad/ocap-angular/core';
import { FormlyModule } from '@ngx-formly/core';
import { TranslateModule } from '@ngx-translate/core';


/**
 * @deprecated CdkConfirmOptionsComponent
 */
@Component({
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    CommonModule, FormsModule, ReactiveFormsModule, FormlyModule, TranslateModule,
    DragDropModule,

    ButtonGroupDirective
  ],
  selector: 'ngm-confirm-options',
  templateUrl: './confirm-options.component.html',
  styleUrls: ['./confirm-options.component.scss']
})
export class NgmConfirmOptionsComponent {
  readonly data = inject<{ formFields: any; information: string }>(MAT_DIALOG_DATA)
  readonly dialogRef = inject(MatDialogRef)

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
