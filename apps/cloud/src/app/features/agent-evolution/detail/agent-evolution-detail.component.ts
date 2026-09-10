import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject } from '@angular/core'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
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
  private readonly router = inject(Router)
  readonly kind = this.#route.snapshot.data['kind'] as DetailKind
  readonly resourceId = this.#route.snapshot.paramMap.get('resourceId') ?? ''
  constructor() {
    effect(() => {
      const record = this.facade.lifecycleRecords().find((item) => item.id === this.resourceId)
      if (this.kind === 'candidate' && record) {
        void this.router.navigate(['/agent-evolution/evaluation'], {
          queryParams: { changeId: record.id },
          replaceUrl: true
        })
      }
    })
  }
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
