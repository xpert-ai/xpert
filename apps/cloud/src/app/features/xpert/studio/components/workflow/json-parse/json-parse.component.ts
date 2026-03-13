import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed } from '@angular/core'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { WorkflowBaseNodeComponent } from '../workflow-base.component'
import { IWFNJSONParse } from '@metad/contracts'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  selector: 'xp-workflow-node-json-parse',
  templateUrl: './json-parse.component.html',
  styleUrls: ['./json-parse.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FFlowModule, ...ZardTooltipImports, TranslateModule, PlusSvgComponent],
  host: {
    tabindex: '-1'
  }
})
export class XpertWorkflowNodeJSONParseComponent extends WorkflowBaseNodeComponent {
  // States
  readonly jsonParseNode = computed(() => this.node()?.entity as IWFNJSONParse)
  readonly inputVariable = computed(() => this.jsonParseNode()?.inputVariable)
}
