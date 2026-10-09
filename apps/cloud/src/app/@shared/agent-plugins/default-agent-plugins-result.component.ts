import { Component, computed, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import type { DefaultAgentPluginsImportResult } from '@xpert-ai/contracts'

@Component({
  standalone: true,
  selector: 'xp-default-agent-plugins-result',
  imports: [TranslateModule],
  template: `
    @if (result(); as result) {
      <div class="flex flex-col gap-2 text-sm" role="status">
        <p>{{ 'XP.AgentPlugins.DefaultImportSummary' | translate: counts() }}</p>
        <p class="text-text-secondary">{{ 'XP.AgentPlugins.DefaultImportNext' | translate }}</p>
        @for (item of result.items; track item.id) {
          @if (item.status === 'failed') {
            <p class="break-words text-text-destructive">{{ item.title || item.id }}: {{ item.error }}</p>
          } @else if (item.diagnosticCount) {
            <p class="text-text-warning">
              {{
                'XP.AgentPlugins.DefaultImportDiagnostics'
                  | translate: { title: item.title || item.id, count: item.diagnosticCount }
              }}
            </p>
          }
        }
      </div>
    }
  `
})
export class DefaultAgentPluginsResultComponent {
  readonly result = input<DefaultAgentPluginsImportResult | null>(null)
  readonly counts = computed(() => {
    const items = this.result()?.items ?? []
    return {
      imported: items.filter((item) => item.status === 'imported').length,
      existing: items.filter((item) => item.status === 'existing').length,
      failed: items.filter((item) => item.status === 'failed').length
    }
  })
}
