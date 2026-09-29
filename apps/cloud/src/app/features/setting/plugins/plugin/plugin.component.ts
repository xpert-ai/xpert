import { CommonModule } from '@angular/common'
import { Component, computed, DestroyRef, effect, inject, input, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { getErrorMessage, injectHelpWebsite, injectToastr, routeAnimations } from '@cloud/app/@core'
import { OverlayAnimations } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { Dialog } from '@angular/cdk/dialog'
import { Router } from '@angular/router'
import { PluginComponent } from '@cloud/app/@shared/plugins'
import { injectActiveScope, injectPluginAPI, injectScopeLevel, Store } from '@cloud/app/@core/state'
import { PLUGIN_LEVEL, RequestScopeLevel } from '@xpert-ai/contracts'
import { PluginInstallComponent, PluginInstallResult } from '../install/install.component'
import { TPluginWithDownloads } from '../types'
import { PluginMarketplaceDetailComponent } from '../marketplace/marketplace-detail.component'
import { pluginMarketplaceDetailCommands } from '../marketplace/plugin-marketplace-navigation'
import { normalizeMarketplacePlugin } from '../marketplace/plugin-marketplace-normalize'
import { firstValueFrom } from 'rxjs'

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
  readonly #pluginAPI = injectPluginAPI()
  readonly #scope = injectActiveScope()
  readonly #toastr = injectToastr()
  #destroyed = false
  readonly detailLoading = signal(false)
  readonly iconUrl = signal<string | null>(null)
  readonly scopeLevel = injectScopeLevel()
  readonly installHelpUrl = injectHelpWebsite('/docs/plugin/install')

  readonly plugin = input<TPluginWithDownloads>()
  readonly displayPlugin = computed(() => {
    const plugin = this.plugin()
    const url = this.iconUrl()
    return plugin && url ? { ...plugin, icon: { type: 'image' as const, value: url } } : plugin
  })
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

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true
    })
    effect(
      (onCleanup) => {
        this.#scope()
        const plugin = this.plugin()
        this.iconUrl.set(null)
        if (!plugin?.iconAsset) return
        let url: string | null = null
        const subscription = this.#pluginAPI
          .getMarketplaceIcon({
            name: plugin.packageName ?? plugin.name,
            hash: plugin.iconAsset,
            sourceId: plugin.sourceId ?? undefined,
            targetApp: 'xpert'
          })
          .subscribe({
            next: (blob) => {
              url = URL.createObjectURL(blob)
              this.iconUrl.set(url)
            },
            error: () => this.iconUrl.set(null)
          })
        onCleanup(() => {
          subscription.unsubscribe()
          if (url) URL.revokeObjectURL(url)
        })
      },
      { allowSignalWrites: true }
    )
  }

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

  async viewDetails() {
    let plugin = this.plugin()
    if (!plugin || this.detailLoading()) {
      return
    }
    if (plugin.summary) {
      const scope = this.#scope()
      this.detailLoading.set(true)
      try {
        plugin = normalizeMarketplacePlugin(
          await firstValueFrom(
            this.#pluginAPI.getMarketplacePlugin({
              name: plugin.packageName ?? plugin.name,
              sourceId: plugin.sourceId ?? undefined,
              targetApp: 'xpert'
            })
          )
        )
        if (this.#destroyed || scope !== this.#scope()) return
      } catch (error) {
        if (!this.#destroyed) this.#toastr.error(getErrorMessage(error))
        return
      } finally {
        this.detailLoading.set(false)
      }
    }
    this.#dialog.open(PluginMarketplaceDetailComponent, {
      data: {
        plugin,
        showActions: !this.publicCatalog()
      },
      backdropClass: 'backdrop-blur-xs-black'
    })
  }
}

function isPluginInstallResult(result: unknown): result is PluginInstallResult {
  return !!result && typeof result === 'object' && Reflect.get(result, 'action') === 'installed'
}
