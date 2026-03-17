import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal, TemplateRef, viewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { MatTooltipModule } from '@angular/material/tooltip'
import {
  getErrorMessage,
  injectHelpWebsite,
  injectToastr,
  routeAnimations,
  KnowledgebaseService,
  XpertAgentService,
  XpertToolsetService
} from '@cloud/app/@core'
import { IconComponent } from '@cloud/app/@shared/avatar'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { injectPluginAPI } from '@metad/cloud/state'
import { OverlayAnimations } from '@metad/core'
import { injectConfirmDelete, NgmHighlightDirective, NgmSpinComponent } from '@metad/ocap-angular/common'
import { debouncedSignal, linkedModel, myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { I18nService } from '@cloud/app/@shared/i18n'
import { PluginConfigureComponent } from './configure/configure.component'
import { PluginsMarketplaceComponent } from './marketplace/marketplace.component'
import { TInstalledPlugin } from './types'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    FormsModule,
    CdkMenuModule,
    MatTooltipModule,
    NgmSelectComponent,
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
  readonly router = inject(Router)
  readonly #dialog = inject(Dialog)
  readonly _category = injectQueryParams<'plugins' | 'marketplace'>('category')
  readonly releaseHelpUrl = injectHelpWebsite('/docs/plugin/release-to-xpert-marketplace')
  readonly i18nService = inject(I18nService)
  readonly pluginAPI = injectPluginAPI()
  readonly #toastr = injectToastr()
  readonly confirmDelete = injectConfirmDelete()
  readonly #agentService = inject(XpertAgentService)
  readonly #knowledgebaseService = inject(KnowledgebaseService)
  readonly #toolsetService = inject(XpertToolsetService)
  readonly npmInstallDialog = viewChild('npmInstallDialog', { read: TemplateRef })

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
    request: () => ({}),
    loader: () => this.pluginAPI.getPlugins()
  })

  readonly plugins = linkedModel({
    initialValue: [] as Array<TInstalledPlugin>,
    compute: () =>
      (this.#plugins.value() ?? []).map((plugin, index) => ({
        ...plugin,
        __trackId: this.buildPluginTrackId(plugin, index)
      })),
    update: () => {
      // No-op
    }
  })
  readonly removing = signal('')
  readonly updating = signal('')
  readonly npmPackageName = model('')
  readonly npmPackageVersion = model('')
  readonly npmInstalling = signal(false)
  readonly npmInstallError = signal<string | null>(null)

  readonly searchText = model('')
  readonly #searchText = debouncedSignal(this.searchText, 300)

  readonly categories = model<string[]>([])
  readonly keywords = model<string[]>([])

  readonly filteredPlugins = computed(() => {
    const searchText = this.#searchText().toLowerCase()
    let plugins = this.plugins()
    if (this.categories().length) {
      plugins = plugins.filter((plugin) => this.categories().includes(plugin.meta.category))
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

  readonly #categories = computed(() => {
    const categories = new Set<string>()
    this.plugins().forEach((plugin) => {
      if (plugin.meta.category) {
        categories.add(plugin.meta.category)
      }
    })
    return Array.from(categories)
  })

  readonly categoriesOptions = computed(() => {
    return this.#categories().map((category) => ({
      label: this.i18nService.instant('PAC.Plugin.Category_' + category, { Default: category }),
      value: category
    }))
  })

  readonly #keywords = computed(() => {
    const keywords = new Set<string>()
    this.plugins().forEach((plugin) => {
      if (plugin.meta.keywords) {
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

  reload() {
    this.#plugins.reload()
  }

  configure(plugin: TInstalledPlugin) {
    this.#dialog.open(PluginConfigureComponent, {
      data: {
        plugin,
        reload: this.reload.bind(this)
      },
      backdropClass: 'backdrop-blur-sm-black'
    })
  }

  uninstall(plugin: { name: string; meta: { displayName?: string } }) {
    this.confirmDelete(
      {
        title: this.i18nService.instant('PAC.Plugin.Uninstall_Title', { Default: 'Uninstall Plugin' }),
        information: this.i18nService.instant('PAC.Plugin.Uninstall_Message', {
          Default: `Are you sure you want to uninstall plugin "${plugin.meta?.displayName || plugin.name}"?`
        })
      },
      () => {
        this.removing.set(plugin.name)
        return this.pluginAPI.uninstall([plugin.name])
      }
    ).subscribe({
      next: () => {
        this.removing.set('')
        this.plugins.update((plugins) => plugins.filter((item) => item.name !== plugin.name))
        this.refreshStrategyCaches()
      },
      error: () => {
        this.removing.set('')
      }
    })
  }

  update(plugin: TInstalledPlugin) {
    this.updating.set(plugin.name)
    this.pluginAPI.update(plugin.name).subscribe({
      next: (result) => {
        this.updating.set('')
        this.#plugins.reload()
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

  confirmInstallNpm(dialogRef: DialogRef) {
    const packageName = this.npmPackageName()?.trim()
    if (!packageName) {
      return
    }
    this.npmInstalling.set(true)
    this.npmInstallError.set(null)
    const version = this.npmPackageVersion()?.trim()
    this.pluginAPI
      .create({
        pluginName: packageName,
        packageName,
        version: version || undefined,
        source: 'npm'
      })
      .subscribe({
        next: () => {
          this.npmInstalling.set(false)
          dialogRef.close()
          this.#plugins.reload()
          this.refreshStrategyCaches()
        },
        error: (err) => {
          this.npmInstallError.set(getErrorMessage(err))
          this.npmInstalling.set(false)
        }
      })
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
