import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { getErrorMessage, injectHelpWebsite, injectToastr } from '@cloud/app/@core'
import { PluginComponent, TPlugin } from '@cloud/app/@shared/plugins'
import { injectPluginAPI } from '@metad/cloud/state'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'


@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, FormsModule, NgmSpinComponent, PluginComponent],
  selector: 'xp-settings-plugin-install',
  templateUrl: './install.component.html',
  styleUrls: ['./install.component.scss'],
})
export class PluginInstallComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly #data = inject<TPlugin>(DIALOG_DATA)
  readonly installHelpUrl = injectHelpWebsite('/docs/plugin/install')
  readonly pluginAPI = injectPluginAPI()
  readonly #toastr = injectToastr()

  readonly plugin = signal(this.#data)
  readonly pluginName = computed(() => this.plugin()?.name)
  readonly #installedPlugin = myRxResource({
    request: () => {
      return {
        name: this.pluginName()
      }
    },
    loader: ({request}) => {
      return request.name ? this.pluginAPI.getByNames([request.name]) : null
    }
  })
  readonly installed = computed(() => this.#installedPlugin.value()?.[0])
  readonly installedVersion = computed(() => this.installed()?.meta?.version)
  readonly latestVersion = signal<string | null>(null)
  readonly pluginVersion = computed(() => this.latestVersion() ?? this.plugin()?.version)

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
    }, { allowSignalWrites: true })
  }

  close() {
    this.#dialogRef.close()
  }

  install() {
    this.status.set('installing')
    this.error.set(null)
    this.pluginAPI.create({
      pluginName: this.pluginName(),
      version: this.pluginVersion()
    }).subscribe({
      next: () => {
        this.status.set('installed')
      },
      error: (err) => {
        this.error.set(getErrorMessage(err))
        this.status.set('error')
      }
    })
  }
}
