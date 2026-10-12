import { ZardButtonComponent, XpDialogFrameImports } from '../../../../../components'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { Component, inject } from '@angular/core'
import { CountdownConfig, CountdownEvent, CountdownTimer } from '../../countdown'
import { TranslateModule } from '@ngx-translate/core'
import { XpCountdownModule } from '../../countdown'
/**
 * @deprecated Use `injectConfirm`
 */
@Component({
  selector: 'xp-countdown-confirmation',
  templateUrl: 'countdown.component.html',
  providers: [CountdownTimer],
  imports: [XpCountdownModule, TranslateModule, ...XpDialogFrameImports, ZardButtonComponent, DragDropModule]
})
export class XpCountdownConfirmationComponent {
  protected dialogRef: DialogRef<'continue'> = inject(DialogRef)
  private data = inject<{ recordType: string; isEnabled?: boolean }>(DIALOG_DATA)

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
