import { Component, computed, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute } from '@angular/router'
import { AgentEvolutionReleaseComponent } from './release.component'
import { DeploymentHistoryComponent } from './deployment-history.component'

@Component({
  imports: [DeploymentHistoryComponent, AgentEvolutionReleaseComponent],
  template: `@if (stage()) {
      <xp-deployment-history />
    } @else {
      <xp-agent-evolution-release />
    }`,
  host: { class: 'flex min-h-0 min-w-0 flex-1 overflow-hidden' }
})
export class EvolutionReleasePageComponent {
  private readonly route = inject(ActivatedRoute)
  private readonly params = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap })
  readonly stage = computed(() => this.params().get('view') === 'observations' && this.params().has('stage'))
}
