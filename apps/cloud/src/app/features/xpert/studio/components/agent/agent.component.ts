import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { FFlowModule } from '@foblex/flow'
import { AiModelTypeEnum, TXpertTeamNode } from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { PlusSvgComponent } from '@metad/ocap-angular/common'
import { CopilotModelSelectComponent } from 'apps/cloud/src/app/@shared'
import { XpertStudioApiService } from '../../domain'

@Component({
  selector: 'xpert-studio-node-agent',
  templateUrl: './agent.component.html',
  styleUrls: ['./agent.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, PlusSvgComponent, EmojiAvatarComponent, CopilotModelSelectComponent],
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

  private get hostElement(): HTMLElement {
    return this.elementRef.nativeElement
  }

  protected emitSelectionChangeEvent(event: MouseEvent): void {
    this.hostElement.focus()
    event.preventDefault()
  }
}
