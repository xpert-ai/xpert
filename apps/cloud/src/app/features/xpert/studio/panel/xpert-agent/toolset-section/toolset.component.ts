
import { ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core'
import { TXpertTeamNode } from '@metad/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { EmojiAvatarComponent } from '../../../../../../@shared/avatar/'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioPanelAgentComponent } from '../agent.component'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  selector: 'xpert-studio-panel-toolset-section',
  templateUrl: './toolset.component.html',
  styleUrls: ['./toolset.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule, ...ZardTooltipImports, EmojiAvatarComponent]
})
export class XpertStudioPanelToolsetSectionComponent {
  readonly elementRef = inject(ElementRef)
  readonly apiService = inject(XpertStudioApiService)
  readonly agentComponent = inject(XpertStudioPanelAgentComponent)

  readonly key = input<string>()

  readonly toolsets = this.agentComponent.toolsets

  remove(node: TXpertTeamNode) {
    // Remove connection
    this.apiService.removeConnection(this.key(), node.key)
  }
}
