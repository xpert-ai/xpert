import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardSearchInputComponent,
  ZardSelectImports,
  ZardPaginatorComponent,
  XpI18nPipe,
  type ZardSelectValue,
  type ZardPageEvent
} from '@xpert-ai/headless-ui'
import {
  PLUGIN_MARKETPLACE_CATEGORIES,
  type SetupPluginCatalogItem,
  type SetupPluginCatalogQuery,
  type SetupPluginCatalogResponse
} from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { IconComponent } from '../../@shared/avatar'
import { getErrorMessage } from '../../@core'
import { SetupPluginsService } from '../../@core/services/setup-plugins.service'

@Component({
  standalone: true,
  selector: 'xp-setup-plugin-catalog',
  imports: [
    FormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardSearchInputComponent,
    ...ZardSelectImports,
    ZardPaginatorComponent,
    XpI18nPipe,
    IconComponent
  ],
  templateUrl: './setup-plugin-catalog.component.html'
})
export class SetupPluginCatalogComponent {
  readonly #api = inject(SetupPluginsService)
  readonly allOption = '__all__'
  readonly disabled = input(false)
  readonly selectionChange = output<Set<string>>()
  readonly response = signal<SetupPluginCatalogResponse | null>(null)
  readonly query = signal<SetupPluginCatalogQuery>({ page: 1, pageSize: 12, groupBy: 'none' })
  readonly selected = signal(new Set<string>())
  readonly loading = signal(false)
  readonly error = signal<string | null>(null)
  readonly allSelected = computed(() => {
    const names = this.response()?.selectableNames ?? []
    return names.length > 0 && names.every((name) => this.selected().has(name))
  })
  readonly groups = computed(() => {
    const groups = new Map<string, SetupPluginCatalogItem[]>()
    for (const item of this.response()?.items ?? []) {
      const key =
        this.query().groupBy === 'business'
          ? (item.businessCategory ?? 'unclassified')
          : this.query().groupBy === 'type'
            ? (item.type ?? 'unclassified')
            : ''
      const group = groups.get(key) ?? []
      group.push(item)
      groups.set(key, group)
    }
    return [...groups].map(([key, items]) => ({ key, items }))
  })
  #request = 0
  #searchTimer: ReturnType<typeof setTimeout> | undefined
  #destroyed = false

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true
      clearTimeout(this.#searchTimer)
    })
    void this.load()
  }

  async load() {
    clearTimeout(this.#searchTimer)
    const request = ++this.#request
    this.loading.set(true)
    this.error.set(null)
    try {
      const response = await firstValueFrom(this.#api.catalog(this.query()))
      if (this.#destroyed || request !== this.#request) return
      this.response.set(response)
      this.query.update((query) => ({ ...query, page: response.page }))
    } catch (error) {
      if (!this.#destroyed && request === this.#request) this.error.set(getErrorMessage(error))
    } finally {
      if (!this.#destroyed && request === this.#request) this.loading.set(false)
    }
  }

  search(value: string) {
    this.query.update((query) => ({ ...query, search: value || undefined, page: 1 }))
    // Invalidate an older response immediately, before the debounced request starts.
    ++this.#request
    this.loading.set(true)
    clearTimeout(this.#searchTimer)
    this.#searchTimer = setTimeout(() => void this.load(), 250)
  }

  filterType(value: ZardSelectValue | ZardSelectValue[]) {
    if (typeof value !== 'string') return
    this.update({ type: value === this.allOption ? undefined : value || undefined })
  }

  filterBusiness(value: ZardSelectValue | ZardSelectValue[]) {
    if (typeof value !== 'string') return
    this.update({ businessCategory: PLUGIN_MARKETPLACE_CATEGORIES.find((category) => category === value) })
  }

  filterLevel(value: ZardSelectValue | ZardSelectValue[]) {
    if (typeof value !== 'string') return
    this.update({ level: (['system', 'tenant', 'organization'] as const).find((level) => level === value) })
  }

  groupBy(value: ZardSelectValue | ZardSelectValue[]) {
    if (typeof value !== 'string') return
    this.update({ groupBy: (['none', 'type', 'business'] as const).find((group) => group === value) ?? 'business' })
  }

  page(event: ZardPageEvent) {
    if (this.disabled() || this.loading()) return
    this.query.update((query) => ({ ...query, page: event.pageIndex + 1, pageSize: event.pageSize }))
    void this.load()
  }

  toggle(item: SetupPluginCatalogItem) {
    if (this.disabled() || this.loading() || item.installed || item.unavailableReason) return
    const selected = new Set(this.selected())
    if (selected.has(item.packageName)) selected.delete(item.packageName)
    else selected.add(item.packageName)
    this.setSelection(selected)
  }

  selectAll() {
    if (this.disabled() || this.loading() || this.error()) return
    this.setSelection(new Set([...this.selected(), ...(this.response()?.selectableNames ?? [])]))
  }

  clearSelection() {
    if (!this.disabled()) this.setSelection(new Set())
  }

  author(item: SetupPluginCatalogItem) {
    return typeof item.author === 'string' ? item.author : item.author?.name
  }

  groupLabel(key: string) {
    return key === 'unclassified'
      ? 'XP.Onboarding.PluginUnclassified'
      : this.query().groupBy === 'business'
        ? `XP.Plugin.MarketplaceCategory_${key}`
        : `XP.Plugin.Category_${key}`
  }

  private update(update: Partial<SetupPluginCatalogQuery>) {
    this.query.update((query) => ({ ...query, ...update, page: 1 }))
    void this.load()
  }

  private setSelection(selected: Set<string>) {
    this.selected.set(selected)
    this.selectionChange.emit(selected)
  }
}
