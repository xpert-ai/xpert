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
import { MatInputModule } from '@angular/material/input'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { CdkConfirmDeleteComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { BehaviorSubject, EMPTY, switchMap } from 'rxjs'
import {
  ConfigurateMethod,
  getErrorMessage,
  ICopilotProviderModel,
  injectAiProviders,
  injectCopilotProviderService,
  ModelFeature,
  TCopilotTokenUsage,
  ToastrService
} from '../../../@core'
import { CopilotProviderModelComponent } from '../copilot-provider-model/model.component'
import { CopilotAiProviderAuthComponent } from '../provider-authorization/authorization.component'

@Component({
  standalone: true,
  selector: 'copilot-provider',
  templateUrl: './provider.component.html',
  styleUrls: ['./provider.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    DragDropModule,
    MatTooltipModule,
    MatInputModule,
    MatSlideToggleModule,
    NgmI18nPipe,
    NgmSpinComponent
  ],
  host: {
    '[style.background]': 'background()'
  }
})
export class CopilotProviderComponent {
  eConfigurateMethod = ConfigurateMethod
  eModelFeature = ModelFeature

  readonly #dialog = inject(Dialog)
  readonly #translate = inject(TranslateService)
  readonly #toastr = inject(ToastrService)
  readonly #i18n = new NgmI18nPipe()
  readonly #copilotProviderService = injectCopilotProviderService()
  readonly aiProviders = injectAiProviders()

  // Inputs
  readonly providerId = input<string>()
  readonly readonly = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly usage = input<TCopilotTokenUsage>()

  // Outputs
  readonly deleted = output<void>()
  readonly addedModel = output<ICopilotProviderModel>()

  readonly refresh$ = new BehaviorSubject<void>(null)
  readonly showModels = signal(false)
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
  readonly configurate_methods = computed(() => this.copilotProvider()?.provider?.configurate_methods)
  readonly canCustomizableModel = computed(() =>
    this.configurate_methods()?.includes(ConfigurateMethod.CUSTOMIZABLE_MODEL)
  )
  readonly provider_credential_schema = computed(() => this.copilotProvider()?.provider?.provider_credential_schema)

  readonly #models = derivedAsync(() => {
    return this.showModels()
      ? this.refresh$.pipe(switchMap(() => this.#copilotProviderService.getModels(this.providerId())))
      : null
  })

  readonly customModels = computed(() => this.#models()?.custom)
  readonly builtinModels = computed(() => this.#models()?.builtin)

  readonly modelCount = computed(() => (this.customModels()?.length ?? 0) + (this.builtinModels()?.length ?? 0))

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
    if (this.isShowModels()) {
      this.showModels.set(true)
    }
  }

  delete() {
    if (this.readonly()) {
      return
    }
    this.#dialog
      .open(CdkConfirmDeleteComponent, {
        data: {
          value: this.#i18n.transform(this.label()),
          information: this.#translate.instant('PAC.Copilot.DeleteProviderAndModels', {
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
          this.#toastr.success('PAC.Messages.DeletedSuccessfully', { Default: 'Deleted successfully' })
          this.deleted.emit()
        },
        error: (err) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  addModel() {
    if (this.readonly()) {
      return
    }
    this.#dialog
      .open(CopilotProviderModelComponent, {
        data: {
          provider: this.copilotProvider(),
          modelId: null
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

  editModel(model: ICopilotProviderModel) {
    if (this.readonly()) {
      return
    }
    this.#dialog
      .open(CopilotProviderModelComponent, {
        data: {
          provider: this.copilotProvider(),
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
        disableClose: true,
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: 'xp-overlay-pane-share-sheet',
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
          }
        },
        error: (err) => {}
      })
  }
}
