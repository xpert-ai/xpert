import { CommonModule } from '@angular/common'
import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import {
  XpertDetailViewSchema,
  XpertExtensionViewManifest,
  XpertListViewSchema,
  XpertRawJsonViewSchema,
  XpertStatsViewSchema,
  XpertTableViewSchema,
  XpertViewActionDefinition,
  XpertViewDataResult,
  XpertViewQuery
} from '@metad/contracts'
import { injectToastr, injectViewExtensionApi } from '@cloud/app/@core'
import { Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { getErrorMessage } from '@cloud/app/@core/types'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { StatsViewRendererComponent } from './renderers/stats-view-renderer.component'
import { TableViewRendererComponent } from './renderers/table-view-renderer.component'
import { ListViewRendererComponent } from './renderers/list-view-renderer.component'
import { DetailViewRendererComponent } from './renderers/detail-view-renderer.component'
import { RawJsonViewRendererComponent } from './renderers/raw-json-view-renderer.component'

@Component({
  standalone: true,
  selector: 'xp-view-renderer',
  imports: [
    CommonModule,
    TranslateModule,
    NgmI18nPipe,
    StatsViewRendererComponent,
    TableViewRendererComponent,
    ListViewRendererComponent,
    DetailViewRendererComponent,
    RawJsonViewRendererComponent
  ],
  template: `
    <div class="flex flex-col gap-4">
      @if (toolbarActions().length) {
        <div class="flex flex-wrap gap-2">
          @for (action of toolbarActions(); track action.key) {
            <button
              type="button"
              class="rounded-full border border-divider-regular px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-hover-bg"
              (click)="executeAction(action)"
            >
              {{ action.label | i18n }}
            </button>
          }
        </div>
      }

      @if (error()) {
        <div class="rounded-2xl border border-divider-regular bg-components-card-bg px-4 py-5 text-sm text-text-tertiary">
          {{ error() }}
        </div>
      } @else {
        @switch (manifest().view.type) {
          @case ('stats') {
            @if (statsSchema(); as schema) {
              <xp-stats-view-renderer [schema]="schema" [summary]="data().summary" />
            }
          }
          @case ('table') {
            @if (tableSchema(); as schema) {
              <xp-table-view-renderer
                [schema]="schema"
                [items]="items()"
                [total]="data().total ?? items().length"
                [loading]="loading()"
                [page]="query().page ?? 1"
                [pageSize]="query().pageSize ?? defaultPageSize()"
                [search]="query().search ?? ''"
                [sortBy]="query().sortBy ?? null"
                [sortDirection]="query().sortDirection ?? null"
                [rowActions]="rowActions()"
                (applySearch)="onSearch($event)"
                (changePage)="onPageChange($event)"
                (changeSort)="onSortChange($event)"
                (runAction)="executeAction($event.action, $event.targetId)"
              />
            }
          }
          @case ('list') {
            @if (listSchema(); as schema) {
              <xp-list-view-renderer
                [schema]="schema"
                [items]="items()"
                [total]="data().total ?? items().length"
                [loading]="loading()"
                [page]="query().page ?? 1"
                [pageSize]="query().pageSize ?? defaultPageSize()"
                [search]="query().search ?? ''"
                [rowActions]="rowActions()"
                (applySearch)="onSearch($event)"
                (changePage)="onPageChange($event)"
                (runAction)="executeAction($event.action, $event.targetId)"
              />
            }
          }
          @case ('detail') {
            @if (detailSchema(); as schema) {
              <xp-detail-view-renderer [schema]="schema" [item]="data().item" />
            }
          }
          @case ('raw_json') {
            @if (rawJsonSchema(); as schema) {
              <xp-raw-json-view-renderer
                [schema]="schema"
                [payload]="data().item ?? data().items ?? data().summary ?? data().meta"
              />
            }
          }
          @default {
            <div class="rounded-2xl border border-divider-regular bg-components-card-bg px-4 py-5 text-sm text-text-tertiary">
              {{ 'PAC.ViewExtension.Unsupported' | translate: { Default: 'Unsupported view schema' } }}
            </div>
          }
        }
      }
    </div>
  `
})
export class ViewRendererComponent {
  readonly hostType = input.required<string>()
  readonly hostId = input.required<string>()
  readonly manifest = input.required<XpertExtensionViewManifest>()
  readonly active = input<boolean>(true)

  readonly #api = injectViewExtensionApi()
  readonly #toastr = injectToastr()
  readonly #router = inject(Router)
  readonly #destroyRef = inject(DestroyRef)
  readonly #i18n = new NgmI18nPipe()

  readonly loading = signal(false)
  readonly error = signal<string | null>(null)
  readonly data = signal<XpertViewDataResult>({})
  readonly query = signal<XpertViewQuery>({})

  private requestId = 0

  readonly items = signal<unknown[]>([])

  constructor() {
    effect(() => {
      const manifest = this.manifest()
      const defaultPageSize = this.defaultPageSize()

      this.items.set([])
      this.data.set({})
      this.error.set(null)

      if (manifest.view.type === 'table' || manifest.view.type === 'list') {
        this.query.set({
          page: 1,
          pageSize: defaultPageSize
        })
        return
      }

      this.query.set({})
    }, { allowSignalWrites: true })

    effect(() => {
      this.hostType()
      this.hostId()
      this.manifest().key
      this.query()

      if (!this.active()) {
        return
      }

      void this.loadData()
    })

    effect((onCleanup) => {
      const manifest = this.manifest()
      const active = this.active()
      const polling = manifest.polling ?? manifest.dataSource.polling
      if (!active || !polling?.enabled) {
        return
      }

      const intervalMs = polling.intervalMs ?? 30_000
      const handle = window.setInterval(() => {
        void this.loadData()
      }, intervalMs)

      onCleanup(() => window.clearInterval(handle))
    })

    this.#destroyRef.onDestroy(() => {
      this.requestId += 1
    })
  }

  readonly toolbarActions = computed(
    () => (this.manifest().actions ?? []).filter((action) => action.placement === 'toolbar')
  )
  readonly rowActions = computed(() => (this.manifest().actions ?? []).filter((action) => action.placement === 'row'))
  readonly defaultPageSize = computed(() => {
    const tableSchema = this.tableSchema()
    if (tableSchema) {
      return tableSchema.pagination?.pageSize ?? 10
    }

    const listSchema = this.listSchema()
    if (listSchema) {
      return listSchema.pagination?.pageSize ?? 10
    }

    return this.manifest().dataSource.querySchema?.defaultPageSize ?? 10
  })

  statsSchema(): XpertStatsViewSchema | null {
    const view = this.manifest().view
    if (view.type !== 'stats') {
      return null
    }

    return view
  }

  tableSchema(): XpertTableViewSchema | null {
    const view = this.manifest().view
    if (view.type !== 'table') {
      return null
    }

    return view
  }

  listSchema(): XpertListViewSchema | null {
    const view = this.manifest().view
    if (view.type !== 'list') {
      return null
    }

    return view
  }

  detailSchema(): XpertDetailViewSchema | null {
    const view = this.manifest().view
    if (view.type !== 'detail') {
      return null
    }

    return view
  }

  rawJsonSchema(): XpertRawJsonViewSchema | null {
    const view = this.manifest().view
    if (view.type !== 'raw_json') {
      return null
    }

    return view
  }

  async executeAction(action: XpertViewActionDefinition, targetId?: string) {
    const confirmMessage = action.confirm
      ? this.#i18n.transform(action.confirm.message ?? action.confirm.title ?? action.label)
      : null

    if (confirmMessage && !window.confirm(confirmMessage)) {
      return
    }

    try {
      const result = await firstValueFrom(
        this.#api.executeAction(this.hostType(), this.hostId(), this.manifest().key, action.key, { targetId })
      )

      if (result.message) {
        const message = this.#i18n.transform(result.message)
        if (result.success) {
          this.#toastr.success(message)
        } else {
          this.#toastr.error(message)
        }
      }

      if (!result.success) {
        return
      }

      if (result.refresh) {
        await this.loadData(true)
      }

      if ((action.actionType === 'navigate' || action.actionType === 'open_detail') && result.data) {
        const url = getNavigationUrl(result.data)
        if (url) {
          if (url.startsWith('http')) {
            window.open(url, '_blank', 'noopener,noreferrer')
          } else {
            await this.#router.navigateByUrl(url)
          }
        }
      }
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }

  onSearch(search: string) {
    this.query.update((state) => ({
      ...state,
      page: 1,
      search: search || undefined
    }))
  }

  onPageChange(page: number) {
    this.query.update((state) => ({
      ...state,
      page
    }))
  }

  onSortChange(sort: { sortBy: string; sortDirection: 'asc' | 'desc' }) {
    this.query.update((state) => ({
      ...state,
      page: 1,
      sortBy: sort.sortBy,
      sortDirection: sort.sortDirection
    }))
  }

  private async loadData(force = false) {
    if (!this.active()) {
      return
    }

    const requestId = ++this.requestId
    this.loading.set(true)
    this.error.set(null)

    try {
      const manifest = this.manifest()
      const query = this.query()
      const data = await firstValueFrom(
        this.#api.getViewData(this.hostType(), this.hostId(), manifest.key, query)
      )

      if (requestId !== this.requestId) {
        return
      }

      this.data.set(data)
      const nextItems = Array.isArray(data.items) ? data.items : []

      if (manifest.view.type === 'list' && (query.page ?? 1) > 1) {
        this.items.update((items) => mergeItems(items, nextItems))
      } else {
        this.items.set(nextItems)
      }
    } catch (error) {
      if (requestId !== this.requestId) {
        return
      }

      this.error.set(getErrorMessage(error))
      if (!force) {
        this.items.set([])
        this.data.set({})
      }
    } finally {
      if (requestId === this.requestId) {
        this.loading.set(false)
      }
    }
  }
}

function getNavigationUrl(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('url' in value)) {
    return null
  }

  const url = Reflect.get(value, 'url')
  return typeof url === 'string' ? url : null
}

function mergeItems(current: unknown[], incoming: unknown[]) {
  if (!current.length) {
    return incoming
  }

  const merged = [...current]
  for (const item of incoming) {
    const id = getItemIdentity(item)
    if (!id) {
      merged.push(item)
      continue
    }

    const existingIndex = merged.findIndex((candidate) => getItemIdentity(candidate) === id)
    if (existingIndex >= 0) {
      merged[existingIndex] = item
    } else {
      merged.push(item)
    }
  }

  return merged
}

function getItemIdentity(item: unknown) {
  if (!item || typeof item !== 'object' || Array.isArray(item) || !('id' in item)) {
    return null
  }

  const id = Reflect.get(item, 'id')
  return typeof id === 'string' && id.length > 0 ? id : null
}
