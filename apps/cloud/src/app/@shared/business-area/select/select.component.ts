import { DialogRef } from '@angular/cdk/dialog'

import { Component, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { IBusinessArea, injectBusinessAreaTree } from '@xpert-ai/cloud/state'
import { TreeTableModule } from '@xpert-ai/ocap-angular/common'
import { DisplayDensity } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [FormsModule, TranslateModule, TreeTableModule],
  selector: 'pac-business-area-select',
  templateUrl: 'select.component.html',
  styleUrls: ['select.component.scss']
})
export class BusinessAreaSelectComponent {
  eDisplayDensity = DisplayDensity

  // readonly _data = inject<{}>(DIALOG_DATA)
  readonly dialogRef = inject(DialogRef)

  readonly businessAreaTree = toSignal(injectBusinessAreaTree())

  selectArea(area: IBusinessArea) {
    this.dialogRef.close(area)
  }
}
