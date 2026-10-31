import { ZardTableImports, ZardCheckboxComponent } from '@xpert-ai/headless-ui'
import { ZardSelectImports } from '@xpert-ai/headless-ui'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  EnabledModelSelection,
  ICopilotProvider,
  isConfiguredModelAvailable,
  isProviderModelEnabled,
  modelIdentityKey,
  ProviderModelCatalog
} from '@xpert-ai/contracts'
import { XpDialogFrameImports, ZardButtonComponent, ZardInputDirective, XpI18nPipe } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { CopilotProviderService, getErrorMessage } from '../../../@core'

@Component({
  standalone: true,
  selector: 'xp-enabled-models-dialog',
  imports: [
    ...ZardTableImports,
    ZardCheckboxComponent,
    ...ZardSelectImports,
    FormsModule,
    TranslateModule,
    ...XpDialogFrameImports,
    ZardButtonComponent,
    ZardInputDirective,
    XpI18nPipe
  ],
  templateUrl: './models.component.html'
})
export class EnabledModelsDialogComponent {
  readonly data = inject<{ provider: ICopilotProvider }>(DIALOG_DATA)
  readonly dialog = inject(DialogRef<boolean>)
  readonly service = inject(CopilotProviderService)
  readonly loading = signal(true)
  readonly saving = signal(false)
  readonly error = signal('')
  readonly search = signal('')
  readonly modelType = signal('')
  readonly modelTypes = computed(() => [...new Set(this.rows().map((row) => row.modelType))])
  toggleFiltered(enabled: boolean) {
    this.selected.update((current) => {
      const next = new Set(current)
      for (const row of this.filtered())
        if (row.available) {
          enabled ? next.add(this.key(row)) : next.delete(this.key(row))
        }
      return next
    })
  }
  readonly catalog = signal<ProviderModelCatalog | null>(null)
  readonly selected = signal(new Set<string>())
  readonly rows = computed(() => {
    const catalog = this.catalog()
    const rows = new Map<string, EnabledModelSelection & { available: boolean }>()
    for (const model of catalog?.builtin ?? []) {
      const entry = { model: model.model, modelType: model.model_type }
      rows.set(modelIdentityKey(entry), {
        ...entry,
        available: !model.deprecated && isConfiguredModelAvailable(this.data.provider, null)
      })
    }
    for (const model of catalog?.custom ?? []) {
      const entry = { model: model.modelName, modelType: model.modelType }
      rows.set(modelIdentityKey(entry), {
        ...entry,
        available: model.isValid !== false && isConfiguredModelAvailable(this.data.provider, model)
      })
    }
    return [...rows.values()]
  })
  readonly filtered = computed(() =>
    this.rows().filter(
      (row) =>
        (!this.modelType() || row.modelType === this.modelType()) &&
        `${row.model} ${row.modelType}`.toLowerCase().includes(this.search().trim().toLowerCase())
    )
  )
  readonly key = modelIdentityKey
  constructor() {
    void this.load()
  }
  async load() {
    this.loading.set(true)
    this.error.set('')
    try {
      const catalog = await firstValueFrom(this.service.getModels(this.data.provider.id))
      this.catalog.set(catalog)
      this.selected.set(
        new Set(
          this.rows()
            .filter(
              (row) =>
                row.available && isProviderModelEnabled({ options: { enabledModels: catalog.enabledModels } }, row)
            )
            .map(modelIdentityKey)
        )
      )
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }
  toggle(row: EnabledModelSelection, checked: boolean) {
    this.selected.update((value) => {
      const next = new Set(value)
      checked ? next.add(this.key(row)) : next.delete(this.key(row))
      return next
    })
  }
  async save() {
    if (this.loading() || this.saving() || !this.catalog()) return
    this.saving.set(true)
    this.error.set('')
    try {
      await firstValueFrom(
        this.service.saveEnabledModels(
          this.data.provider.id,
          this.rows()
            .filter((row) => this.selected().has(this.key(row)))
            .map(({ model, modelType }) => ({ model, modelType }))
        )
      )
      this.dialog.close(true)
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.saving.set(false)
    }
  }
}
