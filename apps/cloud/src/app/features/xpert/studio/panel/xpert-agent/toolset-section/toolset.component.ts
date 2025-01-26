import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { TXpertTeamNode } from '@metad/contracts'
import { nonNullable } from '@metad/copilot'
import { TranslateModule } from '@ngx-translate/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { CommonModule } from '@angular/common'
import { XpertStudioApiService } from '../../../domain'
import { EmojiAvatarComponent } from "../../../../../../@shared/avatar/"


@Component({
  selector: 'xpert-studio-panel-toolset-section',
  templateUrl: './toolset.component.html',
  styleUrls: ['./toolset.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule, MatTooltipModule, EmojiAvatarComponent]
})
export class XpertStudioPanelToolsetSectionComponent {
  readonly elementRef = inject(ElementRef)
  readonly apiService = inject(XpertStudioApiService)

  readonly key = input<string>()

  readonly toolsets = computed(() => {
    const draft = this.apiService.viewModel()
    return draft.connections
      .filter((conn) => conn.from === this.key())
      .map((conn) => draft.nodes.find((n) => n.type === 'toolset' && n.key === conn.to) as TXpertTeamNode & {type: 'toolset'})
      .filter(nonNullable)
  })

  remove(node: TXpertTeamNode) {
    // Remove connection by simulate a drop event
    this.apiService.createConnection(this.key(), null, node.key)
  }
}
