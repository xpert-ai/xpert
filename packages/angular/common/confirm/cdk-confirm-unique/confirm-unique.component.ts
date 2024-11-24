import { A11yModule } from '@angular/cdk/a11y'
import { DIALOG_DATA, DialogModule, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, HostBinding, OnInit, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { isString } from 'lodash-es'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    A11yModule,
    FormsModule,
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

  public data = inject<string | { title: string; value: string }>(DIALOG_DATA)
  private _dialogRef = inject(DialogRef<string, CdkConfirmUniqueComponent>)

  value: string
  title: string

  ngOnInit(): void {
    this.reset()
  }

  reset() {
    if (isString(this.data)) {
      this.value = this.data
    } else {
      this.value = this.data?.value
      this.title = this.data?.title
    }
  }

  onCancel() {
    this._dialogRef.close()
  }

  onApply() {
    this._dialogRef.close(this.value)
  }
}
