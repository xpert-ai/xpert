import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, model, signal, TemplateRef, viewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import {
  getErrorMessage,
  injectHelpWebsite,
  injectToastr,
  injectUser,
  routeAnimations,
  KnowledgebaseService,
  XpertAgentService,
  XpertToolsetService
} from '@cloud/app/@core'
import { environment } from '@cloud/environments/environment'
import { IconComponent } from '@cloud/app/@shared/avatar'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { injectActiveScope, injectPluginAPI } from '@xpert-ai/cloud/state'
import { OverlayAnimations } from '@xpert-ai/core'
import { injectConfirmDelete, NgmHighlightDirective, NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { debouncedSignal, linkedModel, myRxResource, NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { firstValueFrom } from 'rxjs'
import { I18nService } from '@cloud/app/@shared/i18n'
import { PluginConfigureComponent } from './configure/configure.component'
import { PluginsMarketplaceComponent } from './marketplace/marketplace.component'
import { ZardButtonComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { PluginMarketplaceDetailComponent } from './marketplace/marketplace-detail.component'
import { TInstalledPlugin } from './types'
import { IPluginInstallResult, IPluginUninstallResult, PluginMarketplaceCategory, RolesEnum } from '@xpert-ai/contracts'
import { PluginResourcesComponent } from './resources/resources.component'
import {
  marketplaceCategoryOptions as buildMarketplaceCategoryOptions,
  developerToolSubcategoryOptionsFor,
  groupPluginsByMarketplaceCategory,
  matchesPluginMarketplaceCategoryFilters,
  PLUGIN_MARKETPLACE_TARGET_APP
} from './plugin-marketplace-categories'
import {
  buildMarketplacePluginMetadataLookup,
  enrichInstalledPluginWithMarketplaceMetadata
} from './plugin-marketplace-metadata'
import { getInstalledPluginMarketplaceContributions, toPluginMarketplaceDetails } from './plugin-marketplace-details'
import { hasInstallableMarketplaceContribution } from './plugin-marketplace-installability'
import { pluginMarketplaceDetailCommands } from './plugin-marketplace-navigation'
import { PluginRuntimeRestartService } from './plugin-runtime-restart.service'

type TPluginComponentSummaryItem = {
  key: 'skills' | 'mcpServers' | 'apps' | 'hooks'
  count: number
  icon: string
  label: string
  defaultLabel: string
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    FormsModule,
    CdkMenuModule,
    ZardButtonComponent,
    ...ZardTooltipImports,
    NgmSelectComponent,
    NgmI18nPipe,
    NgmHighlightDirective,
    IconComponent,
    NgmSpinComponent,
    PluginsMarketplaceComponent
  ],
  selector: 'xp-settings-plugins',
  templateUrl: './plugins.component.html',
  styleUrls: ['./plugins.component.scss'],
  animations: [routeAnimations, ...OverlayAnimations]
})
export class PluginsComponent {
  #latestVersionsRequestId = 0
  readonly isDevEnvironment = !environment.production
  readonly router = inject(Router)
  readonly #dialog = inject(Dialog)
  readonly _category = injectQueryParams<'plugins' | 'marketplace'>('category')
  readonly releaseHelpUrl = injectHelpWebsite('/docs/plugin/release-to-xpert-marketplace')
  readonly i18nService = inject(I18nService)
  readonly pluginAPI = injectPluginAPI()
  readonly #activeScope = injectActiveScope()
  readonly currentUser = injectUser()
  readonly #toastr = injectToastr()
  readonly confirmDelete = injectConfirmDelete()
  readonly #agentService = inject(XpertAgentService)
  readonly #knowledgebaseService = inject(KnowledgebaseService)
  readonly #toolsetService = inject(XpertToolsetService)
  readonly runtimeRestart = inject(PluginRuntimeRestartService)
  readonly marketplace = viewChild(PluginsMarketplaceComponent)
  readonly npmInstallDialog = viewChild('npmInstallDialog', { read: TemplateRef })
  readonly localInstallDialog = viewChild('localInstallDialog', { read: TemplateRef })
  readonly archiveInstallDialog = viewChild('archiveInstallDialog', { read: TemplateRef })

  readonly category = linkedModel({
    initialValue: this._category() ?? 'plugins',
    compute: () => this._category() ?? 'plugins',
    update: (value) => {
      this.router.navigate([], {
        queryParams: { category: value },
        queryParamsHandling: 'merge'
      })
    }
  })

  readonly #plugins = myRxResource({
    request: () => ({
      scope: this.#activeScope()
    }),
    loader: () => this.pluginAPI.getPlugins()
  })

  readonly #installedMarketplace = myRxResource({
    request: () => ({
      scope: this.#activeScope()
    }),
    loader: () => this.pluginAPI.getMarketplace({ targetApp: PLUGIN_MARKETPLACE_TARGET_APP })
  })

  readonly pluginsLoading = computed(() => this.#plugins.status() === 'loading')
  readonly pluginsError = computed(() => {
    const error = this.#plugins.error()
    return error ? getErrorMessage(error) : null
  })

  readonly #marketplacePluginsByName = computed(() =>
    buildMarketplacePluginMetadataLookup(this.#installedMarketplace.value()?.items ?? [])
  )

  readonly #basePlugins = computed(() => {
    const marketplacePluginsByName = this.#marketplacePluginsByName()
    return (this.#plugins.value() ?? []).map((plugin, index) => {
      const enrichedPlugin = enrichInstalledPluginWithMarketplaceMetadata(plugin, marketplacePluginsByName)

      return {
        ...enrichedPlugin,
        __trackId: this.buildPluginTrackId(plugin, index)
      }
    })
  })
  readonly plugins = signal<Array<TInstalledPlugin>>([])
  readonly removing = signal('')
  readonly updating = signal('')
  readonly refreshing = signal('')
  readonly npmPackageName = model('')
  readonly npmPackageVersion = model('')
  readonly npmInstalling = signal(false)
  readonly npmInstallError = signal<string | null>(null)
  readonly localPluginName = model('')
  readonly localWorkspacePath = model('')
  readonly localInstalling = signal(false)
  readonly localInstallError = signal<string | null>(null)
  readonly archiveFile = signal<File | null>(null)
  readonly archiveInstalling = signal(false)
  readonly archiveInstallError = signal<string | null>(null)

  readonly searchText = model('')
  readonly #searchText = debouncedSignal(this.searchText, 300)

  readonly marketplaceCategories = model<PluginMarketplaceCategory[]>([])
  readonly developerToolSubcategories = model<string[]>([])
  readonly keywords = model<string[]>([])
  readonly marketplaceLoading = computed(() => this.marketplace()?.loading() ?? true)
  readonly marketplaceRefreshingSource = computed(() => this.marketplace()?.refreshingSource() ?? false)
  readonly isSuperAdmin = computed(() => this.currentUser()?.role?.name === RolesEnum.SUPER_ADMIN)
  readonly showDeveloperToolSubcategoryFilter = computed(
    () => this.marketplaceCategories().length === 0 || this.marketplaceCategories().includes('developer-tools')
  )

  readonly filteredPlugins = computed(() => {
    const searchText = this.#searchText().toLowerCase()
    let plugins = this.plugins()
    if (this.marketplaceCategories().length || this.developerToolSubcategories().length) {
      plugins = plugins.filter((plugin) =>
        matchesPluginMarketplaceCategoryFilters(
          {
            category: plugin.meta.category,
            targetAppMeta: plugin.meta.targetAppMeta
          },
          this.marketplaceCategories(),
          this.developerToolSubcategories()
        )
      )
    }
    if (this.keywords().length) {
      plugins = plugins.filter(
        (plugin) =>
          plugin.meta.keywords?.length && plugin.meta.keywords.some((keyword) => this.keywords().includes(keyword))
      )
    }
    if (searchText) {
      plugins = plugins.filter(
        (plugin) =>
          plugin.meta.description?.toLowerCase().includes(searchText) ||
          plugin.meta.displayName?.toLowerCase().includes(searchText) ||
          (typeof plugin.name === 'string' && plugin.name.toLowerCase().includes(searchText)) ||
          plugin.meta.keywords?.some((keyword) => keyword.toLowerCase().includes(searchText))
      )
    }
    return plugins
  })

  readonly pluginCategoryGroups = computed(() =>
    groupPluginsByMarketplaceCategory(
      this.filteredPlugins().map((plugin) => ({
        ...plugin,
        category: plugin.meta.category,
        targetAppMeta: plugin.meta.targetAppMeta
      }))
    )
  )

  readonly marketplaceCategoryOptions = computed(() => {
    return buildMarketplaceCategoryOptions().map((category) => ({
      label: this.i18nService.instant(category.labelKey, { Default: category.defaultLabel }),
      value: category.value
    }))
  })

  readonly developerToolSubcategoryOptions = computed(() => {
    return developerToolSubcategoryOptionsFor(
      this.plugins().map((plugin) => ({
        category: plugin.meta.category,
        targetAppMeta: plugin.meta.targetAppMeta
      }))
    ).map((category) => ({
      label: this.i18nService.instant(category.labelKey, { Default: category.defaultLabel }),
      value: category.value
    }))
  })

  readonly #keywords = computed(() => {
    const keywords = new Set<string>()
    this.plugins().forEach((plugin) => {
      if (plugin.loadStatus !== 'failed' && plugin.meta.keywords) {
        plugin.meta.keywords.forEach((keyword) => keywords.add(keyword))
      }
    })
    return Array.from(keywords)
  })

  readonly keywordsOptions = computed(() => {
    return this.#keywords().map((keyword) => ({
      label: keyword,
      value: keyword
    }))
  })

  // constructor() {
  //   effect(() => {
  //     console.log(this.filteredPlugins())
  //   })
  // }

  constructor() {
    effect(
      () => {
        this.#activeScope()
        this.#latestVersionsRequestId += 1
        this.removing.set('')
        this.updating.set('')
        this.refreshing.set('')
      },
      { allowSignalWrites: true }
    )

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
        const basePlugins = this.#basePlugins()
        this.plugins.set(basePlugins)

        const requestId = ++this.#latestVersionsRequestId
        const pluginNames = Array.from(
          new Set(
            basePlugins
              .filter((plugin) => plugin.canUpdate)
              .map((plugin) => plugin.name)
              .filter((name): name is string => !!name)
          )
        )

        if (!pluginNames.length) {
          return
        }

        void this.loadLatestPluginVersions(pluginNames, requestId)
      },
      { allowSignalWrites: true }
    )
  }

  private buildPluginTrackId(plugin: TInstalledPlugin, index: number): string {
    const name =
      typeof plugin?.name === 'string'
        ? plugin.name
        : typeof plugin?.meta?.name === 'string'
          ? plugin.meta.name
          : `plugin-${index}`
    const scope =
      typeof plugin?.organizationId === 'string' ? plugin.organizationId : plugin?.isGlobal ? 'global' : 'org'

    return `${scope}:${name}:${index}`
  }

  toggleKeyword(keyword: string) {
    this.keywords.update((keywords) => {
      if (keywords.includes(keyword)) {
        return keywords.filter((k) => k !== keyword)
      } else {
        return [...keywords, keyword]
      }
    })
  }

  sdkCompatibilityWarningMessage(plugin: TInstalledPlugin) {
    return (
      plugin.sdkCompatibilityWarnings
        ?.map((warning) => warning.message)
        .filter(Boolean)
        .join('\n') ?? ''
    )
  }

  componentSummaryItems(plugin: TInstalledPlugin): TPluginComponentSummaryItem[] {
    const summary = plugin.componentSummary
    if (!summary?.total) {
      return []
    }

    const items: TPluginComponentSummaryItem[] = [
      {
        key: 'skills',
        count: summary.skills,
        icon: 'ri-book-open-line',
        label: 'PAC.Plugin.ComponentSkills',
        defaultLabel: 'Skills'
      },
      {
        key: 'mcpServers',
        count: summary.mcpServers,
        icon: 'ri-server-line',
        label: 'PAC.Plugin.ComponentMcpServers',
        defaultLabel: 'MCP servers'
      },
      {
        key: 'apps',
        count: summary.apps,
        icon: 'ri-apps-2-line',
        label: 'PAC.Plugin.ComponentApps',
        defaultLabel: 'Apps'
      },
      {
        key: 'hooks',
        count: summary.hooks,
        icon: 'ri-terminal-box-line',
        label: 'PAC.Plugin.ComponentHooks',
        defaultLabel: 'Hooks'
      }
    ]

    return items.filter((item) => item.count > 0)
  }

  hasInstallablePluginContent(plugin: TInstalledPlugin) {
    return (
      plugin.loadStatus !== 'failed' &&
      (this.hasInstallableBundleResources(plugin) || this.hasInstallableMarketplaceContributions(plugin))
    )
  }

  hasInstallableBundleResources(plugin: TInstalledPlugin) {
    const summary = plugin.componentSummary
    return !!summary && (summary.skills > 0 || summary.mcpServers > 0 || summary.apps > 0 || summary.hooks > 0)
  }

  hasInstallableMarketplaceContributions(plugin: TInstalledPlugin) {
    return getInstalledPluginMarketplaceContributions(plugin).some(hasInstallableMarketplaceContribution)
  }

  reload() {
    this.reloadInstalledPlugins()
  }

  refreshMarketplaceSource() {
    if (!this.isSuperAdmin()) {
      return
    }
    this.marketplace()?.refreshSelectedSource()
  }

  openAddMarketplace() {
    this.marketplace()?.openAddSource()
  }

  openManageRegisteredPlugins() {
    this.marketplace()?.openRegistryManager()
  }

  configure(plugin: TInstalledPlugin) {
    if (!plugin.canConfigure || !plugin.configSchema) {
      return
    }

    this.#dialog.open(PluginConfigureComponent, {
      data: {
        plugin,
        reload: this.reload.bind(this)
      },
      backdropClass: 'backdrop-blur-sm-black'
    })
  }

  openPluginDetails(plugin: TInstalledPlugin) {
    this.#dialog.open(PluginMarketplaceDetailComponent, {
      data: {
        plugin: toPluginMarketplaceDetails(plugin)
      },
      backdropClass: 'backdrop-blur-sm-black'
    })
  }

  openPluginPage(plugin: TInstalledPlugin) {
    const pluginName = plugin.packageName ?? plugin.meta.name ?? plugin.name
    this.router.navigate(pluginMarketplaceDetailCommands(pluginName))
  }

  openInstallOptions(plugin: TInstalledPlugin) {
    if (!this.hasInstallablePluginContent(plugin)) {
      return
    }

    if (this.hasInstallableMarketplaceContributions(plugin)) {
      this.openPluginDetails(plugin)
      return
    }

    this.initializeResources(plugin)
  }

  initializeResources(plugin: TInstalledPlugin) {
    this.#dialog.open(PluginResourcesComponent, {
      data: {
        plugin,
        reload: this.reload.bind(this)
      },
      backdropClass: 'backdrop-blur-sm-black'
    })
  }

  uninstall(plugin: TInstalledPlugin) {
    if (!plugin.canUninstall) {
      return
    }

    this.confirmDelete(
      {
        title: this.i18nService.instant('PAC.Plugin.Uninstall_Title', { Default: 'Uninstall Plugin' }),
        information: this.i18nService.instant('PAC.Plugin.Uninstall_Message', {
          Default: `Are you sure you want to uninstall plugin "${plugin.meta?.displayName || plugin.name}"?`
        })
      },
      () => {
        this.removing.set(plugin.name)
        return this.pluginAPI.uninstall([plugin.name], plugin.organizationId, plugin.scopeKey)
      }
    ).subscribe({
      next: (result) => {
        this.removing.set('')
        this.reloadInstalledPlugins()
        if ((result as IPluginUninstallResult).restartRequired) {
          this.showRestartRequired(plugin.name)
        } else {
          this.refreshStrategyCaches()
        }
      },
      error: () => {
        this.removing.set('')
      }
    })
  }

  update(plugin: TInstalledPlugin) {
    if (!plugin.canUpdate || !plugin.hasUpdate) {
      return
    }

    this.updating.set(plugin.name)
    this.pluginAPI.update(plugin.name).subscribe({
      next: (result) => {
        this.updating.set('')
        this.reloadInstalledPlugins()
        if (result.restartRequired) {
          this.showRestartRequired(plugin.name)
          return
        }
        this.refreshStrategyCaches()
        if (result.updated) {
          this.#toastr.success(
            `${plugin.meta?.displayName || plugin.name} updated to ${result.currentVersion ?? 'latest'}`
          )
        } else {
          this.#toastr.info({
            code: `${plugin.meta?.displayName || plugin.name} is already on the latest version`,
            default: `${plugin.meta?.displayName || plugin.name} is already on the latest version`
          })
        }
      },
      error: (err) => {
        this.updating.set('')
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  refresh(plugin: TInstalledPlugin) {
    if (!plugin.canRefresh) {
      return
    }

    this.refreshing.set(plugin.name)
    this.pluginAPI.refresh(plugin.name).subscribe({
      next: (result) => {
        this.refreshing.set('')
        this.reloadInstalledPlugins()
        if (result.restartRequired) {
          this.showRestartRequired(plugin.name)
          return
        }
        this.refreshStrategyCaches()
        this.#toastr.success('PAC.Plugin.RefreshPluginSuccess', {
          Default: `${plugin.meta?.displayName || plugin.name} reloaded from local workspace`
        })
      },
      error: (err) => {
        this.refreshing.set('')
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  installNpm() {
    const template = this.npmInstallDialog()
    if (!template) {
      return
    }
    this.npmInstallError.set(null)
    this.npmInstalling.set(false)
    this.npmPackageName.set('')
    this.npmPackageVersion.set('')
    const dialogRef = this.#dialog.open(template, {
      backdropClass: 'backdrop-blur-sm-black',
      minWidth: '400px'
    })
    dialogRef.closed.subscribe(() => {
      this.npmInstalling.set(false)
    })
  }

  installLocal() {
    const template = this.localInstallDialog()
    if (!template) {
      return
    }

    this.localInstallError.set(null)
    this.localInstalling.set(false)

    const dialogRef = this.#dialog.open(template, {
      backdropClass: 'backdrop-blur-sm-black',
      minWidth: '480px'
    })
    dialogRef.closed.subscribe(() => {
      this.localInstalling.set(false)
    })
  }

  installArchive() {
    const template = this.archiveInstallDialog()
    if (!template) {
      return
    }

    this.archiveFile.set(null)
    this.archiveInstallError.set(null)
    this.archiveInstalling.set(false)

    const dialogRef = this.#dialog.open(template, {
      backdropClass: 'backdrop-blur-sm-black',
      minWidth: '480px'
    })
    dialogRef.closed.subscribe(() => {
      this.archiveInstalling.set(false)
    })
  }

  selectArchiveFile(event: Event) {
    const input = event.target as HTMLInputElement
    this.archiveFile.set(input.files?.[0] ?? null)
    this.archiveInstallError.set(null)
  }

  clearArchiveFile(input: HTMLInputElement) {
    input.value = ''
    this.archiveFile.set(null)
    this.archiveInstallError.set(null)
  }

  confirmInstallNpm(dialogRef: DialogRef) {
    const packageName = this.npmPackageName()?.trim()
    if (!packageName) {
      return
    }
    this.npmInstalling.set(true)
    this.npmInstallError.set(null)
    const version = this.npmPackageVersion()?.trim()
    this.pluginAPI
      .install({
        pluginName: packageName,
        version: version || undefined,
        source: 'npm'
      })

      .subscribe({
        next: (result) => {
          this.npmInstalling.set(false)
          this.handleInstallSuccess(dialogRef, result)
        },
        error: (err) => {
          this.npmInstallError.set(getErrorMessage(err))
          this.npmInstalling.set(false)
        }
      })
  }

  confirmInstallLocal(dialogRef: DialogRef) {
    const pluginName = this.localPluginName()?.trim()
    const workspacePath = this.localWorkspacePath()?.trim()
    if (!pluginName || !workspacePath) {
      return
    }

    this.localInstalling.set(true)
    this.localInstallError.set(null)
    this.pluginAPI
      .install({
        pluginName,
        source: 'code',
        sourceConfig: {
          workspacePath
        }
      })
      .subscribe({
        next: (result) => {
          this.localInstalling.set(false)
          this.handleInstallSuccess(dialogRef, result)
        },
        error: (err) => {
          this.localInstallError.set(getErrorMessage(err))
          this.localInstalling.set(false)
        }
      })
  }

  confirmInstallArchive(dialogRef: DialogRef) {
    const file = this.archiveFile()
    if (!file) {
      return
    }

    this.archiveInstalling.set(true)
    this.archiveInstallError.set(null)
    this.pluginAPI.installArchive(file).subscribe({
      next: (result) => {
        this.archiveInstalling.set(false)
        this.handleInstallSuccess(dialogRef, result)
      },
      error: (err) => {
        this.archiveInstallError.set(getErrorMessage(err))
        this.archiveInstalling.set(false)
      }
    })
  }

  private handleInstallSuccess(dialogRef: DialogRef, result: IPluginInstallResult) {
    dialogRef.close()
    this.reloadInstalledPlugins()
    if (result.restartRequired) {
      this.showRestartRequired(result.packageName || result.name)
    } else {
      this.refreshStrategyCaches()
    }
  }

  private showRestartRequired(pluginName?: string | null) {
    this.runtimeRestart.markRequired(pluginName)
    void this.runtimeRestart.prompt()
  }

  private reloadInstalledPlugins() {
    this.#latestVersionsRequestId += 1
    this.plugins.update((plugins) =>
      plugins.map((plugin) => ({
        ...plugin,
        latestVersion: undefined,
        hasUpdate: false
      }))
    )
    this.#plugins.reload()
  }

  private buildPluginVersionStatusKey(organizationId: string | undefined, name: string) {
    return `${organizationId ?? ''}:${name}`
  }

  private async loadLatestPluginVersions(pluginNames: string[], requestId: number) {
    try {
      const latestVersions = await firstValueFrom(this.pluginAPI.getLatestVersions(pluginNames))
      if (requestId !== this.#latestVersionsRequestId) {
        return
      }

      const latestVersionMap = new Map(
        latestVersions.map((plugin) => [this.buildPluginVersionStatusKey(plugin.organizationId, plugin.name), plugin])
      )

      this.plugins.update((plugins) =>
        plugins.map((plugin) => {
          const latestVersion = latestVersionMap.get(
            this.buildPluginVersionStatusKey(plugin.organizationId, plugin.name)
          )
          if (!latestVersion) {
            return plugin
          }

          return {
            ...plugin,
            latestVersion: latestVersion.latestVersion,
            hasUpdate: latestVersion.hasUpdate
          }
        })
      )
    } catch {
      if (requestId !== this.#latestVersionsRequestId) {
        return
      }
    }
  }

  /**
   * Refresh all strategy caches after plugin install/uninstall
   */
  refreshStrategyCaches() {
    this.#agentService.refresh()
    this.#knowledgebaseService.refresh()
    this.#toolsetService.refresh()
  }
}
