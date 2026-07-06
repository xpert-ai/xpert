import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'

import { Component, computed, effect, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { getErrorMessage, injectHelpWebsite, injectToastr } from '@cloud/app/@core'
import { PluginComponent, TPlugin } from '@cloud/app/@shared/plugins'
import { injectActiveScope, injectPluginAPI, injectScopeLevel } from '@xpert-ai/cloud/state'
import { PLUGIN_LEVEL, RequestScopeLevel } from '@xpert-ai/contracts'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { myRxResource } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'

export type PluginInstallResult = {
  action: 'installed'
  pluginName?: string
  packageName?: string | null
}

type PluginInstallDialogData = {
  plugin: TPlugin
  reload: () => void
  refreshStrategies?: () => void
}

@Component({
  standalone: true,
  imports: [TranslateModule, FormsModule, NgmSpinComponent, PluginComponent],
  selector: 'xp-settings-plugin-install',
  templateUrl: './install.component.html',
  styleUrls: ['./install.component.scss']
})
export class PluginInstallComponent {
  readonly #dialogRef = inject<DialogRef<PluginInstallResult | undefined>>(DialogRef)
  readonly #data = inject<PluginInstallDialogData>(DIALOG_DATA)
  readonly installHelpUrl = injectHelpWebsite('/docs/plugin/install')
  readonly pluginAPI = injectPluginAPI()
  readonly #activeScope = injectActiveScope()
  readonly scopeLevel = injectScopeLevel()
  readonly #toastr = injectToastr()

  readonly plugin = signal(this.#data.plugin)
  readonly pluginName = computed(() => this.plugin()?.name)
  readonly #installedPlugin = myRxResource({
    request: () => {
      return {
        scope: this.#activeScope(),
        name: this.pluginName()
      }
    },
    loader: ({ request }) => {
      return request.name ? this.pluginAPI.getByNames([request.name]) : null
    }
  })
  readonly installed = computed(() => this.#installedPlugin.value()?.[0])
  readonly installedVersion = computed(() => this.installed()?.meta?.version)
  readonly latestVersion = signal<string | null>(null)
  readonly pluginVersion = computed(() => this.latestVersion() ?? this.plugin()?.version)
  readonly systemPluginUnavailableInCurrentScope = computed(
    () => this.plugin()?.level === PLUGIN_LEVEL.SYSTEM && this.scopeLevel() !== RequestScopeLevel.TENANT
  )

  readonly status = signal<'idle' | 'installing' | 'installed' | 'error'>('idle')
  readonly error = signal<string | null>(null)

  constructor() {
    effect((onCleanup) => {
      const name = this.pluginName()
      if (!name) {
        this.latestVersion.set(null)
        return
      }

      let cancelled = false
      onCleanup(() => {
        cancelled = true
      })

      const encoded = encodeURIComponent(name)
      fetch(`https://registry.npmjs.org/${encoded}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled) return
          const latest = data?.['dist-tags']?.latest
          this.latestVersion.set(latest ?? null)
        })
        .catch(() => {
          if (!cancelled) {
            this.latestVersion.set(null)
          }
        })
    })
  }

  close() {
    this.#dialogRef.close(this.hasInstalledPlugin() ? this.createInstallResult() : undefined)
  }

  install() {
    if (this.systemPluginUnavailableInCurrentScope()) {
      return
    }

    this.status.set('installing')
    this.error.set(null)
    this.pluginAPI
      .install({
        pluginName: this.pluginName(),
        version: this.pluginVersion()
      })
      .subscribe({
        next: () => {
          this.status.set('installed')
          this.#installedPlugin.reload()
          this.#data.reload()
          this.#data.refreshStrategies?.()
        },
        error: (err) => {
          this.error.set(getErrorMessage(err))
          this.status.set('error')
        }
      })
  }

  private hasInstalledPlugin() {
    return this.status() === 'installed' || !!this.installed()
  }

  private createInstallResult(): PluginInstallResult {
    const plugin = this.plugin() as (TPlugin & { packageName?: string | null }) | undefined
    return {
      action: 'installed',
      pluginName: this.pluginName(),
      packageName: plugin?.packageName ?? plugin?.name ?? null
    }
  }
}
