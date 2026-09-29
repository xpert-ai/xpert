import { Component, effect, inject, input, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import type { EvolutionBaselineInspection } from '@xpert-ai/contracts'
import { ScopeService } from '@cloud/app/@core'
import { AgentEvolutionApiService } from '../agent-evolution-api.service'

@Component({
  selector: 'xp-evolution-baseline-panel',
  imports: [TranslateModule],
  template: `
    <section class="min-w-0" aria-labelledby="baseline-heading">
      <h3 id="baseline-heading" class="border-b border-divider-subtle pb-3 text-lg font-semibold">
        {{ 'XP.AgentEvolution.RuleBaseline' | translate }}
      </h3>
      @if (loading()) {
        <p role="status" class="py-4 text-sm text-text-secondary">{{ 'XP.Common.Loading' | translate }}</p>
      } @else if (error()) {
        <p role="status" class="py-4 text-sm text-text-secondary">
          {{ 'XP.AgentEvolution.RuleBaselineUnavailable' | translate }}
        </p>
      } @else if (data(); as state) {
        <div class="space-y-4 py-4">
          <p class="text-sm text-text-secondary">{{ 'XP.AgentEvolution.RuleBaselineReadOnly' | translate }}</p>
          @if (state.current; as current) {
            <dl class="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt class="text-text-secondary">{{ 'XP.AgentEvolution.RuleBaselineVersion' | translate }}</dt>
                <dd class="break-all">{{ current.version.versionId }}</dd>
              </div>
              <div>
                <dt class="text-text-secondary">{{ 'XP.AgentEvolution.RuleBaselineRevision' | translate }}</dt>
                <dd>{{ current.pointer.revision }}</dd>
              </div>
              <div>
                <dt class="text-text-secondary">{{ 'XP.AgentEvolution.RuleBaselineUpdated' | translate }}</dt>
                <dd>{{ current.pointer.updatedAt }}</dd>
              </div>
              <div>
                <dt class="text-text-secondary">{{ 'XP.AgentEvolution.RuleBaselineHash' | translate }}</dt>
                <dd class="break-all font-mono text-xs">{{ current.version.artifact.hash }}</dd>
              </div>
            </dl>
            <details open>
              <summary class="cursor-pointer text-sm font-medium">
                {{ 'XP.AgentEvolution.RuleBaselineCurrent' | translate }}
              </summary>
              <pre
                class="mt-2 max-h-96 overflow-auto rounded-lg bg-background-default-subtle p-4 text-xs text-text-secondary"
                >{{ current.contentJson }}</pre
              >
            </details>
          } @else {
            <p>{{ 'XP.AgentEvolution.RuleBaselineMissing' | translate }}</p>
          }
          <details>
            <summary class="cursor-pointer text-sm font-medium">
              {{ 'XP.AgentEvolution.RuleBaselineSource' | translate }}
            </summary>
            <pre
              class="mt-2 max-h-96 overflow-auto rounded-lg bg-background-default-subtle p-4 text-xs text-text-secondary"
              >{{ state.preview.contentJson }}</pre
            >
          </details>
        </div>
      }
    </section>
  `
})
export class EvolutionBaselinePanelComponent {
  readonly targetId = input.required<string>()
  readonly data = signal<EvolutionBaselineInspection | null>(null)
  readonly loading = signal(true)
  readonly error = signal(false)
  readonly #api = inject(AgentEvolutionApiService)
  readonly #scope = inject(ScopeService)
  #request = 0

  constructor() {
    effect((onCleanup) => {
      this.#scope.activeScope()
      const request = ++this.#request
      this.data.set(null)
      this.loading.set(true)
      this.error.set(false)
      let active = true
      onCleanup(() => {
        active = false
      })
      void firstValueFrom(this.#api.getRuleBaseline(this.targetId()))
        .then((data) => {
          if (active && request === this.#request) this.data.set(data)
        })
        .catch(() => {
          if (active && request === this.#request) this.error.set(true)
        })
        .finally(() => {
          if (active && request === this.#request) this.loading.set(false)
        })
    })
  }
}
