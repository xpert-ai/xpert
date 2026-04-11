import { CommonModule } from '@angular/common'
import { Component, effect, input, output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { XpertTableViewSchema, XpertViewActionDefinition } from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'

@Component({
  standalone: true,
  selector: 'xp-table-view-renderer',
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

      <div class="overflow-auto rounded-2xl border border-divider-regular bg-components-card-bg">
        <table class="min-w-full divide-y divide-divider-subtle text-sm">
          <thead>
            <tr class="text-left text-text-tertiary">
              @for (column of schema().columns; track column.key) {
                <th class="px-4 py-3 font-medium">
                  <button
                    type="button"
                    class="inline-flex items-center gap-1"
                    [disabled]="!column.sortable"
                    (click)="toggleSort(column.key)"
                  >
                    <span>{{ column.label | i18n }}</span>
                    @if (column.sortable) {
                      <i class="ri-expand-up-down-line text-xs"></i>
                    }
                  </button>
                </th>
              }
              @if (rowActions().length) {
                <th class="px-4 py-3 text-right font-medium">{{ 'PAC.KEY_WORDS.Action' | translate: { Default: 'Action' } }}</th>
              }
            </tr>
          </thead>

          <tbody class="divide-y divide-divider-subtle">
            @if (loading()) {
              <tr>
                <td class="px-4 py-6 text-text-tertiary" [attr.colspan]="schema().columns.length + (rowActions().length ? 1 : 0)">
                  {{ 'PAC.KEY_WORDS.Loading' | translate: { Default: 'Loading...' } }}
                </td>
              </tr>
            } @else if (!items().length) {
              <tr>
                <td class="px-4 py-6 text-text-tertiary" [attr.colspan]="schema().columns.length + (rowActions().length ? 1 : 0)">
                  {{ 'PAC.ViewExtension.NoData' | translate: { Default: 'No data' } }}
                </td>
              </tr>
            } @else {
              @for (item of items(); track trackRow(item)) {
                <tr>
                  @for (column of schema().columns; track column.key) {
                    <td class="px-4 py-3 text-text-primary">{{ cellValue(item, column.key) }}</td>
                  }
                  @if (rowActions().length) {
                    <td class="px-4 py-3">
                      <div class="flex justify-end gap-2">
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
                    </td>
                  }
                </tr>
              }
            }
          </tbody>
        </table>
      </div>

      @if (schema().pagination?.enabled) {
        <div class="flex items-center justify-between gap-3 text-sm text-text-secondary">
          <div>{{ 'PAC.ViewExtension.Total' | translate: { Default: 'Total' } }}: {{ total() }}</div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-full border border-divider-regular px-3 py-1.5 hover:bg-hover-bg disabled:opacity-50"
              [disabled]="page() <= 1"
              (click)="changePage.emit(page() - 1)"
            >
              {{ 'PAC.KEY_WORDS.Previous' | translate: { Default: 'Previous' } }}
            </button>
            <span>{{ page() }}</span>
            <button
              type="button"
              class="rounded-full border border-divider-regular px-3 py-1.5 hover:bg-hover-bg disabled:opacity-50"
              [disabled]="page() * pageSize() >= total()"
              (click)="changePage.emit(page() + 1)"
            >
              {{ 'PAC.KEY_WORDS.Next' | translate: { Default: 'Next' } }}
            </button>
          </div>
        </div>
      }
    </div>
  `
})
export class TableViewRendererComponent {
  readonly schema = input.required<XpertTableViewSchema>()
  readonly items = input<unknown[]>([])
  readonly total = input<number>(0)
  readonly loading = input<boolean>(false)
  readonly page = input<number>(1)
  readonly pageSize = input<number>(10)
  readonly search = input<string>('')
  readonly sortBy = input<string | null>(null)
  readonly sortDirection = input<'asc' | 'desc' | null>(null)
  readonly rowActions = input<XpertViewActionDefinition[]>([])

  readonly applySearch = output<string>()
  readonly changePage = output<number>()
  readonly changeSort = output<{ sortBy: string; sortDirection: 'asc' | 'desc' }>()
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

  cellValue(item: unknown, key: string) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !(key in item)) {
      return '-'
    }

    const value = Reflect.get(item, key)
    if (value === null || value === undefined || value === '') {
      return '-'
    }

    return String(value)
  }

  toggleSort(columnKey: string) {
    if (this.sortBy() !== columnKey) {
      this.changeSort.emit({ sortBy: columnKey, sortDirection: 'asc' })
      return
    }

    this.changeSort.emit({
      sortBy: columnKey,
      sortDirection: this.sortDirection() === 'asc' ? 'desc' : 'asc'
    })
  }
}
