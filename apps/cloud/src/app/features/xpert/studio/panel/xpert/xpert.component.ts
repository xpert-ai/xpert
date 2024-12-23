import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { AiModelTypeEnum, IXpert, TXpertTeamNode } from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { XpertStudioPanelComponent } from '../panel.component'
import { CloseSvgComponent } from '@metad/ocap-angular/common'
import { CopilotModelSelectComponent } from 'apps/cloud/src/app/@shared/copilot'

@Component({
  selector: 'xpert-studio-panel-xpert',
  templateUrl: './xpert.component.html',
  styleUrls: ['./xpert.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CloseSvgComponent, EmojiAvatarComponent, CopilotModelSelectComponent],
  host: {
    tabindex: '-1',
  }
})
export class XpertStudioPanelXpertComponent {
  eModelType = AiModelTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly panelComponent = inject(XpertStudioPanelComponent)

  readonly node = input<TXpertTeamNode>()
  readonly xpert = computed(() => this.node().entity as IXpert)

  readonly copilotModel = computed(() => this.xpert()?.copilotModel)

  closePanel() {
    this.panelComponent.close()
  }
}
