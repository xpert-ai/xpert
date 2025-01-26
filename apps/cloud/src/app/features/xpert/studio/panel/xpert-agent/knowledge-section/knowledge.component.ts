import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { nonNullable } from '@metad/copilot'
import { TranslateModule } from '@ngx-translate/core'
import { TXpertTeamNode } from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'

@Component({
  selector: 'xpert-studio-panel-knowledge-section',
  templateUrl: './knowledge.component.html',
  styleUrls: ['./knowledge.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule],
})
export class XpertStudioPanelKnowledgeSectionComponent {
  readonly elementRef = inject(ElementRef)
  readonly apiService = inject(XpertStudioApiService)

  readonly key = input<string>()

  readonly knowledgebases = computed(() => {
    const draft = this.apiService.viewModel()
    return draft.connections
      .filter((conn) => conn.from === this.key())
      .map((conn) => draft.nodes.find((n) => n.type === 'knowledge' && n.key === conn.to) as TXpertTeamNode & {type: 'knowledge'})
      .filter(nonNullable)
  })

  remove(knowledge: TXpertTeamNode) {
    // Remove connection by simulate a drop event
    this.apiService.createConnection(this.key(), null, knowledge.key)
  }
}
