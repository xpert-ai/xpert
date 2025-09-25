import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { nonNullable } from '@metad/copilot'
import { TranslateModule } from '@ngx-translate/core'
import { TXpertAgentOptions, TXpertTeamNode } from 'apps/cloud/src/app/@core'
import { KnowledgeRecallParamsComponent } from 'apps/cloud/src/app/@shared/knowledge'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioPanelAgentComponent } from '../agent.component'

@Component({
  selector: 'xpert-studio-panel-knowledge-section',
  templateUrl: './knowledge.component.html',
  styleUrls: ['./knowledge.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule, CdkMenuModule, KnowledgeRecallParamsComponent]
})
export class XpertStudioPanelKnowledgeSectionComponent {
  readonly elementRef = inject(ElementRef)
  readonly apiService = inject(XpertStudioApiService)
  readonly agentComponent = inject(XpertStudioPanelAgentComponent)

  readonly key = input<string>()

  readonly knowledgebases = computed(() => {
    const draft = this.apiService.viewModel()
    return draft.connections
      .filter((conn) => conn.from === this.key())
      .map(
        (conn) =>
          draft.nodes.find((n) => n.type === 'knowledge' && n.key === conn.to) as TXpertTeamNode & { type: 'knowledge' }
      )
      .filter(nonNullable)
  })

  readonly recall = computed(() => this.agentComponent.xpertAgent()?.options?.recall)

  remove(knowledge: TXpertTeamNode) {
    // Remove connection
    this.apiService.removeConnection(this.key(), knowledge.key)
  }

  updateRecall(value: Partial<TXpertAgentOptions['recall']>) {
    const recall = this.recall() ?? {}
    this.agentComponent.updateOptions({ recall: { ...recall, ...value } })
  }
}
