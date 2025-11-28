import { ChangeDetectionStrategy, Component, computed } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FFlowModule } from '@foblex/flow'
import { TranslateModule } from '@ngx-translate/core'
import { isEqual } from 'lodash-es'
import { injectXpertAgentAPI, IWFNMiddleware } from 'apps/cloud/src/app/@core'
import { WorkflowBaseNodeComponent } from '../workflow-base.component'
import { toSignal } from '@angular/core/rxjs-interop'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { IconComponent } from '@cloud/app/@shared/avatar'

@Component({
  selector: 'xpert-workflow-node-middleware',
  templateUrl: './middleware.component.html',
  styleUrls: ['./middleware.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, MatTooltipModule, TranslateModule, NgmI18nPipe, IconComponent]
})
export class XpertWorkflowNodeMiddlewareComponent extends WorkflowBaseNodeComponent {
  
  readonly agentAPI = injectXpertAgentAPI()

  readonly key = computed(() => this.node()?.key)
  readonly middlewareEntity = computed(() => this.entity() as IWFNMiddleware)
  readonly provider = computed(() => this.middlewareEntity()?.provider)

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

  readonly canBeConnectedInputs = computed(() =>
    this.nodes()
      .filter((_) => _.type === 'agent' && !this.parentAgents().includes(_.key))
      .map((_) => _.key)
  )

  readonly agentMiddlewares = toSignal(this.agentAPI.agentMiddlewares$)

  readonly providerMeta = computed(() => this.agentMiddlewares()?.find((m) => m.meta.name === this.provider())?.meta)
  
}
