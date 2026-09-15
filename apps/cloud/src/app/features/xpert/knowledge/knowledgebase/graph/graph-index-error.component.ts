import { Component, computed, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  selector: 'xp-graph-index-error',
  imports: [TranslateModule],
  template: `
    <div role="alert" class="mt-3 min-w-0 text-sm">
      <p class="text-text-danger">
        {{ summaryKey() | translate }}
      </p>
      <details class="mt-2 text-text-secondary">
        <summary class="w-fit cursor-pointer">{{ 'XP.Knowledgebase.GraphErrorDetails' | translate }}</summary>
        <pre
          class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded border border-border p-3 text-xs"
          >{{ details() }}</pre
        >
        @if (truncated()) {
          <p class="mt-1 text-xs">{{ 'XP.Knowledgebase.GraphErrorTruncated' | translate }}</p>
        }
      </details>
    </div>
  `
})
export class KnowledgeGraphIndexErrorComponent {
  readonly error = input.required<string>()
  readonly summaryKey = computed(() =>
    this.error().includes('OUTPUT_PARSING_FAILURE')
      ? 'XP.Knowledgebase.GraphIndexOutputInvalidHelp'
      : 'XP.Knowledgebase.GraphIndexFailedHelp'
  )
  readonly details = computed(() => this.error().slice(0, 4000))
  readonly truncated = computed(() => this.error().length > 4000)
}
