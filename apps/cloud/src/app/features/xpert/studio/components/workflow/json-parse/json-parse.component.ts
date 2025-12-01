import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { WorkflowBaseNodeComponent } from '../workflow-base.component'
import { IWFNJSONParse } from '@metad/contracts'

@Component({
  selector: 'xp-workflow-node-json-parse',
  templateUrl: './json-parse.component.html',
  styleUrls: ['./json-parse.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FFlowModule, MatTooltipModule, TranslateModule, PlusSvgComponent],
  host: {
    tabindex: '-1'
  }
})
export class XpertWorkflowNodeJSONParseComponent extends WorkflowBaseNodeComponent {
  // States
  readonly jsonParseNode = computed(() => this.node()?.entity as IWFNJSONParse)
  readonly inputVariable = computed(() => this.jsonParseNode()?.inputVariable)
}
