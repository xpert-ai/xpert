import {
  AvailableModelDetailsDialogComponent,
  ModelDetailsData
} from '../model-presentation/available-model-details-dialog.component'
import { ModelAccessOwnershipScopeEnum } from '@xpert-ai/contracts'
import { ModelTypeIconComponent } from '../model-presentation/model-type-icon.component'
import { ModelCapabilityTagComponent } from '../model-presentation/model-capability-tag.component'
import { ZardTableImports, ZardBadgeComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ZardButtonComponent, ZardInputDirective, ZardSwitchComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { CdkConfirmDeleteComponent, XpSpinComponent } from '@xpert-ai/headless-ui'
import { XpI18nPipe } from '@xpert-ai/headless-ui'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { firstValueFrom, BehaviorSubject, EMPTY, switchMap } from 'rxjs'
import {
  getErrorMessage,
  ICopilotProviderModel,
  injectCopilotProviderService,
  TCopilotTokenUsage,
  ToastrService
} from '../../../@core'
import { CopilotProviderModelComponent } from '../copilot-provider-model/model.component'
import { CopilotAiProviderAuthComponent } from '../provider-authorization/authorization.component'
import { canCreateCustomProviderModel } from './provider-schema'
import { ProviderModelRow, providerModelRows, providerModelEnabled } from './provider-models'
import { EnabledModelsDialogComponent } from '../model-management/models.component'
import { ModelDiscoveryComponent } from '../model-discovery/discovery.component'
import { ModelImportResult, isConfiguredModelAvailable } from '@xpert-ai/contracts'

@Component({
  standalone: true,
  selector: 'copilot-provider',
  templateUrl: './provider.component.html',
  styleUrls: ['./provider.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ...ZardTableImports,
    ZardBadgeComponent,
    ZardIconComponent,
    ModelTypeIconComponent,
    ModelCapabilityTagComponent,
    CommonModule,
    FormsModule,
    TranslateModule,
    DragDropModule,
    ...ZardTooltipImports,
    ZardInputDirective,
    XpI18nPipe,
    XpSpinComponent,
    ZardSwitchComponent,
    ZardButtonComponent
  ],
  host: { class: 'block relative' }
})
export class CopilotProviderComponent {
  readonly #dialog = inject(Dialog)
  readonly #translate = inject(TranslateService)
  readonly #toastr = inject(ToastrService)
  readonly #i18n = new XpI18nPipe()
  readonly #copilotProviderService = injectCopilotProviderService()

  // Inputs
  readonly providerId = input<string>()
  readonly modelSearch = input('')
  readonly managedConnections = input(false)
  readonly readonly = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly usage = input<TCopilotTokenUsage>()

  // Outputs
  readonly deleted = output<void>()
  readonly addedModel = output<ICopilotProviderModel>()
  readonly modelsImported = output<ModelImportResult>()
  readonly changed = output<void>()

  readonly refresh$ = new BehaviorSubject<void>(null)
  readonly copilotProvider = derivedAsync(() => {
    return this.providerId()
      ? this.refresh$.pipe(
          switchMap(() => this.#copilotProviderService.getOneById(this.providerId(), { relations: ['copilot'] }))
        )
      : null
  })

  readonly background = computed(() => this.copilotProvider()?.provider?.background ?? 'transparent')
  readonly largeIcon = computed(() => this.copilotProvider()?.provider?.icon_large)
  readonly smallIcon = computed(() => this.copilotProvider()?.provider?.icon_small)
  readonly icon = computed(() => this.largeIcon() || this.smallIcon())
  readonly label = computed(() => this.copilotProvider()?.provider?.label)
  readonly supported_model_types = computed(() => this.copilotProvider()?.provider?.supported_model_types)
  readonly provider_credential_schema = computed(() => this.copilotProvider()?.provider?.provider_credential_schema)
  readonly canCustomizableModel = computed(() => canCreateCustomProviderModel(this.copilotProvider()?.provider))

  readonly #models = derivedAsync(() => {
    return this.providerId()
      ? this.refresh$.pipe(switchMap(() => this.#copilotProviderService.getModels(this.providerId())))
      : null
  })

  readonly modelRows = computed(() => providerModelRows(this.#models()))
  readonly matchedRows = computed(() => {
    const query = this.modelSearch().trim().toLowerCase()
    return query ? this.modelRows().filter((row) => row.name.toLowerCase().includes(query)) : []
  })
  readonly visibleRows = computed(() => (this.matchedRows().length ? this.matchedRows() : this.modelRows()))
  readonly modelsExpanded = computed(() => this.isShowModels() || this.matchedRows().length > 0)
  readonly discoverySupported = computed(() => this.#models()?.discoverySupported === true)

  readonly modelDiscovery = computed(() => this.#models()?.modelDiscovery)
  readonly modelCount = computed(() => this.modelRows().length)
  readonly enabledCount = computed(() => this.modelRows().filter((row) => this.rowEnabled(row)).length)
  rowEnabled(row: ProviderModelRow) {
    return providerModelEnabled(row, this.#models())
  }
  showProperties(row: ProviderModelRow) {
    const provider = this.copilotProvider()
    if (!provider) return
    const data: ModelDetailsData = {
      item: {
        copilotId: provider.copilotId,
        copilotModelId: row.name,
        model: row.name,
        modelLabel: row.label,
        provider: provider.providerName,
        providerLabel: provider.provider?.label,
        copilotName: provider.copilot?.name || provider.copilotId?.slice(0, 8),
        modelType: row.modelType,
        ownershipScope: provider.organizationId
          ? ModelAccessOwnershipScopeEnum.Organization
          : ModelAccessOwnershipScopeEnum.Tenant
      },
      metadata: { model: row.schema, providerId: provider.id, contextSize: row.contextSize }
    }
    this.#dialog.open(AvailableModelDetailsDialogComponent, {
      data,
      width: '800px',
      maxWidth: 'calc(100vw - 32px)',
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog'
    })
  }
  manageModels() {
    if (this.readonly() || !this.copilotProvider()) return
    this.#dialog
      .open<boolean>(EnabledModelsDialogComponent, {
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog',
        maxWidth: 'calc(100vw - 32px)',
        data: { provider: this.copilotProvider() }
      })
      .closed.subscribe((result) => {
        if (result) {
          this.refresh$.next()
          this.changed.emit()
        }
      })
  }
  modelAvailable(model: ICopilotProviderModel) {
    return isConfiguredModelAvailable({ options: { modelDiscovery: this.modelDiscovery() } }, model)
  }

  readonly loading = signal(false)

  readonly isShowModels = signal(false)

  readonly tokenRemain = computed(() => {
    const usage = this.usage()
    if (usage?.tokenLimit) {
      return ((usage.tokenLimit - usage.tokenUsed) / usage.tokenLimit) * 100
    }
    return 100
  })
  readonly usageWarn = computed(() => this.tokenRemain() < 40 && this.tokenRemain() > 1)
  readonly usageError = computed(() => this.tokenRemain() < 1)

  constructor() {
    effect(() => {
      // console.log(this.#models())
    })
  }

  toggleShowModels() {
    this.isShowModels.update((state) => !state)
  }

  delete() {
    if (this.readonly()) {
      return
    }
    this.#dialog
      .open(CdkConfirmDeleteComponent, {
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog',
        maxWidth: 'calc(100vw - 2rem)',
        data: {
          value: this.#i18n.transform(this.label()),
          information: this.#translate.instant('XP.Copilot.DeleteProviderAndModels', {
            Default: `Delete the ai model provider and it's custom models (if any)`
          })
        }
      })
      .closed.pipe(
        switchMap((confirm) => {
          if (confirm) {
            this.loading.set(true)
            return this.#copilotProviderService.delete(this.providerId())
          }
          return EMPTY
        })
      )
      .subscribe({
        next: (copilotProvider) => {
          this.loading.set(false)
          this.#toastr.success('XP.Messages.DeletedSuccessfully', { Default: 'Deleted successfully' })
          this.deleted.emit()
        },
        error: (err) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  async addModel() {
    if (this.readonly()) {
      return
    }
    const copilotProvider = this.copilotProvider()
    if (!copilotProvider || !canCreateCustomProviderModel(copilotProvider.provider)) {
      return
    }
    this.loading.set(true)
    try {
      const catalog =
        this.#models() ?? (await firstValueFrom(this.#copilotProviderService.getModels(copilotProvider.id)))
      this.#dialog
        .open(CopilotProviderModelComponent, {
          backdropClass: 'backdrop-blur-xs-black',
          panelClass: 'xp-overlay-pane-dialog',
          maxWidth: 'calc(100vw - 32px)',
          data: {
            provider: copilotProvider,
            modelId: null,
            catalog
          }
        })
        .closed.subscribe({
          next: (result) => {
            if (result) {
              this.addedModel.emit(result)
              this.refresh$.next()
            }
          }
        })
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }

  discoverModels() {
    if (this.readonly() || !this.discoverySupported()) return
    this.#dialog
      .open<ModelImportResult>(ModelDiscoveryComponent, {
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog',
        maxWidth: 'calc(100vw - 32px)',
        data: { provider: this.copilotProvider() }
      })
      .closed.subscribe((result) => {
        // Edits in the discovery dialog persist independently of confirming a catalog sync.
        this.refresh$.next()
        this.modelsImported.emit(result ?? { added: 0, skipped: 0 })
        if (result) {
          this.#toastr.success('XP.Copilot.Discovery.Imported', { added: result.added, skipped: result.skipped })
        }
      })
  }

  editModel(model: ICopilotProviderModel) {
    if (this.readonly()) {
      return
    }
    const copilotProvider = this.copilotProvider()
    if (!copilotProvider || !canCreateCustomProviderModel(copilotProvider.provider)) {
      return
    }
    this.#dialog
      .open(CopilotProviderModelComponent, {
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog',
        maxWidth: 'calc(100vw - 32px)',
        data: {
          provider: copilotProvider,
          modelId: model.id
        }
      })
      .closed.subscribe({
        next: (result) => {
          if (result) {
            this.addedModel.emit(result)
            this.refresh$.next()
          }
        }
      })
  }

  openSetup() {
    if (this.readonly()) {
      return
    }
    const provider = this.copilotProvider().provider
    const copilot = this.copilotProvider().copilot
    this.#dialog
      .open(CopilotAiProviderAuthComponent, {
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog',
        maxWidth: 'calc(100vw - 32px)',
        disableClose: true,
        data: {
          providerId: this.copilotProvider().id,
          provider,
          copilot
        }
      })
      .closed.subscribe({
        next: (copilotProvider) => {
          if (copilotProvider) {
            this.refresh$.next()
            this.changed.emit()
          }
        },
        error: (err) => {}
      })
  }
}
