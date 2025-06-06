import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, signal } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FFlowModule } from '@foblex/flow'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { TXpertTeamNode, XpertAgentExecutionStatusEnum, IXpertToolset, ToolTagEnum, getEnabledTools } from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { derivedAsync } from 'ngxtension/derived-async'
import { catchError, of } from 'rxjs'
import { XpertStudioApiService } from '../../domain'
import { XpertExecutionService } from '../../services/execution.service'
import { XpertStudioComponent } from '../../studio.component'
import { XpertStudioNodeStatus } from '../../types'

@Component({
  selector: 'xpert-studio-node-toolset',
  templateUrl: './toolset.component.html',
  styleUrls: ['./toolset.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, MatTooltipModule, TranslateModule, EmojiAvatarComponent, NgmSpinComponent],
  host: {
    tabindex: '-1',
    '[class]': 'status()'
  }
})
export class XpertStudioNodeToolsetComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum

  readonly elementRef = inject(ElementRef)
  readonly apiService = inject(XpertStudioApiService)
  readonly executionService = inject(XpertExecutionService)
  readonly xpertStudioComponent = inject(XpertStudioComponent)

  // Inputs
  readonly node = input<TXpertTeamNode>()

  // States
  readonly toolset = computed(() => this.node().entity as IXpertToolset)
  readonly positions = computed(() => this.toolset()?.options?.toolPositions)

  // Retrieve the latest information about the toolset
  readonly toolsetDetail = derivedAsync(() => {
    return this.toolset() ? this.apiService.getToolset(this.toolset().id).toolset$.pipe(catchError((err) => of(null))) : of(null)
  })

  readonly status = computed<XpertStudioNodeStatus>(() => this.toolset() && !this.toolsetDetail() ? 'template' : null)

  readonly availableTools = computed(() => getEnabledTools(this.toolsetDetail()))
  readonly xpert = this.xpertStudioComponent.xpert
  readonly agentConfig = computed(() => this.xpert()?.agentConfig)

  readonly toolExecutions = this.executionService.toolExecutions

  readonly tools = computed(() => {
    const tools = this.availableTools()
    const executions = this.toolExecutions()
    return tools?.map((tool) => ({
      tool,
      executions: Object.values(executions?.[tool.name] ?? {}).sort(
        (a, b) => a.createdAt?.getTime() - b.createdAt?.getTime()
      )
    }))
  })

  /**
   * At least one tool enabled
   */
  readonly atLeastOne = computed(() => this.toolsetDetail()?.tools?.some((t) => !t.disabled))
  readonly expandTools = signal(false)

  readonly isSandbox = computed(() => this.toolset()?.options?.provider?.tags?.includes(ToolTagEnum.SANDBOX))
  readonly needSandbox = computed(() => this.toolsetDetail()?.options?.needSandbox)

  // private get hostElement(): HTMLElement {
  //   return this.elementRef.nativeElement
  // }

  constructor() {
    effect(() => {
      // console.log(this.toolset())
    })
  }

  // protected emitSelectionChangeEvent(event: MouseEvent): void {
  //   this.hostElement.focus()
  //   event.preventDefault()
  //   event.stopPropagation()

  //   // Open Context menu
  // }

  isSensitive(name: string) {
    return this.agentConfig()?.interruptBefore?.includes(name)
  }

  isEnd(name: string) {
    return this.agentConfig()?.endNodes?.includes(name)
  }

  hasMemory(name: string) {
    return this.agentConfig()?.toolsMemory?.[name]
  }

  toggleExpandTools(event: Event) {
    event.stopPropagation()
    this.expandTools.update((state) => !state)
  }
}
