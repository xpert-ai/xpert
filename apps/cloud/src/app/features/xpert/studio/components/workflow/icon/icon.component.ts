import { CdkMenuModule } from '@angular/cdk/menu'
import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'
import { WorkflowNodeTypeEnum } from 'apps/cloud/src/app/@core'

@Component({
  selector: 'xpert-workflow-icon',
  templateUrl: './icon.component.html',
  styleUrls: ['./icon.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkMenuModule, MatTooltipModule, TranslateModule],
  host: {
    tabindex: '-1',
    '[class]': 'type()'
  }
})
export class XpertWorkflowIconComponent {
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly type = input<WorkflowNodeTypeEnum>()
}
