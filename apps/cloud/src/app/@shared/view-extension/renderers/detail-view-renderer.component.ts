import { CommonModule } from '@angular/common'
import { Component, computed, input } from '@angular/core'
import { XpertDetailViewSchema } from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { ZardCardImports } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'xp-detail-view-renderer',
  imports: [CommonModule, TranslateModule, NgmI18nPipe, ...ZardCardImports],
  template: `
    <div class="p-4">
      <z-card class="gap-0 rounded-lg border border-divider-regular bg-components-card-bg py-0 shadow-none">
        <z-card-content class="p-0">
          @for (field of schema().fields; track field.key) {
            <div
              class="flex items-start justify-between gap-4 border-b border-divider-subtle px-4 py-3 last:border-b-0"
            >
              <div class="text-sm text-text-secondary">{{ field.label | i18n }}</div>
              <div class="max-w-[60%] text-right text-sm text-text-primary">
                @if (field.dataType === 'datetime' && value(field.key); as datetimeValue) {
                  {{ datetimeValue | date: 'medium' }}
                } @else {
                  {{ value(field.key) ?? '-' }}
                }
              </div>
            </div>
          }
        </z-card-content>
      </z-card>
    </div>
  `
})
export class DetailViewRendererComponent {
  readonly schema = input.required<XpertDetailViewSchema>()
  readonly item = input<unknown>(null)

  readonly values = computed(() => {
    const item = this.item()
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null
    }

    return item
  })

  value(key: string) {
    const values = this.values()
    if (!values || !(key in values)) {
      return null
    }

    return Reflect.get(values, key)
  }
}
