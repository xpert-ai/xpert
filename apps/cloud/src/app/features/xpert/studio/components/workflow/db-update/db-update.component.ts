
import { ChangeDetectionStrategy, Component } from '@angular/core'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@xpert-ai/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { XpertWorkflowNodeDBBaseComponent } from '../db/db.component'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  selector: 'xp-workflow-node-db-update',
  templateUrl: './db-update.component.html',
  styleUrls: ['./db-update.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, ...ZardTooltipImports, TranslateModule, PlusSvgComponent],
  host: {
    tabindex: '-1'
  }
})
export class XpertWorkflowNodeDBUpdateComponent extends XpertWorkflowNodeDBBaseComponent {
  // States
}
