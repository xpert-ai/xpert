
import { ChangeDetectionStrategy, Component } from '@angular/core'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { XpertWorkflowNodeDBBaseComponent } from '../db/db.component'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  selector: 'xp-workflow-node-db-delete',
  templateUrl: './db-delete.component.html',
  styleUrls: ['./db-delete.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, ...ZardTooltipImports, TranslateModule, PlusSvgComponent],
  host: {
    tabindex: '-1'
  }
})
export class XpertWorkflowNodeDBDeleteComponent extends XpertWorkflowNodeDBBaseComponent {
  // States
}
