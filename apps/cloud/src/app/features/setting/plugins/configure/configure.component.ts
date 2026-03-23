import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal, viewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { getErrorMessage, injectToastr } from '@cloud/app/@core'
import { JSONSchemaFormComponent } from '@cloud/app/@shared/forms'
import { injectPluginAPI, IPluginConfiguration, PLUGIN_CONFIGURATION_STATUS } from '@metad/cloud/state'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { TInstalledPlugin } from '../types'

type TPluginConfigureDialogData = {
  plugin: TInstalledPlugin
  reload: () => void
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, JSONSchemaFormComponent, NgmSpinComponent],
  selector: 'xp-settings-plugin-configure',
  templateUrl: './configure.component.html'
})
export class PluginConfigureComponent {
  private readonly dialogRef = inject(DialogRef)
  private readonly data = inject<TPluginConfigureDialogData>(DIALOG_DATA)
  private readonly toastr = injectToastr()
  private readonly pluginAPI = injectPluginAPI()

  readonly form = viewChild(JSONSchemaFormComponent)
  readonly plugin = signal(this.data.plugin)
  readonly schema = computed(() => this.plugin()?.configSchema)
  readonly needsConfiguration = computed(
    () => this.plugin()?.configurationStatus === PLUGIN_CONFIGURATION_STATUS.INVALID
  )
  readonly configurationError = computed(() => this.plugin()?.configurationError)
  readonly config = model<Record<string, any>>({})
  readonly loading = signal(true)
  readonly saving = signal(false)
  readonly error = signal<string | null>(null)
  readonly invalid = computed(() => {
    return this.loading() || this.saving() || !!this.form()?.invalid
  })

  constructor() {
    this.loadConfiguration()
  }

  close() {
    if (!this.saving()) {
      this.dialogRef.close()
    }
  }

  save() {
    const pluginName = this.plugin()?.name
    if (!pluginName || this.invalid()) {
      return
    }

    this.error.set(null)
    this.saving.set(true)
    this.pluginAPI.saveConfiguration(pluginName, this.config() ?? {}).subscribe({
      next: (result) => {
        this.config.set(result.config ?? {})
        this.saving.set(false)
        this.toastr.success('Plugin configuration saved successfully', 'Plugin Configuration')
        this.data.reload?.()
        this.dialogRef.close(result)
      },
      error: (error) => {
        this.error.set(getErrorMessage(error))
        this.saving.set(false)
      }
    })
  }

  private loadConfiguration() {
    const pluginName = this.plugin()?.name
    if (!pluginName) {
      this.loading.set(false)
      this.error.set('Plugin name is missing')
      return
    }

    this.loading.set(true)
    this.error.set(null)
    this.pluginAPI.getConfiguration(pluginName).subscribe({
      next: (result: IPluginConfiguration) => {
        this.config.set(result.config ?? {})
        this.plugin.update((plugin) =>
          plugin
            ? {
                ...plugin,
                configurationStatus: result.configurationStatus,
                configurationError: result.configurationError
              }
            : plugin
        )
        this.loading.set(false)
      },
      error: (error) => {
        this.error.set(getErrorMessage(error))
        this.loading.set(false)
      }
    })
  }
}
