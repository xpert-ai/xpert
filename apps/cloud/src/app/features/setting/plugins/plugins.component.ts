import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { CdkMenuModule } from "@angular/cdk/menu";
import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal, TemplateRef, viewChild } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { MatTooltipModule } from '@angular/material/tooltip'
import { getErrorMessage, injectHelpWebsite, routeAnimations } from '@cloud/app/@core'
import { IconComponent } from '@cloud/app/@shared/avatar'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { injectPluginAPI } from '@metad/cloud/state'
import { OverlayAnimations } from '@metad/core'
import { injectConfirmDelete, NgmHighlightDirective, NgmSpinComponent } from '@metad/ocap-angular/common'
import { debouncedSignal, linkedModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { I18nService } from '@cloud/app/@shared/i18n'
import { PluginsMarketplaceComponent } from './marketplace/marketplace.component'

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
    PluginsMarketplaceComponent,
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
  readonly confirmDelete = injectConfirmDelete()
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

  readonly #plugins = toSignal(this.pluginAPI.getPlugins(), { initialValue: [] })
  readonly plugins = linkedModel({
    initialValue: [],
    compute: () => this.#plugins(),
    update: (value) => {
      //
    }
  })
  readonly removing = signal('')
  readonly npmPackageName = model('')
  readonly npmPackageVersion = model('')
  readonly npmInstalling = signal(false)
  readonly npmInstallError = signal<string | null>(null)

  // readonly category = signal<'plugins' | 'marketplace'>('plugins')

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
          plugin.name.toLowerCase().includes(searchText) ||
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
      label: this.i18nService.instant('PAC.Plugin.Category_' + category, {Default: category}),
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
  //     console.log(this.plugins())
  //   })
  // }

  toggleKeyword(keyword: string) {
    this.keywords.update((keywords) => {
      if (keywords.includes(keyword)) {
        return keywords.filter((k) => k !== keyword)
      } else {
        return [...keywords, keyword]
      }
    })
  }

  uninstall(plugin: {name: string; meta: {displayName?: string}}) {
    this.confirmDelete({
      title: this.i18nService.instant('PAC.Plugin.Uninstall_Title', { Default: 'Uninstall Plugin' }),
      information: this.i18nService.instant('PAC.Plugin.Uninstall_Message', {
        Default: `Are you sure you want to uninstall plugin "${plugin.meta?.displayName || plugin.name}"?`
      }),
    }, () => {
      this.removing.set(plugin.name)
      return this.pluginAPI.uninstall([plugin.name])
    }).subscribe({
      next: () => {
        this.removing.set('')
        this.plugins.update((plugins) => plugins.filter((item) => item.name !== plugin.name))
      },
      error: () => {
        this.removing.set('')
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
    this.pluginAPI.create({
      pluginName: packageName,
      packageName,
      version: version || undefined,
      source: 'npm'
    }).subscribe({
      next: () => {
        this.npmInstalling.set(false)
        dialogRef.close()
        this.pluginAPI.getPlugins().subscribe((plugins) => this.plugins.set(plugins))
      },
      error: (err) => {
        this.npmInstallError.set(getErrorMessage(err))
        this.npmInstalling.set(false)
      }
    })
  }
}
