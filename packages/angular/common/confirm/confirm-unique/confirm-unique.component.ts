import { A11yModule } from '@angular/cdk/a11y'
import { DragDropModule } from '@angular/cdk/drag-drop'

import { Component, HostBinding, OnInit, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog'
import { ZardButtonComponent, ZardFormImports, ZardInputDirective } from '@xpert-ai/headless-ui'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { isString } from 'lodash-es'

/**
 * @deprecated use CdkConfirmUniqueComponent
 */
@Component({
  standalone: true,
  imports: [A11yModule, FormsModule, DragDropModule, MatDialogModule, ZardButtonComponent, ...ZardFormImports, ZardInputDirective, TranslateModule, ButtonGroupDirective],
  selector: 'ngm-confirm-unique',
  templateUrl: './confirm-unique.component.html',
  styleUrls: ['./confirm-unique.component.scss']
})
export class NgmConfirmUniqueComponent implements OnInit {
  @HostBinding('class.ngm-dialog-container') isDialogContainer = true

  public data = inject<string | { title: string; value: string }>(MAT_DIALOG_DATA)
  private _dialogRef = inject(MatDialogRef<NgmConfirmUniqueComponent>)

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

  onSubmit() {
    this._dialogRef.close(this.value)
  }
}
