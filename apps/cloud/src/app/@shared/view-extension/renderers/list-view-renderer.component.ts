import { CommonModule } from '@angular/common'
import { Component, effect, input, output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { XpertListViewSchema, XpertViewActionDefinition } from '@metad/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { NgmI18nPipe } from '@metad/ocap-angular/core'

@Component({
  standalone: true,
  selector: 'xp-list-view-renderer',
  imports: [CommonModule, FormsModule, TranslateModule, NgmI18nPipe],
  template: `
    <div class="flex flex-col gap-3">
      @if (schema().search?.enabled) {
        <div class="flex items-center gap-2">
          <input
            class="flex-1 rounded-full border border-divider-regular bg-components-input-bg px-4 py-2 text-sm text-text-primary focus:outline-none"
            [(ngModel)]="searchText"
            [placeholder]="(schema().search?.placeholder | i18n) || ('PAC.ViewExtension.Search' | translate: { Default: 'Search' })"
            (keyup.enter)="applySearch.emit(searchText.trim())"
          />
          <button
            type="button"
            class="rounded-full border border-divider-regular px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-hover-bg"
            (click)="applySearch.emit(searchText.trim())"
          >
            {{ 'PAC.KEY_WORDS.Search' | translate: { Default: 'Search' } }}
          </button>
        </div>
      }

      <div class="rounded-2xl border border-divider-regular bg-components-card-bg">
        @if (loading()) {
          <div class="px-4 py-6 text-sm text-text-tertiary">{{ 'PAC.KEY_WORDS.Loading' | translate: { Default: 'Loading...' } }}</div>
        } @else if (!items().length) {
          <div class="px-4 py-6 text-sm text-text-tertiary">{{ 'PAC.ViewExtension.NoData' | translate: { Default: 'No data' } }}</div>
        } @else {
          @for (item of items(); track trackRow(item)) {
            <div class="flex items-start justify-between gap-3 border-b border-divider-subtle px-4 py-4 last:border-b-0">
              <div class="min-w-0">
                <div class="truncate font-medium text-text-primary">{{ getValue(item, schema().item.titleKey) }}</div>
                @if (schema().item.subtitleKey; as subtitleKey) {
                  <div class="truncate text-sm text-text-secondary">{{ getValue(item, subtitleKey) }}</div>
                }
                @if (schema().item.descriptionKey; as descriptionKey) {
                  <div class="mt-1 whitespace-pre-wrap text-sm text-text-tertiary">{{ getValue(item, descriptionKey) }}</div>
                }
              </div>

              @if (rowActions().length) {
                <div class="flex shrink-0 gap-2">
                  @for (action of rowActions(); track action.key) {
                    <button
                      type="button"
                      class="rounded-full border border-divider-regular px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-hover-bg"
                      (click)="runAction.emit({ action, targetId: trackRow(item) })"
                    >
                      {{ action.label | i18n }}
                    </button>
                  }
                </div>
              }
            </div>
          }
        }
      </div>

      @if (schema().pagination?.enabled && page() * pageSize() < total()) {
        <div class="flex justify-center">
          <button
            type="button"
            class="rounded-full border border-divider-regular px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-hover-bg"
            (click)="changePage.emit(page() + 1)"
          >
            {{ 'PAC.KEY_WORDS.LoadMore' | translate: { Default: 'Load more' } }}
          </button>
        </div>
      }
    </div>
  `
})
export class ListViewRendererComponent {
  readonly schema = input.required<XpertListViewSchema>()
  readonly items = input<unknown[]>([])
  readonly total = input<number>(0)
  readonly loading = input<boolean>(false)
  readonly page = input<number>(1)
  readonly pageSize = input<number>(10)
  readonly search = input<string>('')
  readonly rowActions = input<XpertViewActionDefinition[]>([])

  readonly applySearch = output<string>()
  readonly changePage = output<number>()
  readonly runAction = output<{ action: XpertViewActionDefinition; targetId?: string }>()

  searchText = ''

  constructor() {
    effect(() => {
      this.searchText = this.search()
    })
  }

  trackRow(item: unknown) {
    if (item && typeof item === 'object' && !Array.isArray(item) && 'id' in item) {
      const id = Reflect.get(item, 'id')
      return typeof id === 'string' ? id : JSON.stringify(item)
    }

    return JSON.stringify(item)
  }

  getValue(item: unknown, key: string) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !(key in item)) {
      return '-'
    }

    const value = Reflect.get(item, key)
    if (value === null || value === undefined || value === '') {
      return '-'
    }

    return String(value)
  }
}
