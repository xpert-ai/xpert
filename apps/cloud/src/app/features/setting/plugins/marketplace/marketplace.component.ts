import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { CdkListboxModule } from '@angular/cdk/listbox'
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
  getPluginMarketplaceSourceI18nKey,
  PLATFORM_REGISTRY_SOURCE_ID,
  TPluginMarketplaceContribution,
  TPluginMarketplaceOperation,
  TPluginWithDownloads
} from '../types'
import { SettingsPluginComponent } from '../plugin/plugin.component'

type MarketplaceSourceType = 'url' | 'github' | 'git'
type JsonRecord = Record<string, unknown>
const DEFAULT_REGISTRY_TARGET_APP_META = `{
  "data-xpert": {
    "types": ["business-app"],
    "marketplace": {
      "contents": []
    }
  }
}`

@Component({
  standalone: true,
  imports: [
    CdkMenuModule,
    CdkListboxModule,
    TranslateModule,
    FormsModule,
    NgmSelectComponent,
    NgmSpinComponent,
    SettingsPluginComponent
  ],
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
  readonly hasVisiblePlugins = computed(
    () =>
      !!(
        (this.marketplacePlugins()?.length ?? 0) ||
        (this.partnerPlugins()?.length ?? 0) ||
        (this.officialPlugins()?.length ?? 0) ||
        (this.communityPlugins()?.length ?? 0)
      )
  )
  readonly loadingCards = Array.from({ length: 8 }, (_, index) => index)

  readonly keywords = model<string[]>([])
  readonly searchModel = model<string>('')
  readonly searchText = debouncedSignal(this.searchModel, 300)
  readonly categories = model<string[]>([])

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
  readonly registryTargetApps = model('data-xpert')
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
  readonly registryTargetAppMetaInvalid = computed(() => !this.parseJsonRecord(this.registryTargetAppMetaJson()))
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

    if (this.categories().length) {
      plugins = plugins.filter((plugin) => this.categories().includes(plugin.category?.toLowerCase()))
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

  readonly pluginByName = computed(() => {
    const map = new Map<string, TPluginWithDownloads>()
    this.plugins().forEach((plugin) => {
      map.set(normalizePluginName(plugin.name), plugin)
    })
    return map
  })

  readonly officialPlugins = computed(() => this.pluginsByNames(this.manifest()?.official ?? []))
  readonly partnerPlugins = computed(() => this.pluginsByNames(this.manifest()?.partner ?? []))
  readonly communityPlugins = computed(() => this.pluginsByNames(this.manifest()?.community ?? []))
  readonly marketplacePlugins = computed(() => {
    const groupedNames = new Set(
      [...(this.manifest()?.official ?? []), ...(this.manifest()?.partner ?? []), ...(this.manifest()?.community ?? [])]
        .filter(Boolean)
        .map((name) => normalizePluginName(name))
    )

    if (!groupedNames.size) {
      return this.plugins()
    }

    return this.plugins().filter((plugin) => !groupedNames.has(normalizePluginName(plugin.name)))
  })

  readonly keywordsOptions = computed(() => {
    const keywords = this.pluginsWithDownloads().flatMap((plugin) => plugin.keywords ?? [])
    return Array.from(new Set(keywords))
      .sort()
      .map((keyword) => ({ label: keyword, value: keyword }))
  })

  constructor() {
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

  pluginsByNames(names: string[]) {
    const byName = this.pluginByName()
    return names
      .map((name) => byName.get(normalizePluginName(name)))
      .filter((plugin): plugin is TPluginWithDownloads => !!plugin)
  }

  reload() {
    this.#marketplace.reload()
  }

  sourceI18nKey(sourceId?: string | null, sourceName?: string | null) {
    return getPluginMarketplaceSourceI18nKey(sourceId, sourceName)
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
    this.registryTargetApps.set('data-xpert')
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
    const targetAppMeta = this.parseJsonRecord(this.registryTargetAppMetaJson())

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

  private parseJsonRecord(value: string): JsonRecord | null {
    try {
      const parsed = JSON.parse(value || '{}')
      return readRecord(parsed)
    } catch {
      return null
    }
  }

  private readRepositoryUrl(value: unknown) {
    if (typeof value === 'string') {
      return value
    }
    const record = readRecord(value)
    return readString(record?.url) ?? ''
  }
}

function normalizeMarketplacePlugin(item: unknown): TPluginWithDownloads {
  const record = readRecord(item) ?? {}
  const name = readString(record.name) ?? readString(record.packageName) ?? ''
  const sourceId = readString(record.sourceId)
  const sourceName = readString(record.sourceName)
  const source = normalizeSource(record.source)
  const contributions = normalizeContributions(record.contributions)

  return {
    name,
    displayName: (record.displayName ?? name) as TPlugin['displayName'],
    description: (record.description ?? name) as TPlugin['description'],
    version: readString(record.version) ?? '',
    deprecated: Boolean(record.deprecated),
    deprecationMessage: record.deprecationMessage as TPlugin['deprecationMessage'],
    category: readString(record.category) ?? 'integration',
    icon: normalizeIcon(record.icon),
    author: normalizeAuthor(record.author),
    source,
    keywords: readStringArray(record.keywords),
    downloads: normalizeDownloads(record.downloads),
    sourceId,
    sourceName,
    sourceNameI18nKey: getPluginMarketplaceSourceI18nKey(sourceId, sourceName),
    installed: Boolean(record.installed),
    contributions,
    operationSummary: readRecord(record.operationSummary) as TPluginWithDownloads['operationSummary'],
    marketplacePlugin: record
  }
}

function normalizeDownloads(value: unknown): TPluginWithDownloads['downloads'] {
  const record = readRecord(value)
  if (!record) {
    return undefined
  }

  return {
    lastWeek: readNumber(record.lastWeek),
    lastMonth: readNumber(record.lastMonth),
    lastYear: readNumber(record.lastYear)
  }
}

function normalizeAuthor(value: unknown): TPlugin['author'] {
  if (typeof value === 'string') {
    return {
      name: value,
      url: ''
    }
  }

  const record = readRecord(value)
  return {
    name: readString(record?.name) ?? readString(record?.displayName) ?? 'XpertAI',
    url: readString(record?.url) ?? readString(record?.homepage) ?? ''
  }
}

function normalizeIcon(value: unknown): TPlugin['icon'] {
  return (
    normalizeOptionalIcon(value) ?? {
      type: 'font',
      value: 'ri-puzzle-2-line'
    }
  )
}

function normalizeOptionalIcon(value: unknown): TPluginMarketplaceContribution['icon'] {
  const record = readRecord(value)
  if (!record || typeof record.type !== 'string' || typeof record.value !== 'string') {
    return undefined
  }
  return record as unknown as TPluginMarketplaceContribution['icon']
}

function normalizeSource(value: unknown): TPlugin['source'] {
  const record = readRecord(value)
  const type = normalizeSourceType(readString(record?.type))
  const url = readString(record?.url)

  if (!url) {
    return undefined
  }

  return {
    type,
    url
  }
}

function normalizeSourceType(type: string | null): NonNullable<TPlugin['source']>['type'] {
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

function normalizeContributions(value: unknown): TPluginMarketplaceContribution[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item): TPluginMarketplaceContribution | null => {
      const record = readRecord(item)
      const name = readString(record?.name)
      const type = readString(record?.type)
      if (!record || !name || !type) {
        return null
      }

      return {
        id: readString(record.id) ?? undefined,
        type,
        name,
        displayName: record.displayName as TPluginMarketplaceContribution['displayName'],
        description: record.description as TPluginMarketplaceContribution['description'],
        icon: normalizeOptionalIcon(record.icon),
        operations: normalizeOperations(record.operations),
        tags: readStringArray(record.tags),
        metadata: readRecord(record.metadata) ?? undefined
      }
    })
    .filter((item): item is TPluginMarketplaceContribution => !!item)
}

function normalizeOperations(value: unknown): TPluginMarketplaceOperation[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item): TPluginMarketplaceOperation | null => {
      const record = readRecord(item)
      const name = readString(record?.name)
      if (!record || !name) {
        return null
      }

      return {
        name,
        displayName: record.displayName as TPluginMarketplaceOperation['displayName'],
        description: record.description as TPluginMarketplaceOperation['description'],
        access: readString(record.access) ?? 'read',
        tags: readStringArray(record.tags)
      }
    })
    .filter((item): item is TPluginMarketplaceOperation => !!item)
}

function normalizePluginName(pluginName: string) {
  if (!pluginName?.includes('@')) return pluginName
  const lastAt = pluginName.lastIndexOf('@')
  return lastAt > 0 ? pluginName.slice(0, lastAt) : pluginName
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!item.trim()) : []
}
