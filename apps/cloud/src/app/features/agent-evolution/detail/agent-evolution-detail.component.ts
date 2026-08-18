import { CommonModule } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { ActivatedRoute, RouterLink } from '@angular/router'
import { ZardBadgeComponent, ZardButtonComponent, ZardCardImports } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { AgentEvolutionFacade } from '../agent-evolution.facade'

type DetailKind = 'target' | 'candidate' | 'evaluation' | 'deployment'

@Component({
  standalone: true,
  selector: 'xp-agent-evolution-detail',
  imports: [CommonModule, RouterLink, TranslateModule, ZardBadgeComponent, ZardButtonComponent, ...ZardCardImports],
  templateUrl: './agent-evolution-detail.component.html',
  host: { class: 'block' }
})
export class AgentEvolutionDetailComponent {
  readonly #route = inject(ActivatedRoute)
  readonly facade = inject(AgentEvolutionFacade)
  readonly kind = this.#route.snapshot.data['kind'] as DetailKind
  readonly resourceId = this.#route.snapshot.paramMap.get('resourceId') ?? ''
  readonly item = computed(() => {
    const dashboard = this.facade.dashboard()
    if (this.kind === 'target') return dashboard.targets.find((item) => item.targetId === this.resourceId) ?? null
    if (this.kind === 'candidate') {
      return dashboard.candidates.find((item) => item.candidateId === this.resourceId) ?? null
    }
    if (this.kind === 'evaluation') return dashboard.evaluations.find((item) => item.runId === this.resourceId) ?? null
    return dashboard.deployments.find((item) => item.deploymentId === this.resourceId) ?? null
  })
}
