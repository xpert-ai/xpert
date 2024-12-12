import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input } from '@angular/core'
import { FFlowModule } from '@foblex/flow'
import { agentUniqueName, AiModelTypeEnum, TXpertTeamNode } from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { PlusSvgComponent } from '@metad/ocap-angular/common'
import { XpertStudioApiService } from '../../domain'
import { CopilotModelSelectComponent } from 'apps/cloud/src/app/@shared/copilot'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  selector: 'xpert-studio-node-agent',
  templateUrl: './agent.component.html',
  styleUrls: ['./agent.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, MatTooltipModule, TranslateModule, PlusSvgComponent, EmojiAvatarComponent, CopilotModelSelectComponent],
  host: {
    tabindex: '-1',
    '[class.selected]': 'isSelected',
    '(contextmenu)': 'emitSelectionChangeEvent($event)'
  }
})
export class XpertStudioNodeAgentComponent {
  eModelType = AiModelTypeEnum
  readonly elementRef = inject(ElementRef)
  readonly apiService = inject(XpertStudioApiService)

  readonly node = input<TXpertTeamNode & {type: 'agent'}>()
  readonly isRoot = input<boolean>(false)
  readonly xpertAgent = computed(() => this.node().entity)
  
  readonly toolsets = computed(() => this.xpertAgent()?.toolsets)
  
  readonly xpert = computed(() => this.apiService.viewModel()?.team)
  readonly xpertCopilotModel = computed(() => this.xpert()?.copilotModel)
  readonly copilotModel = computed(() => this.xpertAgent()?.copilotModel)
  readonly agentConfig = computed(() => this.xpert()?.agentConfig)

  readonly agentUniqueName = computed(() => agentUniqueName(this.xpertAgent()))
  readonly isSensitive = computed(() => this.agentConfig()?.interruptBefore?.includes(this.agentUniqueName()))

  private get hostElement(): HTMLElement {
    return this.elementRef.nativeElement
  }

  constructor() {
    effect(() => {
      // console.log(`Agent node:`, this.node())
    })
  }

  protected emitSelectionChangeEvent(event: MouseEvent): void {
    this.hostElement.focus()
    event.preventDefault()
  }
}
