import { CommonModule } from '@angular/common'
import { Component, computed, inject, input, output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { injectHelpWebsite, routeAnimations } from '@cloud/app/@core'
import { OverlayAnimations } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { Dialog } from '@angular/cdk/dialog'
import { Router } from '@angular/router'
import { PluginComponent } from '@cloud/app/@shared/plugins'
import { injectScopeLevel, Store } from '@cloud/app/@core/state'
import { PLUGIN_LEVEL, RequestScopeLevel } from '@xpert-ai/contracts'
import { PluginInstallComponent, PluginInstallResult } from '../install/install.component'
import { TPluginWithDownloads } from '../types'
import { PluginMarketplaceDetailComponent } from '../marketplace/marketplace-detail.component'
import { pluginMarketplaceDetailCommands } from '../plugin-marketplace-navigation'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, FormsModule, PluginComponent],
  selector: 'xp-settings-plugin',
  templateUrl: './plugin.component.html',
  styleUrls: ['./plugin.component.scss'],
  animations: [routeAnimations, ...OverlayAnimations]
})
export class SettingsPluginComponent {
  readonly #dialog = inject(Dialog)
  readonly #router = inject(Router)
  readonly #store = inject(Store)
  readonly scopeLevel = injectScopeLevel()
  readonly installHelpUrl = injectHelpWebsite('/docs/plugin/install')

  readonly plugin = input<TPluginWithDownloads>()
  readonly publicCatalog = input(false)
  readonly reloadInstalledPlugins = input<() => void>(() => undefined)
  readonly refreshStrategies = input<(() => void) | undefined>()
  readonly pluginInstalled = output<TPluginWithDownloads>()
  readonly installed = computed(() => this.plugin()?.installed === true)
  readonly hasMarketplaceDetails = computed(() => !!this.plugin()?.contributions?.length)
  readonly isSystemPlugin = computed(() => this.plugin()?.level === PLUGIN_LEVEL.SYSTEM)
  readonly isTenantPlugin = computed(() => this.plugin()?.level === PLUGIN_LEVEL.TENANT)
  readonly systemPluginUnavailableInCurrentScope = computed(
    () =>
      !this.installed() &&
      (!this.publicCatalog() || !!this.#store.token) &&
      (this.isSystemPlugin() || this.isTenantPlugin()) &&
      this.scopeLevel() !== RequestScopeLevel.TENANT
  )
  readonly canInstall = computed(
    () => !!this.plugin() && !this.installed() && !this.systemPluginUnavailableInCurrentScope()
  )

  install() {
    const plugin = this.plugin()
    if (!plugin || !this.canInstall()) {
      return
    }

    this.#dialog
      .open(PluginInstallComponent, {
        data: {
          plugin,
          reload: this.reloadInstalledPlugins(),
          refreshStrategies: this.refreshStrategies()
        },
        disableClose: true
      })
      .closed.subscribe({
        next: (result) => {
          if (isPluginInstallResult(result)) {
            this.emitPluginInstalled(plugin)
          }
        }
      })
  }

  private emitPluginInstalled(plugin: TPluginWithDownloads) {
    this.pluginInstalled.emit({
      ...plugin,
      installed: true
    })
  }

  openPluginPage(event?: MouseEvent) {
    event?.stopPropagation()
    const plugin = this.plugin()
    if (!plugin) {
      return
    }

    if (this.publicCatalog()) {
      this.viewDetails()
      return
    }

    this.#router.navigate(pluginMarketplaceDetailCommands(plugin.packageName ?? plugin.name), {
      queryParams: {
        ...(plugin.sourceId ? { sourceId: plugin.sourceId } : {})
      }
    })
  }

  viewDetails() {
    if (!this.plugin()) {
      return
    }
    this.#dialog.open(PluginMarketplaceDetailComponent, {
      data: {
        plugin: this.plugin(),
        showActions: !this.publicCatalog()
      },
      backdropClass: 'backdrop-blur-sm-black'
    })
  }
}

function isPluginInstallResult(result: unknown): result is PluginInstallResult {
  return !!result && typeof result === 'object' && Reflect.get(result, 'action') === 'installed'
}
