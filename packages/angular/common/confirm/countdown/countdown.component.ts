import { Component, HostBinding, inject } from '@angular/core'
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog'
import { CountdownConfig, CountdownEvent, CountdownTimer } from '../../countdown'

/**
 * @deprecated Use `injectConfirm`
 */
@Component({
  selector: 'ngm-countdown-confirmation',
  templateUrl: 'countdown.component.html',
  styles: [
    `
      .center {
        align-items: center;
        width: 350px;
      }
    `
  ],
  providers: [CountdownTimer]
})
export class NgmCountdownConfirmationComponent {
  @HostBinding('class.ngm-dialog-container') isDialogContainer = true

  protected dialogRef: MatDialogRef<NgmCountdownConfirmationComponent> = inject(MatDialogRef)
  private data = inject(MAT_DIALOG_DATA)

  recordType: string
  isEnabled: boolean
  countDownConfig: CountdownConfig = { leftTime: 10 }

  constructor() {
    if (this.data) {
      this.recordType = this.data.recordType
      this.isEnabled = this.data.isEnabled
    }
  }

  handleActionEvent(e: CountdownEvent) {
    if (e.action === 'done') {
      this.dialogRef.close('continue')
    }
  }

  close() {
    this.dialogRef.close()
  }

  continue() {
    this.dialogRef.close('continue')
  }
}
