import { CommonModule } from '@angular/common'
import { Component, computed, input } from '@angular/core'
import { XpertStatsViewSchema } from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { ZardCardImports } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'xp-stats-view-renderer',
  imports: [CommonModule, TranslateModule, NgmI18nPipe, ...ZardCardImports],
  template: `
    <div class="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
      @for (item of schema().items; track item.key) {
        <z-card class="gap-0 rounded-lg border border-divider-regular bg-components-card-bg py-0 shadow-none">
          <z-card-content class="p-4">
            <div class="text-xs uppercase tracking-wide text-text-tertiary">{{ item.label | i18n }}</div>
            <div class="mt-2 text-xl font-semibold text-text-primary">
              @if (item.valueType === 'datetime' && value(item.key); as datetimeValue) {
                {{ datetimeValue | date: 'medium' }}
              } @else {
                {{ value(item.key) ?? '-' }}
              }
            </div>
          </z-card-content>
        </z-card>
      }
    </div>
  `
})
export class StatsViewRendererComponent {
  readonly schema = input.required<XpertStatsViewSchema>()
  readonly summary = input<unknown>(null)

  readonly values = computed(() => {
    const summary = this.summary()
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
      return null
    }

    return summary
  })

  value(key: string) {
    const values = this.values()
    if (!values || !(key in values)) {
      return null
    }

    return Reflect.get(values, key)
  }
}
