import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { IWFNJSONStringify } from '@cloud/app/@core'
import { WorkflowBaseNodeComponent } from '../workflow-base.component'

@Component({
  selector: 'xp-workflow-node-json-stringify',
  templateUrl: './json-stringify.component.html',
  styleUrls: ['./json-stringify.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FFlowModule, MatTooltipModule, TranslateModule, PlusSvgComponent],
  host: {
    tabindex: '-1'
  }
})
export class XpertWorkflowNodeJSONStringifyComponent extends WorkflowBaseNodeComponent {
  // States
  
  readonly jsonStringifyNode = computed(() => this.node()?.entity as IWFNJSONStringify)
  readonly inputVariable = computed(() => this.jsonStringifyNode()?.inputVariable)
}
