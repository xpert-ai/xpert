import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { XpertWorkflowNodeDBBaseComponent } from '../db/db.component'

@Component({
  selector: 'xp-workflow-node-db-delete',
  templateUrl: './db-delete.component.html',
  styleUrls: ['./db-delete.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FFlowModule, MatTooltipModule, TranslateModule, PlusSvgComponent],
  host: {
    tabindex: '-1'
  }
})
export class XpertWorkflowNodeDBDeleteComponent extends XpertWorkflowNodeDBBaseComponent {
  // States
  
}
