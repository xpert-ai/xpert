import { CommonModule } from '@angular/common'
import { Component, effect, input, output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { XpertTableViewSchema, XpertViewActionDefinition } from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import {
  ZardButtonComponent,
  ZardCardImports,
  ZardEmptyComponent,
  ZardInputDirective,
  ZardLoaderComponent,
  ZardTableImports,
  type ZardTableSortDirection
} from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'xp-table-view-renderer',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    NgmI18nPipe,
    ZardButtonComponent,
    ...ZardCardImports,
    ZardEmptyComponent,
    ZardInputDirective,
    ZardLoaderComponent,
    ...ZardTableImports
  ],
  template: `
    <div class="flex flex-col gap-3 p-4">
      @if (schema().search?.enabled) {
        <div class="flex items-center gap-2">
          <input
            z-input
            zSize="sm"
            class="flex-1"
            [(ngModel)]="searchText"
            [placeholder]="
              (schema().search?.placeholder | i18n) || ('PAC.ViewExtension.Search' | translate: { Default: 'Search' })
            "
            (keyup.enter)="applySearch.emit(searchText.trim())"
          />
          <button z-button type="button" zType="default" zSize="sm" (click)="applySearch.emit(searchText.trim())">
            {{ 'PAC.KEY_WORDS.Search' | translate: { Default: 'Search' } }}
          </button>
        </div>
      }

      <z-card
        class="gap-0 overflow-hidden rounded-lg border border-divider-regular bg-components-card-bg py-0 shadow-none"
      >
        <z-card-content class="overflow-auto p-0">
          <table z-table zSize="compact" class="min-w-full text-sm">
            <thead z-table-header>
              <tr z-table-row class="text-left text-text-tertiary">
                @for (column of schema().columns; track column.key) {
                  <th z-table-head class="px-4 py-3 font-medium">
                    <button
                      z-table-sort-header
                      [zDisabled]="!column.sortable"
                      [zDisableClear]="true"
                      [zDirection]="sortDirectionFor(column.key)"
                      (zSortChange)="onSortChange(column.key, $event)"
                    >
                      {{ column.label | i18n }}
                    </button>
                  </th>
                }
                @if (rowActions().length) {
                  <th z-table-head class="px-4 py-3 text-right font-medium">
                    {{ 'PAC.KEY_WORDS.Action' | translate: { Default: 'Action' } }}
                  </th>
                }
              </tr>
            </thead>

            <tbody z-table-body>
              @if (loading()) {
                <tr z-table-row>
                  <td
                    z-table-cell
                    class="px-4 py-8"
                    [attr.colspan]="schema().columns.length + (rowActions().length ? 1 : 0)"
                  >
                    <div class="flex items-center gap-2 text-text-tertiary">
                      <z-loader zSize="sm" />
                      <span>{{ 'PAC.KEY_WORDS.Loading' | translate: { Default: 'Loading...' } }}</span>
                    </div>
                  </td>
                </tr>
              } @else if (!items().length) {
                <tr z-table-row>
                  <td
                    z-table-cell
                    class="px-4 py-8"
                    [attr.colspan]="schema().columns.length + (rowActions().length ? 1 : 0)"
                  >
                    <z-empty zIcon="inbox" [zTitle]="'PAC.ViewExtension.NoData' | translate: { Default: 'No data' }" />
                  </td>
                </tr>
              } @else {
                @for (item of items(); track trackRow(item)) {
                  <tr z-table-row>
                    @for (column of schema().columns; track column.key) {
                      <td z-table-cell class="px-4 py-3 text-text-primary">
                        @if (column.dataType === 'datetime' && cellDateValue(item, column.key); as datetimeValue) {
                          {{ datetimeValue | date: 'medium' }}
                        } @else {
                          {{ cellValue(item, column.key) }}
                        }
                      </td>
                    }
                    @if (rowActions().length) {
                      <td z-table-cell class="px-4 py-3">
                        <div class="flex justify-end gap-2">
                          @for (action of rowActions(); track action.key) {
                            <button
                              z-button
                              type="button"
                              zType="outline"
                              zSize="xs"
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
        </z-card-content>
      </z-card>

      @if (schema().pagination?.enabled) {
        <div class="flex items-center justify-between gap-3 text-sm text-text-secondary">
          <div>{{ 'PAC.ViewExtension.Total' | translate: { Default: 'Total' } }}: {{ total() }}</div>
          <div class="flex items-center gap-2">
            <button
              z-button
              type="button"
              zType="outline"
              zSize="sm"
              [zDisabled]="page() <= 1"
              (click)="changePage.emit(page() - 1)"
            >
              {{ 'PAC.KEY_WORDS.Previous' | translate: { Default: 'Previous' } }}
            </button>
            <span>{{ page() }}</span>
            <button
              z-button
              type="button"
              zType="outline"
              zSize="sm"
              [zDisabled]="page() * pageSize() >= total()"
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
    const value = this.rawCellValue(item, key)
    if (value === null) {
      return '-'
    }

    return String(value)
  }

  cellDateValue(item: unknown, key: string): Date | null {
    const value = this.rawCellValue(item, key)
    if (value === null) {
      return null
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value
    }

    if (typeof value === 'number' || typeof value === 'string') {
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? null : date
    }

    return null
  }

  private rawCellValue(item: unknown, key: string): unknown | null {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !(key in item)) {
      return null
    }

    const value = Reflect.get(item, key)
    if (value === null || value === undefined || value === '') {
      return null
    }

    return value
  }

  sortDirectionFor(columnKey: string): ZardTableSortDirection {
    if (this.sortBy() !== columnKey) {
      return ''
    }

    return this.sortDirection() ?? ''
  }

  onSortChange(columnKey: string, direction: ZardTableSortDirection) {
    this.changeSort.emit({
      sortBy: columnKey,
      sortDirection: direction === 'desc' ? 'desc' : 'asc'
    })
  }
}
