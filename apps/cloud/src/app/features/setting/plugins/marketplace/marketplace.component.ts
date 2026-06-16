import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { Component, TemplateRef, computed, effect, inject, model, signal, viewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { getErrorMessage, injectToastr, routeAnimations } from '@cloud/app/@core'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import {
  IPluginMarketplaceRegistryItem,
  IPluginMarketplaceRegistrySection,
  PluginAPIService
} from '@xpert-ai/cloud/state'
import { OverlayAnimations } from '@xpert-ai/core'
import { injectConfirmDelete, NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { debouncedSignal, myRxResource, NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import type { Observable } from 'rxjs'
import { TPlugin } from '@cloud/app/@shared/plugins'
import { I18nService } from '@cloud/app/@shared/i18n'
import {
  PluginMarketplaceCategory,
  PluginMarketplaceItem,
  PluginTargetAppMarketplaceMetadata,
  PluginTargetAppMeta,
  PluginTargetAppMetadata,
  JSONValue
} from '@xpert-ai/contracts'
import { getPluginMarketplaceSourceI18nKey, PLATFORM_REGISTRY_SOURCE_ID, TPluginWithDownloads } from '../types'
import { SettingsPluginComponent } from '../plugin/plugin.component'
import {
  marketplaceCategoryOptions as buildMarketplaceCategoryOptions,
  developerToolSubcategoryOptionsFor,
  groupPluginsByMarketplaceCategory,
  matchesPluginMarketplaceCategoryFilters,
  normalizePluginMarketplaceCategory,
  PLUGIN_MARKETPLACE_TARGET_APP
} from '../plugin-marketplace-categories'

type MarketplaceSourceType = 'url' | 'github' | 'git'
const DEFAULT_REGISTRY_TARGET_APP_META = `{
  "data-xpert": {
    "types": ["business-app"],
    "marketplace": {
      "category": "developer-tools",
      "contents": []
    }
  }
}`

@Component({
  standalone: true,
  imports: [CdkMenuModule, TranslateModule, FormsModule, NgmSelectComponent, NgmSpinComponent, SettingsPluginComponent],
  selector: 'xp-plugins-marketplace',
  templateUrl: './marketplace.component.html',
  styleUrls: ['./marketplace.component.scss'],
  animations: [routeAnimations, ...OverlayAnimations]
})
export class PluginsMarketplaceComponent {
  readonly pluginAPI = inject(PluginAPIService)
  readonly #dialog = inject(Dialog)
  readonly #toastr = injectToastr()
  readonly confirmDelete = injectConfirmDelete()
  readonly i18nService = inject(I18nService)
  readonly i18n = new NgmI18nPipe()

  readonly addSourceDialog = viewChild('addSourceDialog', { read: TemplateRef })
  readonly registryDialog = viewChild('registryDialog', { read: TemplateRef })

  readonly sourceFilter = model('all')
  readonly selectedSourceId = computed(() => (this.sourceFilter() === 'all' ? null : this.sourceFilter()))

  readonly #marketplace = myRxResource({
    request: () => ({
      sourceId: this.selectedSourceId()
    }),
    loader: ({ request }) =>
      this.pluginAPI.getMarketplace({
        ...(request.sourceId ? { sourceId: request.sourceId } : {})
      })
  })

  readonly manifest = this.#marketplace.value
  readonly error = computed(() => {
    const error = this.#marketplace.error()
    return error ? getErrorMessage(error) : null
  })
  readonly manifestLoading = computed(() => this.#marketplace.status() === 'loading')
  readonly sourceErrors = computed(() => this.manifest()?.errors ?? [])
  readonly sources = computed(() => this.manifest()?.sources ?? [])

  readonly pluginsWithDownloads = signal<TPluginWithDownloads[]>([])
  readonly refreshingSource = signal(false)
  readonly loading = computed(() => (!this.manifest() && !this.error()) || this.manifestLoading())
  readonly hasVisiblePlugins = computed(() => this.pluginCategoryGroups().length > 0)
  readonly loadingCards = Array.from({ length: 8 }, (_, index) => index)

  readonly keywords = model<string[]>([])
  readonly searchModel = model<string>('')
  readonly searchText = debouncedSignal(this.searchModel, 300)
  readonly marketplaceCategories = model<PluginMarketplaceCategory[]>([])
  readonly developerToolSubcategories = model<string[]>([])
  readonly marketplaceCategoryOptions = buildMarketplaceCategoryOptions()
  readonly showDeveloperToolSubcategoryFilter = computed(
    () => this.marketplaceCategories().length === 0 || this.marketplaceCategories().includes('developer-tools')
  )

  readonly sourceName = model('')
  readonly sourceType = model<MarketplaceSourceType>('github')
  readonly sourceUrl = model('')
  readonly sourceRef = model('')
  readonly sourceSparsePath = model('')
  readonly sourceAdding = signal(false)
  readonly sourceAddError = signal<string | null>(null)

  readonly registryItems = signal<IPluginMarketplaceRegistryItem[]>([])
  readonly registryLoading = signal(false)
  readonly registrySaving = signal(false)
  readonly registryDeleting = signal('')
  readonly registryFormError = signal<string | null>(null)
  readonly registryFormSubmitted = signal(false)
  readonly registryEditingId = signal<string | null>(null)
  readonly selectedRegistryItem = computed(() => {
    const editingId = this.registryEditingId()
    return editingId ? (this.registryItems().find((item) => item.id === editingId) ?? null) : null
  })
  readonly registryPackageName = model('')
  readonly registryVersion = model('')
  readonly registryDisplayName = model('')
  readonly registryDescription = model('')
  readonly registryCategory = model('integration')
  readonly registryAuthor = model('XpertAI')
  readonly registrySection = model<IPluginMarketplaceRegistrySection>('marketplace')
  readonly registryTargetApps = model(PLUGIN_MARKETPLACE_TARGET_APP)
  readonly registryKeywords = model('')
  readonly registryHomepage = model('')
  readonly registryRepositoryUrl = model('')
  readonly registryPriority = model(100)
  readonly registryEnabled = model(true)
  readonly registryTargetAppMetaJson = model(DEFAULT_REGISTRY_TARGET_APP_META)
  readonly registryCategoryOptions = [
    'integration',
    'tools',
    'model',
    'database',
    'middleware',
    'vector-store',
    'doc-source'
  ]
  readonly registrySectionOptions: IPluginMarketplaceRegistrySection[] = [
    'marketplace',
    'official',
    'partner',
    'community'
  ]
  readonly registryTargetAppsMissing = computed(() => !this.parseCommaList(this.registryTargetApps()).length)
  readonly registryRequiredFieldsMissing = computed(
    () =>
      !this.registryPackageName().trim() ||
      !this.registryDisplayName().trim() ||
      !this.registryDescription().trim() ||
      !this.registryCategory() ||
      !this.registryAuthor().trim() ||
      this.registryTargetAppsMissing()
  )
  readonly registryTargetAppMetaInvalid = computed(() => !this.parseTargetAppMeta(this.registryTargetAppMetaJson()))
  readonly registryFormInvalid = computed(
    () => this.registryRequiredFieldsMissing() || this.registryTargetAppMetaInvalid()
  )
  readonly registrySaveDisabled = computed(() => this.registrySaving() || this.registryFormInvalid())

  readonly plugins = computed(() => {
    let plugins = this.pluginsWithDownloads()
    const keywords = this.keywords()
    if (keywords?.length) {
      plugins = plugins.filter((plugin) => plugin.keywords?.some((keyword) => keywords.includes(keyword)))
    }

    if (this.marketplaceCategories().length || this.developerToolSubcategories().length) {
      plugins = plugins.filter((plugin) =>
        matchesPluginMarketplaceCategoryFilters(plugin, this.marketplaceCategories(), this.developerToolSubcategories())
      )
    }

    const searchText = this.searchText().trim().toLowerCase()
    if (searchText) {
      plugins = plugins.filter(
        (plugin) =>
          this.i18n.transform(plugin.displayName).toLowerCase().includes(searchText) ||
          this.i18n.transform(plugin.description)?.toLowerCase().includes(searchText) ||
          plugin.author?.name?.toLowerCase().includes(searchText) ||
          plugin.name?.toLowerCase().includes(searchText) ||
          plugin.keywords?.some((keyword) => keyword.toLowerCase().includes(searchText))
      )
    }

    return plugins
  })

  readonly pluginCategoryGroups = computed(() => groupPluginsByMarketplaceCategory(this.plugins()))

  readonly keywordsOptions = computed(() => {
    const keywords = this.pluginsWithDownloads().flatMap((plugin) => plugin.keywords ?? [])
    return Array.from(new Set(keywords))
      .sort()
      .map((keyword) => ({ label: keyword, value: keyword }))
  })

  readonly developerToolSubcategoryOptions = computed(() =>
    developerToolSubcategoryOptionsFor(this.pluginsWithDownloads()).map((category) => ({
      label: this.i18nService.instant(category.labelKey, { Default: category.defaultLabel }),
      value: category.value
    }))
  )

  constructor() {
    effect(
      () => {
        if (!this.showDeveloperToolSubcategoryFilter() && this.developerToolSubcategories().length) {
          this.developerToolSubcategories.set([])
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        const sources = this.sources()
        const selected = this.sourceFilter()
        if (selected !== 'all' && sources.length > 0 && !sources.some((source) => source.id === selected)) {
          this.sourceFilter.set('all')
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        const manifest = this.manifest()
        this.pluginsWithDownloads.set((manifest?.items ?? []).map((item) => normalizeMarketplacePlugin(item)))
      },
      { allowSignalWrites: true }
    )
  }

  reload() {
    this.#marketplace.reload()
  }

  sourceI18nKey(sourceId?: string | null, sourceName?: string | null) {
    return getPluginMarketplaceSourceI18nKey(sourceId, sourceName)
  }

  clearMarketplaceCategories() {
    this.marketplaceCategories.set([])
  }

  toggleMarketplaceCategory(category: PluginMarketplaceCategory) {
    this.marketplaceCategories.update((categories) =>
      categories.includes(category) ? categories.filter((item) => item !== category) : [...categories, category]
    )
  }

  resetAddSourceForm() {
    this.sourceName.set('')
    this.sourceType.set('github')
    this.sourceUrl.set('')
    this.sourceRef.set('')
    this.sourceSparsePath.set('')
    this.sourceAddError.set(null)
    this.sourceAdding.set(false)
  }

  openAddSource() {
    const template = this.addSourceDialog()
    if (!template) {
      return
    }

    this.resetAddSourceForm()
    this.#dialog.open(template, {
      backdropClass: 'backdrop-blur-sm-black',
      minWidth: '520px'
    })
  }

  openRegistryManager() {
    const template = this.registryDialog()
    if (!template) {
      return
    }

    this.resetRegistryForm()
    this.loadRegistryItems()
    this.#dialog.open(template, {
      backdropClass: 'backdrop-blur-sm-black',
      minWidth: '960px',
      maxWidth: 'calc(100vw - 48px)'
    })
  }

  loadRegistryItems() {
    this.registryLoading.set(true)
    this.pluginAPI.getMarketplaceRegistryItems().subscribe({
      next: (response) => {
        this.registryItems.set(response.items ?? [])
        this.registryLoading.set(false)
      },
      error: (error) => {
        this.registryLoading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  resetRegistryForm() {
    this.registryEditingId.set(null)
    this.registryPackageName.set('')
    this.registryVersion.set('')
    this.registryDisplayName.set('')
    this.registryDescription.set('')
    this.registryCategory.set('integration')
    this.registryAuthor.set('XpertAI')
    this.registrySection.set('marketplace')
    this.registryTargetApps.set(PLUGIN_MARKETPLACE_TARGET_APP)
    this.registryKeywords.set('')
    this.registryHomepage.set('')
    this.registryRepositoryUrl.set('')
    this.registryPriority.set(100)
    this.registryEnabled.set(true)
    this.registryTargetAppMetaJson.set(DEFAULT_REGISTRY_TARGET_APP_META)
    this.registryFormError.set(null)
    this.registryFormSubmitted.set(false)
  }

  editRegistryItem(item: IPluginMarketplaceRegistryItem) {
    this.registryEditingId.set(item.id)
    this.registryPackageName.set(item.packageName ?? '')
    this.registryVersion.set(item.version ?? '')
    this.registryDisplayName.set(item.displayName ?? '')
    this.registryDescription.set(item.description ?? '')
    this.registryCategory.set(item.category ?? 'integration')
    this.registryAuthor.set(item.author ?? 'XpertAI')
    this.registrySection.set(item.section ?? 'marketplace')
    this.registryTargetApps.set((item.targetApps ?? []).join(', '))
    this.registryKeywords.set((item.keywords ?? []).join(', '))
    this.registryHomepage.set(item.homepage ?? '')
    this.registryRepositoryUrl.set(this.readRepositoryUrl(item.repository))
    this.registryPriority.set(item.priority ?? 100)
    this.registryEnabled.set(item.enabled !== false)
    this.registryTargetAppMetaJson.set(JSON.stringify(item.targetAppMeta ?? {}, null, 2))
    this.registryFormError.set(null)
    this.registryFormSubmitted.set(false)
  }

  saveRegistryItem() {
    this.registryFormSubmitted.set(true)
    const packageName = this.registryPackageName().trim()
    const displayName = this.registryDisplayName().trim()
    const description = this.registryDescription().trim()
    const category = this.registryCategory()
    const author = this.registryAuthor().trim()
    const targetApps = this.parseCommaList(this.registryTargetApps())
    const targetAppMeta = this.parseTargetAppMeta(this.registryTargetAppMetaJson())

    if (this.registryRequiredFieldsMissing()) {
      this.registryFormError.set(
        this.i18nService.instant('PAC.Plugin.RegisteredPluginRequiredFields', {
          Default: 'Package, name, description, category, author, and target apps are required.'
        })
      )
      return
    }
    if (!targetAppMeta) {
      this.registryFormError.set(
        this.i18nService.instant('PAC.Plugin.RegisteredPluginJsonInvalid', {
          Default: 'Advanced JSON must be a valid object.'
        })
      )
      return
    }

    const repositoryUrl = this.registryRepositoryUrl().trim()
    const payload = {
      packageName,
      version: this.registryVersion().trim() || null,
      displayName,
      description,
      category,
      author,
      keywords: this.parseCommaList(this.registryKeywords()),
      homepage: this.registryHomepage().trim() || null,
      repository: repositoryUrl ? { type: 'git', url: repositoryUrl } : null,
      targetApps,
      targetAppMeta,
      enabled: this.registryEnabled(),
      priority: Number(this.registryPriority()) || 100,
      section: this.registrySection()
    }
    const editingId = this.registryEditingId()
    const request$ = editingId
      ? this.pluginAPI.updateMarketplaceRegistryItem(editingId, payload)
      : this.pluginAPI.createMarketplaceRegistryItem(payload)

    this.registrySaving.set(true)
    this.registryFormError.set(null)
    request$.subscribe({
      next: () => {
        this.registrySaving.set(false)
        this.sourceFilter.set(PLATFORM_REGISTRY_SOURCE_ID)
        this.resetRegistryForm()
        this.loadRegistryItems()
        this.reload()
        this.#toastr.success('PAC.Plugin.RegisteredPluginSaved', {
          Default: 'Registered plugin saved'
        })
      },
      error: (error) => {
        this.registrySaving.set(false)
        this.registryFormError.set(getErrorMessage(error))
      }
    })
  }

  deleteRegistryItem(item: IPluginMarketplaceRegistryItem) {
    this.confirmDelete(
      {
        title: this.i18nService.instant('PAC.Plugin.DeleteRegisteredPlugin', {
          Default: 'Delete registered plugin'
        }),
        information: this.i18nService.instant('PAC.Plugin.DeleteRegisteredPluginMessage', {
          Default: `Delete "${item.displayName || item.packageName}" from the platform registry? Installed plugins remain installed.`
        })
      },
      () => {
        this.registryDeleting.set(item.id)
        return this.pluginAPI.deleteMarketplaceRegistryItem(item.id)
      }
    ).subscribe({
      next: () => {
        this.registryDeleting.set('')
        if (this.registryEditingId() === item.id) {
          this.resetRegistryForm()
        }
        this.loadRegistryItems()
        this.reload()
      },
      error: (error) => {
        this.registryDeleting.set('')
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  confirmAddSource(dialogRef: DialogRef) {
    const url = this.sourceUrl().trim()
    if (!url) {
      this.sourceAddError.set('Marketplace source is required.')
      return
    }

    this.sourceAdding.set(true)
    this.sourceAddError.set(null)
    this.pluginAPI
      .createMarketplaceSource({
        name: this.sourceName().trim() || undefined,
        type: this.sourceType(),
        url,
        ref: this.sourceRef().trim() || undefined,
        sparsePath: this.sourceSparsePath().trim() || undefined,
        enabled: true
      })
      .subscribe({
        next: (source) => {
          this.sourceAdding.set(false)
          dialogRef.close()
          if (source?.id) {
            this.sourceFilter.set(source.id)
          }
          this.reload()
          this.#toastr.success('PAC.Plugin.MarketplaceSourceAdded', {
            Default: 'Marketplace source added'
          })
        },
        error: (error) => {
          this.sourceAddError.set(getErrorMessage(error))
          this.sourceAdding.set(false)
        }
      })
  }

  refreshSelectedSource() {
    const sourceId = this.selectedSourceId()
    const refresh$: Observable<unknown> = sourceId
      ? this.pluginAPI.refreshMarketplaceSource(sourceId)
      : this.pluginAPI.refreshMarketplaceSources()

    this.refreshingSource.set(true)
    refresh$.subscribe({
      next: () => {
        this.refreshingSource.set(false)
        this.reload()
        this.#toastr.success('PAC.Plugin.MarketplaceSourceRefreshed', {
          Default: 'Marketplace source refreshed'
        })
      },
      error: (error) => {
        this.refreshingSource.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  private parseCommaList(value: string) {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  private parseTargetAppMeta(value: string): PluginTargetAppMeta | null {
    try {
      const parsed = JSON.parse(value || '{}')
      return isPluginTargetAppMetaInput(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  private readRepositoryUrl(value: JSONValue | null | undefined) {
    if (typeof value === 'string') {
      return value
    }
    if (!isPlainObject(value)) {
      return ''
    }

    const url = Reflect.get(value, 'url')
    return typeof url === 'string' ? url : ''
  }
}

function normalizeMarketplacePlugin(item: PluginMarketplaceItem): TPluginWithDownloads {
  const name = item.name || item.packageName || ''
  const packageName = item.packageName ?? name
  const sourceId = item.sourceId ?? null
  const sourceName = item.sourceName ?? null

  return {
    name,
    packageName,
    displayName: item.displayName ?? name,
    description: item.description ?? name,
    version: item.version ?? '',
    deprecated: item.deprecated,
    deprecationMessage: item.deprecationMessage ?? undefined,
    category: item.category ?? 'integration',
    icon: normalizeIcon(item.icon),
    author: normalizeAuthor(item.author),
    source: normalizeSource(item.source),
    keywords: item.keywords,
    downloads: item.downloads,
    sourceId,
    sourceName,
    sourceNameI18nKey: item.sourceNameI18nKey ?? getPluginMarketplaceSourceI18nKey(sourceId, sourceName),
    installed: item.installed,
    contributions: item.contributions ?? [],
    operationSummary: item.operationSummary,
    targetAppMeta: item.targetAppMeta ?? null
  }
}

function isPluginTargetAppMetaInput(value: unknown): value is PluginTargetAppMeta {
  if (!isPlainObject(value)) {
    return false
  }

  const entries: Array<[string, unknown]> = Object.entries(value)
  return entries.every(([, metadata]) => metadata === undefined || isPluginTargetAppMetaEntry(metadata))
}

function isPluginTargetAppMetaEntry(value: unknown): value is PluginTargetAppMetadata {
  if (!isPlainObject(value)) {
    return false
  }

  const types = Reflect.get(value, 'types')
  const minAppVersion = Reflect.get(value, 'minAppVersion')
  const capabilities = Reflect.get(value, 'capabilities')
  const marketplace = Reflect.get(value, 'marketplace')
  const runtime = Reflect.get(value, 'runtime')

  return (
    isOptionalStringArray(types) &&
    (minAppVersion === undefined || typeof minAppVersion === 'string') &&
    isOptionalStringArray(capabilities) &&
    (marketplace === undefined || isMarketplaceMetadataInput(marketplace)) &&
    (runtime === undefined || isPlainObject(runtime))
  )
}

function isMarketplaceMetadataInput(value: unknown): value is PluginTargetAppMarketplaceMetadata {
  if (!isPlainObject(value)) {
    return false
  }

  const contents = Reflect.get(value, 'contents')
  const category = Reflect.get(value, 'category')
  const subcategory = Reflect.get(value, 'subcategory')
  const featured = Reflect.get(value, 'featured')
  const screenshots = Reflect.get(value, 'screenshots')
  const readme = Reflect.get(value, 'readme')
  const updatedAt = Reflect.get(value, 'updatedAt')

  return (
    (contents === undefined || Array.isArray(contents)) &&
    (category === undefined || isPluginMarketplaceCategory(category)) &&
    (subcategory === undefined || typeof subcategory === 'string') &&
    (featured === undefined || typeof featured === 'boolean') &&
    isOptionalStringArray(screenshots) &&
    (readme === undefined || typeof readme === 'string') &&
    (updatedAt === undefined || typeof updatedAt === 'string')
  )
}

function isPluginMarketplaceCategory(value: unknown): value is PluginMarketplaceCategory {
  return typeof value === 'string' && normalizePluginMarketplaceCategory(value) === value
}

function isOptionalStringArray(value: unknown) {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === 'string'))
}

function isPlainObject(value: unknown): value is object {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeAuthor(value: PluginMarketplaceItem['author']): TPlugin['author'] {
  if (typeof value === 'string') {
    return {
      name: value,
      url: ''
    }
  }

  return {
    name: value?.name ?? value?.displayName ?? 'XpertAI',
    url: value?.url ?? value?.homepage ?? ''
  }
}

function normalizeIcon(value: PluginMarketplaceItem['icon']): TPlugin['icon'] {
  if (value) {
    return value
  }

  return {
    type: 'font',
    value: 'ri-puzzle-2-line'
  }
}

function normalizeSource(value: PluginMarketplaceItem['source']): TPlugin['source'] {
  if (!value?.url) {
    return undefined
  }
  return {
    type: normalizeSourceType(value.type),
    url: value.url
  }
}

function normalizeSourceType(type: string | undefined): NonNullable<TPlugin['source']>['type'] {
  if (
    type === 'marketplace' ||
    type === 'github' ||
    type === 'git' ||
    type === 'url' ||
    type === 'npm' ||
    type === 'website'
  ) {
    return type
  }
  return 'other'
}
