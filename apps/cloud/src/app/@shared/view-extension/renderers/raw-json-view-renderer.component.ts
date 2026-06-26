import { Component, computed, input } from '@angular/core'
import { XpertRawJsonViewSchema } from '@xpert-ai/contracts'
import { ZardCardImports } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'xp-raw-json-view-renderer',
  imports: [...ZardCardImports],
  template: `
    <div class="p-4">
      <z-card class="gap-0 rounded-lg border border-divider-regular bg-components-card-bg py-0 shadow-none">
        <z-card-content class="p-0">
          <pre class="max-h-full overflow-auto p-4 text-xs leading-6 text-text-primary">{{ formatted() }}</pre>
        </z-card-content>
      </z-card>
    </div>
  `
})
export class RawJsonViewRendererComponent {
  readonly schema = input.required<XpertRawJsonViewSchema>()
  readonly payload = input<unknown>(null)

  readonly formatted = computed(() => JSON.stringify(this.payload() ?? null, null, 2))
}
