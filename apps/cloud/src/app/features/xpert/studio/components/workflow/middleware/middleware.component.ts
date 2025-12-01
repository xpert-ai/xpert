import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { toSignal } from '@angular/core/rxjs-interop'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { FFlowModule } from '@foblex/flow'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { IconComponent } from '@cloud/app/@shared/avatar'
import { isEqual } from 'lodash-es'
import { derivedAsync } from 'ngxtension/derived-async'
import { NgxJsonViewerModule } from 'ngx-json-viewer'
import { NgxFloatUiModule, NgxFloatUiTriggers } from 'ngx-float-ui'
import { injectXpertAgentAPI, IWFNMiddleware, XpertAgentExecutionStatusEnum } from 'apps/cloud/src/app/@core'
import { WorkflowBaseNodeComponent } from '../workflow-base.component'
import { XpertExecutionService } from '../../../services/execution.service'

@Component({
  selector: 'xpert-workflow-node-middleware',
  templateUrl: './middleware.component.html',
  styleUrls: ['./middleware.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, MatTooltipModule, TranslateModule, NgxFloatUiModule, NgxJsonViewerModule, NgmI18nPipe, NgmSpinComponent, IconComponent]
})
export class XpertWorkflowNodeMiddlewareComponent extends WorkflowBaseNodeComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eNgxFloatUiTriggers = NgxFloatUiTriggers
  
  readonly agentAPI = injectXpertAgentAPI()
  readonly executionService = inject(XpertExecutionService)

  readonly key = computed(() => this.node()?.key)
  readonly middlewareEntity = computed(() => this.entity() as IWFNMiddleware)
  readonly description = computed(() => this.middlewareEntity()?.description)
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
  readonly #tools = derivedAsync(() => {
    const provider = this.provider()
    if (provider) {
      return this.agentAPI.getAgentMiddlewareTools(provider, this.middlewareEntity()?.options ?? {})
    }
    return null
  })

  readonly toolMessages = computed(() => this.executionService.toolMessages(), {equal: isEqual})
  readonly tools = computed(() => {
    const tools = this.#tools()
    const executions = this.toolMessages()
    return tools?.map((tool) => ({
      ...tool,
      executions: executions?.map((_) => _.data).filter((e) => e.toolset === this.provider() && e.tool === tool.name),
    }))
  })


  // constructor() {
  //   super()
    
  //   effect(() => {
  //     console.log(this.tools(), this.executionService.toolMessages())
  //   })
  // }
}
