import { Component, HostBinding, inject } from '@angular/core'
import { CountdownConfig, CountdownEvent, CountdownTimer } from '../../countdown'

import { Z_MODAL_DATA, ZardButtonComponent, ZardDialogModule, ZardDialogRef } from '../../../../../components'
import { TranslateModule } from '@ngx-translate/core'
import { XpCountdownModule } from '../../countdown'
/**
 * @deprecated Use `injectConfirm`
 */
@Component({
  selector: 'xp-countdown-confirmation',
  templateUrl: 'countdown.component.html',
  styles: [
    `
      .center {
        align-items: center;
        width: 350px;
      }
    `
  ],
  providers: [CountdownTimer],
  imports: [XpCountdownModule, TranslateModule, ZardDialogModule, ZardButtonComponent]
})
export class XpCountdownConfirmationComponent {
  @HostBinding('class.xp-dialog-container') isDialogContainer = true

  protected dialogRef: ZardDialogRef<XpCountdownConfirmationComponent> = inject(ZardDialogRef)
  private data = inject(Z_MODAL_DATA)

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
