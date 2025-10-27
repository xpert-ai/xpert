import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { IWFNKnowledgeBase } from '@cloud/app/@core'
import { CopilotModelSelectComponent } from '@cloud/app/@shared/copilot'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { WorkflowBaseNodeComponent } from '../workflow-base.component'

@Component({
  selector: 'xp-workflow-node-knowledge-base',
  templateUrl: './knowledge-base.component.html',
  styleUrls: ['./knowledge-base.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FFlowModule,
    MatTooltipModule,
    TranslateModule,
    CopilotModelSelectComponent,
    PlusSvgComponent,
  ],
})
export class XpertWorkflowNodeKnowledgeBaseComponent extends WorkflowBaseNodeComponent {
  // States
  readonly kbEntity = computed(() => this.entity() as IWFNKnowledgeBase)
  readonly copilotModel = computed(() => this.kbEntity()?.copilotModel)
}
