import { Component, computed, input } from '@angular/core'
import { XpertRawJsonViewSchema } from '@xpert-ai/contracts'

@Component({
  standalone: true,
  selector: 'xp-raw-json-view-renderer',
  template: `
    <pre class="overflow-auto rounded-2xl border border-divider-regular bg-components-card-bg p-4 text-xs leading-6 text-text-primary">{{ formatted() }}</pre>
  `
})
export class RawJsonViewRendererComponent {
  readonly schema = input.required<XpertRawJsonViewSchema>()
  readonly payload = input<unknown>(null)

  readonly formatted = computed(() => JSON.stringify(this.payload() ?? null, null, 2))
}
