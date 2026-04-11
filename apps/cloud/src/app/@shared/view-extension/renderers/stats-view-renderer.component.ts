import { CommonModule } from '@angular/common'
import { Component, computed, input } from '@angular/core'
import { XpertStatsViewSchema } from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'

@Component({
  standalone: true,
  selector: 'xp-stats-view-renderer',
  imports: [CommonModule, TranslateModule, NgmI18nPipe],
  template: `
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      @for (item of schema().items; track item.key) {
        <div class="rounded-2xl border border-divider-regular bg-components-card-bg p-4">
          <div class="text-xs uppercase tracking-wide text-text-tertiary">{{ item.label | i18n }}</div>
          <div class="mt-2 text-xl font-semibold text-text-primary">
            @if (item.valueType === 'datetime' && value(item.key); as datetimeValue) {
              {{ datetimeValue | date: 'medium' }}
            } @else {
              {{ value(item.key) ?? '-' }}
            }
          </div>
        </div>
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
