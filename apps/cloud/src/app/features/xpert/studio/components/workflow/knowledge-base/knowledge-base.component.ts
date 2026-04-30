
import { ChangeDetectionStrategy, Component } from '@angular/core'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@xpert-ai/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { WorkflowBaseNodeComponent } from '../workflow-base.component'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  selector: 'xp-workflow-node-knowledge-base',
  templateUrl: './knowledge-base.component.html',
  styleUrls: ['./knowledge-base.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FFlowModule,
    ...ZardTooltipImports,
    TranslateModule,
    PlusSvgComponent
]
})
export class XpertWorkflowNodeKnowledgeBaseComponent extends WorkflowBaseNodeComponent {
}
