import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog'
import { FormsModule } from '@angular/forms'
import { DecimalPipe } from '@angular/common'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  configuredModelSource,
  defaultModelConfiguration,
  ICopilotProvider,
  ModelDiscoveryItem,
  discoverableModelTypes,
  isDiscoverableModelType,
  modelConfigurationSchema,
  ModelImportInput,
  ModelImportResult
} from '@xpert-ai/contracts'
import { XpDialogFrameImports, ZardButtonComponent, ZardInputDirective, ZardSelectImports } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { injectCopilotProviderService } from '../../../@core/services/copilot-provider.service'
import { ModelConfigurationComponent } from '../model-configuration/configuration.component'
import { CopilotProviderModelComponent } from '../copilot-provider-model/model.component'
import { getErrorMessage } from '../../../@core/types'

type DiscoveryRow = ModelDiscoveryItem & { expanded: boolean }

@Component({
  standalone: true,
  selector: 'copilot-model-discovery',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './discovery.component.html',
  imports: [
    FormsModule,
    DecimalPipe,
    TranslateModule,
    ...XpDialogFrameImports,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardSelectImports,
    ModelConfigurationComponent
  ]
})
export class ModelDiscoveryComponent {
  readonly dialogRef = inject<DialogRef<ModelImportResult>>(DialogRef)
  readonly data = inject<{ provider: ICopilotProvider }>(DIALOG_DATA)
  readonly dialog = inject(Dialog)
  readonly loaded = signal(false)
  readonly service = injectCopilotProviderService()
  readonly rows = signal<DiscoveryRow[]>([])
  readonly loading = signal(false)
  readonly saving = signal(false)
  readonly error = signal('')
  readonly search = signal('')
  readonly modelTypes = discoverableModelTypes
  readonly visibleRows = computed(() => {
    const search = this.search().toLowerCase().trim()
    return this.rows().filter((row) => !search || `${row.model} ${row.label}`.toLowerCase().includes(search))
  })
  readonly newModels = computed(() => this.rows().filter((row) => !row.configured))
  readonly invalid = computed(
    () =>
      !this.loaded() || this.newModels().some((row) => !modelConfigurationSchema.safeParse(row.configuration).success)
  )

  constructor() {
    void this.load()
  }

  async load() {
    this.loading.set(true)
    this.error.set('')
    try {
      const result = await firstValueFrom(this.service.discoverModels(this.data.provider.id))
      this.rows.set(
        result.models.map((row) => ({
          ...row,
          expanded: false,
          modelType: row.configured ? row.modelType : (row.modelType ?? AiModelTypeEnum.LLM),
          configuration: row.configured
            ? row.configuration
            : (row.configuration ?? defaultModelConfiguration(row.modelType ?? AiModelTypeEnum.LLM))
        }))
      )
      this.loaded.set(true)
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }

  update(model: string, patch: Partial<DiscoveryRow>) {
    this.rows.update((rows) => rows.map((row) => (row.model === model && !row.configured ? { ...row, ...patch } : row)))
  }

  changeType(model: string, type: unknown) {
    if (isDiscoverableModelType(type))
      this.update(model, { modelType: type, configuration: defaultModelConfiguration(type) })
  }

  async editModel(row: DiscoveryRow) {
    if (!row.configuredModelId || this.saving()) return
    const result = await firstValueFrom(
      this.dialog.open(CopilotProviderModelComponent, {
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog',
        maxWidth: 'calc(100vw - 32px)',
        data: { provider: this.data.provider, modelId: row.configuredModelId, allowDelete: false }
      }).closed
    )
    if (!result) return
    // Re-read only the saved row; keep unimported rows' current choices intact.
    try {
      const saved = await firstValueFrom(this.service.getModel(this.data.provider.id, row.configuredModelId))
      this.rows.update((rows) =>
        rows.map((item) =>
          item.configuredModelId === saved.id
            ? {
                ...item,
                label: saved.modelName,
                modelType: isDiscoverableModelType(saved.modelType) ? saved.modelType : null,
                source: configuredModelSource(saved),
                configuration: saved.modelProperties?.model_configuration
              }
            : item
        )
      )
    } catch (error) {
      this.error.set(getErrorMessage(error))
    }
  }

  async save() {
    if (this.invalid() || this.saving()) return
    this.saving.set(true)
    this.error.set('')
    try {
      const input: ModelImportInput = {
        models: this.newModels().map((row) => ({
          model: row.model,
          configuration: modelConfigurationSchema.parse(row.configuration)
        }))
      }
      this.dialogRef.close(await firstValueFrom(this.service.importModels(this.data.provider.id, input)))
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.saving.set(false)
    }
  }
}
