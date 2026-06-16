import { CommonModule } from '@angular/common'
import { Component, computed, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { injectHelpWebsite, routeAnimations } from '@cloud/app/@core'
import { OverlayAnimations } from '@xpert-ai/core'
import { TranslateModule } from '@ngx-translate/core'
import { Dialog } from '@angular/cdk/dialog'
import { PluginComponent } from '@cloud/app/@shared/plugins'
import { injectScopeLevel } from '@xpert-ai/cloud/state'
import { PLUGIN_LEVEL, RequestScopeLevel } from '@xpert-ai/contracts'
import { PluginInstallComponent } from '../install/install.component'
import { TPluginWithDownloads } from '../types'
import { PluginsComponent } from '../plugins.component'
import { PluginMarketplaceDetailComponent } from '../marketplace/marketplace-detail.component'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, FormsModule, PluginComponent],
  selector: 'xp-settings-plugin',
  templateUrl: './plugin.component.html',
  styleUrls: ['./plugin.component.scss'],
  animations: [routeAnimations, ...OverlayAnimations]
})
export class SettingsPluginComponent {
  readonly pluginsComponent = inject(PluginsComponent)
  readonly #dialog = inject(Dialog)
  readonly scopeLevel = injectScopeLevel()
  readonly installHelpUrl = injectHelpWebsite('/docs/plugin/install')

  readonly plugin = input<TPluginWithDownloads>()
  readonly installed = computed(() => this.plugin()?.installed === true)
  readonly hasMarketplaceDetails = computed(() => !!this.plugin()?.contributions?.length)
  readonly isSystemPlugin = computed(() => this.plugin()?.level === PLUGIN_LEVEL.SYSTEM)
  readonly systemPluginUnavailableInCurrentScope = computed(
    () => !this.installed() && this.isSystemPlugin() && this.scopeLevel() !== RequestScopeLevel.TENANT
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
          reload: this.pluginsComponent.reload.bind(this.pluginsComponent),
          refreshStrategies: this.pluginsComponent.refreshStrategyCaches.bind(this.pluginsComponent)
        },
        disableClose: true
      })
      .closed.subscribe({
        next: (result) => {
          console.log('The dialog was closed', result)
        }
      })
  }

  viewDetails() {
    if (!this.plugin()) {
      return
    }
    this.#dialog.open(PluginMarketplaceDetailComponent, {
      data: {
        plugin: this.plugin()
      },
      backdropClass: 'backdrop-blur-sm-black'
    })
  }
}
