import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { getAgentMiddlewareNodes, injectXpertAgentAPI, IWFNMiddleware } from '@cloud/app/@core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { attrModel, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IconComponent } from '@cloud/app/@shared/avatar'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioPanelAgentComponent } from '../agent.component'

@Component({
  selector: 'xpert-studio-panel-middleware-section',
  templateUrl: './middleware.component.html',
  styleUrls: ['./middleware.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule, CdkMenuModule, MatTooltipModule, DragDropModule, IconComponent, NgmI18nPipe]
})
export class XpertStudioPanelMiddlewareSectionComponent {
  readonly elementRef = inject(ElementRef)
  readonly studioService = inject(XpertStudioApiService)
  readonly agentComponent = inject(XpertStudioPanelAgentComponent)
  readonly agentAPI = injectXpertAgentAPI()

  readonly key = input<string>()

  readonly draft = this.studioService.viewModel

  readonly middlewareNodes = computed(() => {
    const key = this.key()
    const graph = this.draft()
    return getAgentMiddlewareNodes(graph, key)
  })
  readonly agentOptions = this.agentComponent.agentOptions
  readonly middlewareOptions = attrModel(this.agentOptions, 'middlewares')
  readonly middlewareOrder = attrModel(this.middlewareOptions, 'order')

  readonly middlewareStrategies = toSignal(this.agentAPI.agentMiddlewares$)
  readonly middlewares = computed(() => {
    const order = this.middlewareOrder() ?? []
    const nodes = this.middlewareNodes() ?? []
    const middlewares = order.map((key) => nodes.find((node) => node.key === key)).filter((node) => !!node)
    middlewares.push(...nodes.filter((node) => !order.includes(node.key)))
    return middlewares.map((node) => ({
      node,
      strategy: this.middlewareStrategies()?.find(
        (strategy) => strategy.meta.name === (node.entity as IWFNMiddleware).provider
      )
    }))
  })

  // constructor() {
  //   effect(() => {
  //     console.log('Middleware nodes:', this.middlewareNodes())
  //   })
  // }

  drop(event: CdkDragDrop<unknown>) {
    const items = [...this.middlewares()]
    moveItemInArray(items, event.previousIndex, event.currentIndex)
    this.middlewareOrder.set(items.map((item) => item.node.key))
  }
}
