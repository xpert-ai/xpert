import { Component, computed, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  selector: 'xp-graph-properties',
  imports: [TranslateModule],
  template: `
    @if (entries().length) {
      <details class="mt-4 text-sm" open>
        <summary class="cursor-pointer font-medium">{{ 'XP.Knowledgebase.GraphProperties' | translate }}</summary>
        <dl class="mt-2 max-h-72 space-y-2 overflow-auto">
          @for (entry of entries(); track entry.key) {
            <div
              class="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2 border-b border-components-panel-border pb-2"
            >
              <dt class="break-words text-text-tertiary">{{ entry.key }}</dt>
              <dd class="whitespace-pre-wrap break-all text-text-secondary">{{ entry.value }}</dd>
            </div>
          }
        </dl>
      </details>
    }
  `
})
export class KnowledgeGraphPropertiesComponent {
  readonly properties = input<unknown>()
  readonly entries = computed(() => {
    const value = this.properties()
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    return Object.entries(value).map(([key, value]) => ({
      key,
      value: value === null ? '—' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
    }))
  })
}
