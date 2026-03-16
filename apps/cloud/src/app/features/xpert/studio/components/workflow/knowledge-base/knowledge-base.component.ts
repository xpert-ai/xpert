
import { ChangeDetectionStrategy, Component, computed } from '@angular/core'
import { IWFNKnowledgeBase } from '@cloud/app/@core'
import { CopilotModelSelectComponent } from '@cloud/app/@shared/copilot'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@metad/ocap-angular/common'
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
    CopilotModelSelectComponent,
    PlusSvgComponent
]
})
export class XpertWorkflowNodeKnowledgeBaseComponent extends WorkflowBaseNodeComponent {
  // States
  readonly kbEntity = computed(() => this.entity() as IWFNKnowledgeBase)
  readonly copilotModel = computed(() => this.kbEntity()?.copilotModel)
}
