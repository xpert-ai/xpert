import { CdkMenuModule } from '@angular/cdk/menu'
import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { WorkflowNodeTypeEnum } from '@cloud/app/@core/types'
import { TranslateModule } from '@ngx-translate/core'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  selector: 'xpert-workflow-icon',
  templateUrl: './icon.component.html',
  styleUrls: ['./icon.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkMenuModule, ...ZardTooltipImports, TranslateModule],
  host: {
    tabindex: '-1',
    '[class]': 'type()'
  }
})
export class XpertWorkflowIconComponent {
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly type = input<WorkflowNodeTypeEnum | string>()
}
