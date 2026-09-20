import { Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ZardBadgeComponent, ZardButtonComponent, ZardSearchInputComponent } from '@xpert-ai/headless-ui'
import type { EvolutionTargetDescriptor } from '@xpert-ai/contracts'
import { AgentEvolutionFacade } from '../agent-evolution.facade'

@Component({
  standalone: true,
  selector: 'xp-agent-evolution-targets',
  imports: [
    FormsModule,
    RouterLink,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardSearchInputComponent
  ],
  templateUrl: './targets.component.html',
  host: { class: 'block' }
})
export class AgentEvolutionTargetsComponent {
  readonly facade = inject(AgentEvolutionFacade)
  readonly query = signal('')
  readonly status = signal<EvolutionTargetDescriptor['status'] | 'all'>('all')
  readonly sort = signal<'displayName' | 'targetId'>('displayName')
  readonly statuses = ['active', 'disabled', 'provider_unavailable'] as const

  readonly rows = computed(() => {
    const query = this.query().trim().toLocaleLowerCase()
    const status = this.status()
    const sort = this.sort()
    const pointers = this.facade.dashboard().pointers.filter((pointer) => pointer.channel === 'production')
    return this.facade
      .contextTargets()
      .filter((target) => status === 'all' || target.status === status)
      .filter((target) =>
        [target.displayName, target.targetId, target.providerKey].some((value) =>
          value.toLocaleLowerCase().includes(query)
        )
      )
      .sort((left, right) => left[sort].localeCompare(right[sort]) || left.targetId.localeCompare(right.targetId))
      .map((target) => {
        const production = pointers.filter((pointer) => pointer.targetId === target.targetId)
        return {
          target,
          versions: [...new Set(production.map((pointer) => pointer.activeVersionId))],
          scopeCount: production.length
        }
      })
  })

  resetFilters() {
    this.query.set('')
    this.status.set('all')
    this.sort.set('displayName')
    this.facade.selectTarget('all')
  }
}
