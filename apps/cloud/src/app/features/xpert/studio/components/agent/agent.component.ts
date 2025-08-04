import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { agentLabel, agentUniqueName, AiModelTypeEnum, TXpertTeamNode, WorkflowNodeTypeEnum } from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { CopilotModelSelectComponent } from 'apps/cloud/src/app/@shared/copilot'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioComponent } from '../../studio.component'
import { XpertNodeErrorHandlingComponent } from '../error-handling/error.component'

@Component({
  selector: 'xpert-studio-node-agent',
  templateUrl: './agent.component.html',
  styleUrls: ['./agent.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FFlowModule,
    MatTooltipModule,
    TranslateModule,
    PlusSvgComponent,
    EmojiAvatarComponent,
    CopilotModelSelectComponent,
    XpertNodeErrorHandlingComponent
  ],
})
export class XpertStudioNodeAgentComponent {
  eModelType = AiModelTypeEnum
  readonly elementRef = inject(ElementRef)
  readonly studioService = inject(XpertStudioApiService)
  readonly studioComponent = inject(XpertStudioComponent)

  // Inputs
  readonly node = input<TXpertTeamNode & { type: 'agent' }>()
  readonly isRoot = input<boolean>(false)
  readonly startNodes = input<string[]>()

  // States
  readonly xpertAgent = computed(() => this.node().entity)
  readonly key = computed(() => this.node().key)
  readonly isStart = computed(() => !this.isRoot() && this.startNodes()?.includes(this.key()))

  readonly toolsets = computed(() => this.xpertAgent()?.toolsets)

  readonly xperts = this.studioComponent.xperts
  readonly xpert = computed(() => {
    if (this.node()?.parentId) {
      return this.xperts()?.find((_) => _.key === this.node()?.parentId)?.entity
    }
    return this.studioService.viewModel()?.team
  })

  readonly xpertCopilotModel = computed(() => this.xpert()?.copilotModel)
  readonly copilotModel = computed(() => this.xpertAgent()?.copilotModel)
  readonly agentConfig = computed(() => this.xpert()?.agentConfig)

  readonly agentUniqueName = computed(() => agentUniqueName(this.xpertAgent()))
  readonly agentLabel = computed(() => agentLabel(this.xpertAgent()))
  readonly isSensitive = computed(() => this.agentConfig()?.interruptBefore?.includes(this.agentUniqueName()))
  readonly isEnd = computed(() => this.agentConfig()?.endNodes?.includes(this.agentUniqueName()))
  readonly isDisableOutput = computed(() => this.agentConfig()?.mute?.some((_) => _.length === 1 && _[0] === this.key()))
  // Options
  readonly options = computed(() => this.xpertAgent()?.options)
  readonly retry = computed(() => this.options()?.retry)
  readonly fallback = computed(() => this.options()?.fallback)
  readonly fallbackModel = computed(() => this.fallback()?.copilotModel)
  readonly errorHandling = computed(() => this.options()?.errorHandling)

  readonly nodes = computed(() => this.studioService.viewModel().nodes)

  readonly canBeConnectedInputs = computed(() =>
    this.nodes()
      .filter((_) => !(_.type === 'workflow' && _.entity.type !== WorkflowNodeTypeEnum.AGENT_TOOL))
      .map((_) => _.key)
  )

  private get hostElement(): HTMLElement {
    return this.elementRef.nativeElement
  }

  constructor() {
    effect(() => {
      // console.log(this.errorHandling())
    })
  }

  protected emitSelectionChangeEvent(event: MouseEvent): void {
    this.hostElement.focus()
    // event.preventDefault()
    // event.stopPropagation()
  }
}
