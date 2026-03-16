import { Component, HostBinding, inject } from '@angular/core'

import { Z_MODAL_DATA } from '@xpert-ai/headless-ui'
/**
 * @deprecated CdkConfirmDeleteComponent
 */
@Component({
  selector: 'ngm-confirm-delete',
  templateUrl: './confirm-delete.component.html',
  styleUrls: ['./confirm-delete.component.scss'],
  standalone: false
})
export class NgmConfirmDeleteComponent {
  readonly data = inject<{ title?: string; value: any; information: string }>(Z_MODAL_DATA)

  @HostBinding('class.ngm-dialog-container') isDialogContainer = true
}
