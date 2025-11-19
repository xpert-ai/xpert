import { DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { IBusinessArea, injectBusinessAreaTree } from '@metad/cloud/state'
import { TreeTableModule } from '@metad/ocap-angular/common'
import { DisplayDensity } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, TreeTableModule],
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
