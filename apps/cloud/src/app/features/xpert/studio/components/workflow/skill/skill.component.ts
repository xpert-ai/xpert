import { ChangeDetectionStrategy, Component, computed } from '@angular/core'
import { FFlowModule } from '@foblex/flow'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { IWFNSkill } from 'apps/cloud/src/app/@core'
import { NgxFloatUiModule } from 'ngx-float-ui'
import { NgxJsonViewerModule } from 'ngx-json-viewer'
import { WorkflowBaseNodeComponent } from '../workflow-base.component'
import { isEqual } from 'lodash-es'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  selector: 'xpert-workflow-node-skill',
  templateUrl: './skill.component.html',
  styleUrls: ['./skill.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FFlowModule,
    ...ZardTooltipImports,
    TranslateModule,
    NgxFloatUiModule,
    NgmSpinComponent,
    NgxJsonViewerModule
  ]
})
export class XpertWorkflowNodeSkillComponent extends WorkflowBaseNodeComponent {
  // States
  readonly skillEntity = computed(() => this.entity() as IWFNSkill)
  readonly key = computed(() => this.node()?.key)

  // Who call me
  readonly parentAgents = computed(
    () => {
      const parentKeys = this.connections()
        .filter((conn) => conn.to === this.key())
        .map((conn) => conn.from)
      return this.nodes()
        .filter((node) => parentKeys.includes(node.key) && node.type === 'agent')
        .map((node) => node.key)
    },
    { equal: isEqual }
  )
  // Agents who are not parents can be connected from this task
  readonly canBeConnectedInputs = computed(() =>
    this.nodes()
      .filter((_) => _.type === 'agent' && !this.parentAgents().includes(_.key))
      .map((_) => _.key)
  )
}
