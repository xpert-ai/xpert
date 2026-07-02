import { CommonModule } from '@angular/common'
import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { Component, computed, effect, inject, signal, viewChild } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardStepperImports, type ZardStepperSelectionEvent } from '@xpert-ai/headless-ui'
import { injectPluginAPI } from '@xpert-ai/cloud/state'
import { AiProviderRole, PluginMarketplaceItem } from '@xpert-ai/contracts'
import { BehaviorSubject, catchError, firstValueFrom, map, of, switchMap } from 'rxjs'
import {
  AiFeatureEnum,
  AiModelTypeEnum,
  CopilotServerService,
  EnvironmentService,
  getErrorMessage,
  I18nObject,
  ICopilot,
  ICopilotModel,
  ICopilotWithProvider,
  IXpert,
  IXpertWorkspace,
  Store,
  ToastrService,
  XpertAPIService,
  XpertWorkspaceService,
  XpertTypeEnum
} from '../../../@core'
import { CopilotConfigFormComponent, CopilotModelSelectComponent } from '../../../@shared/copilot'
import { PluginInstallComponent } from '../../setting/plugins/install/install.component'
import { PLUGIN_MARKETPLACE_TARGET_APP } from '../../setting/plugins/plugin-marketplace-categories'
import { TPluginWithDownloads } from '../../setting/plugins/types'
import { buildBlankXpertDraft } from '../../xpert/xpert/blank/blank-draft.util'
import { genAgentKey } from '../../xpert/utils'
import { ClawXpertFacade } from './clawxpert.facade'

const CLAWXPERT_NAME = 'clawxpert'
const CLAWXPERT_TITLE = 'ClawXpert'
const CLAWXPERT_AUTO_PUBLISH_RELEASE_NOTES = 'Initial ClawXpert bootstrap release.'
const CLAWXPERT_DEFAULT_WORKSPACE_NAME = 'Default Workspace'
const CLAWXPERT_PRIMARY_AGENT_PROMPT_TEMPLATE = [
  'When available, use the following runtime preference context to guide how you respond.',
  '',
  'Assistant soul:',
  '{{sys.soul}}',
  '',
  'User profile:',
  '{{sys.profile}}',
  '',
  'Treat the assistant soul as behavior guidance and use the user profile to personalize responses when relevant.'
].join('\n')

@Component({
  standalone: true,
  selector: 'pac-clawxpert-setup-wizard',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ZardButtonComponent,
    CopilotModelSelectComponent,
    CopilotConfigFormComponent,
    ...ZardStepperImports
  ],
  template: `
    <div
      class="flex max-h-[min(46rem,calc(100vh-2rem))] w-[min(58rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-components-card-bg shadow-xl"
    >
      <div class="border-b border-divider-regular px-6 py-5">
        <div class="min-w-0">
          <div class="text-xs uppercase tracking-[0.24em] text-text-tertiary">
            {{ 'PAC.Chat.ClawXpert.Onboarding' | translate }}
          </div>
          <div class="mt-2 text-xl font-semibold text-text-primary">
            {{ 'PAC.Chat.ClawXpert.OnboardingTitle' | translate }}
          </div>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
            {{ 'PAC.Chat.ClawXpert.OnboardingDesc' | translate }}
          </p>
        </div>
      </div>

      <z-stepper
        #stepper="zStepper"
        orientation="horizontal"
        zSize="sm"
        class="clawxpert-setup-stepper min-h-0 flex-1 overflow-hidden px-6 py-5"
        [selectedIndex]="currentStep()"
        (selectionChange)="onStepChange($event)"
      >
        <z-step [label]="'PAC.Chat.ClawXpert.PluginStepTitle' | translate">
          <section data-onboarding-step="plugins" class="flex h-full min-h-0 flex-col overflow-hidden px-1 pb-2">
            <div class="min-w-0">
              <div class="text-base font-semibold text-text-primary">
                {{ 'PAC.Chat.ClawXpert.PluginStepTitle' | translate }}
              </div>
              <p class="mt-2 text-sm leading-6 text-text-secondary">
                {{ 'PAC.Chat.ClawXpert.PluginStepDesc' | translate }}
              </p>
            </div>

            <div
              class="mt-4 flex min-h-0 flex-1 flex-col rounded-2xl border border-divider-regular bg-background-default-subtle p-4"
            >
              @if (marketplacePlugins() === null) {
                <div class="flex min-h-48 items-center justify-center gap-2 text-sm text-text-secondary">
                  <i class="ri-loader-4-line animate-spin"></i>
                  <span>{{ 'PAC.Chat.ClawXpert.LoadingPlugins' | translate }}</span>
                </div>
              } @else if (marketplacePlugins()?.length) {
                <div class="grid min-h-0 flex-1 gap-3 overflow-auto pr-1 sm:grid-cols-2">
                  @for (plugin of marketplacePlugins(); track plugin.packageName || plugin.name) {
                    <div class="rounded-xl border border-divider-regular bg-components-card-bg px-4 py-3">
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <div class="truncate text-sm font-semibold text-text-primary">
                            {{ displayI18n(plugin.displayName, plugin.name) }}
                          </div>
                          <div class="mt-1 line-clamp-2 text-xs leading-5 text-text-secondary">
                            {{ displayI18n(plugin.description, plugin.name) }}
                          </div>
                        </div>
                        <button
                          z-button
                          zType="outline"
                          zSize="sm"
                          type="button"
                          class="shrink-0"
                          [attr.data-plugin-install-button]="plugin.name"
                          [disabled]="plugin.installed"
                          (click)="openPluginInstall(plugin)"
                        >
                          {{
                            (plugin.installed
                              ? 'PAC.Chat.ClawXpert.PluginInstalled'
                              : 'PAC.Chat.ClawXpert.InstallPlugin'
                            ) | translate
                          }}
                        </button>
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <div
                  class="min-h-48 rounded-xl border border-dashed border-divider-regular px-4 py-8 text-sm text-text-secondary"
                >
                  {{ 'PAC.Chat.ClawXpert.NoMarketplacePlugins' | translate }}
                </div>
              }
            </div>
          </section>
        </z-step>

        <z-step [label]="'PAC.Chat.ClawXpert.ModelProviderStepTitle' | translate">
          <section data-onboarding-step="model-provider" class="h-full min-h-0 overflow-auto px-1 pb-2">
            <div class="min-w-0">
              <div class="text-base font-semibold text-text-primary">
                {{ 'PAC.Chat.ClawXpert.ModelProviderStepTitle' | translate }}
              </div>
              <p class="mt-2 text-sm leading-6 text-text-secondary">
                {{ modelProviderHelpText() | translate }}
              </p>
            </div>

            <div class="mt-4 rounded-2xl border border-divider-regular bg-background-default-subtle p-4">
              @if (llmCopilots() === null) {
                <div class="flex min-h-48 items-center justify-center gap-2 text-sm text-text-secondary">
                  <i class="ri-loader-4-line animate-spin"></i>
                  <span>{{ 'PAC.Chat.ClawXpert.CheckingModelProviders' | translate }}</span>
                </div>
              } @else if (hasLlmModelProvider()) {
                <div
                  data-model-provider-config-form
                  class="rounded-xl border border-divider-regular bg-components-card-bg p-4"
                >
                  @if (enablingPrimaryCopilot()) {
                    <div
                      class="relative flex min-h-40 items-center justify-center rounded-xl border border-dashed border-divider-regular bg-background-default-subtle px-4 py-6 text-sm text-text-secondary"
                    >
                      <i class="ri-loader-4-line mr-2 animate-spin"></i>
                      {{ 'PAC.Chat.ClawXpert.PreparingModelProvider' | translate }}
                    </div>
                  } @else {
                    <div
                      data-model-provider-ready
                      class="rounded-xl border border-divider-regular bg-background-default-subtle px-4 py-4"
                    >
                      <div class="text-sm font-medium leading-5 text-text-primary">
                        <span class="text-text-destructive">*</span>
                        {{ 'PAC.KEY_WORDS.Model' | translate: { Default: 'Model' } }}
                      </div>
                      <copilot-model-select
                        class="mt-2 block w-full"
                        hiddenLabel
                        [modelType]="llmModelType"
                        [ngModel]="selectedCopilotModel()"
                        (ngModelChange)="onSelectedCopilotModelChange($event)"
                      />
                      <div class="mt-2 text-sm text-text-secondary">
                        {{ 'PAC.Chat.ClawXpert.ModelProvidersReady' | translate: { count: availableModelCount() } }}
                      </div>
                    </div>
                  }
                </div>
              } @else if (hasCopilotFeature()) {
                <div class="mb-4 text-sm leading-6 text-text-secondary">
                  {{ 'PAC.Chat.ClawXpert.ModelPluginSetupDesc' | translate }}
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                  <div
                    data-model-plugin-section="initialized"
                    class="rounded-xl border border-divider-regular bg-components-card-bg p-4"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <div class="text-sm font-semibold text-text-primary">
                        {{ 'PAC.Chat.ClawXpert.InitializedModelPlugins' | translate }}
                      </div>
                      <span class="rounded-full bg-background-default-subtle px-2 py-1 text-xs text-text-tertiary">
                        {{ installedModelPlugins().length }}
                      </span>
                    </div>

                    <div class="mt-3 space-y-3">
                      @for (plugin of installedModelPlugins(); track plugin.packageName || plugin.name) {
                        <div class="rounded-xl border border-divider-regular bg-background-default-subtle px-3 py-3">
                          <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                              <div class="truncate text-sm font-medium text-text-primary">
                                {{ displayI18n(plugin.displayName, plugin.name) }}
                              </div>
                              <div class="mt-1 line-clamp-2 text-xs leading-5 text-text-secondary">
                                {{ displayI18n(plugin.description, plugin.name) }}
                              </div>
                            </div>
                            <span
                              class="shrink-0 rounded-full bg-background-default px-2.5 py-1 text-xs text-text-tertiary"
                            >
                              {{ 'PAC.Chat.ClawXpert.PluginInstalled' | translate }}
                            </span>
                          </div>
                        </div>
                      } @empty {
                        <div
                          class="rounded-xl border border-dashed border-divider-regular px-3 py-6 text-sm text-text-secondary"
                        >
                          {{ 'PAC.Chat.ClawXpert.NoInitializedModelPlugins' | translate }}
                        </div>
                      }
                    </div>
                  </div>

                  <div
                    data-model-plugin-section="uninitialized"
                    class="rounded-xl border border-divider-regular bg-components-card-bg p-4"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <div class="text-sm font-semibold text-text-primary">
                        {{ 'PAC.Chat.ClawXpert.UninitializedModelPlugins' | translate }}
                      </div>
                      <span class="rounded-full bg-background-default-subtle px-2 py-1 text-xs text-text-tertiary">
                        {{ uninitializedModelPlugins().length }}
                      </span>
                    </div>

                    <div class="mt-3 space-y-3">
                      @for (plugin of uninitializedModelPlugins(); track plugin.packageName || plugin.name) {
                        <div
                          class="rounded-xl border border-dashed border-divider-regular bg-components-card-bg px-3 py-3"
                        >
                          <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                              <div class="truncate text-sm font-medium text-text-primary">
                                {{ displayI18n(plugin.displayName, plugin.name) }}
                              </div>
                              <div class="mt-1 line-clamp-2 text-xs leading-5 text-text-secondary">
                                {{ displayI18n(plugin.description, plugin.name) }}
                              </div>
                            </div>
                            <button
                              z-button
                              zType="default"
                              zSize="sm"
                              type="button"
                              [attr.data-plugin-install-button]="plugin.name"
                              (click)="openPluginInstall(plugin)"
                            >
                              {{ 'PAC.Chat.ClawXpert.InstallPlugin' | translate }}
                            </button>
                          </div>
                        </div>
                      } @empty {
                        <div
                          class="rounded-xl border border-dashed border-divider-regular px-3 py-6 text-sm text-text-secondary"
                        >
                          {{ 'PAC.Chat.ClawXpert.NoUninitializedModelPlugins' | translate }}
                        </div>
                      }
                    </div>
                  </div>
                </div>

                <div
                  data-model-provider-config-form
                  class="mt-4 rounded-xl border border-divider-regular bg-components-card-bg p-4"
                >
                  @if (enablingPrimaryCopilot() || !showModelProviderForm()) {
                    <div
                      class="relative flex min-h-40 items-center justify-center rounded-xl border border-dashed border-divider-regular bg-background-default-subtle px-4 py-6 text-sm text-text-secondary"
                    >
                      <i class="ri-loader-4-line mr-2 animate-spin"></i>
                      {{ 'PAC.Chat.ClawXpert.PreparingModelProvider' | translate }}
                    </div>
                  } @else {
                    <div class="mb-3 text-sm font-semibold text-text-primary">
                      {{ 'PAC.Chat.ClawXpert.ConfigureModelProviderInline' | translate }}
                    </div>
                    <pac-copilot-config-form
                      #modelProviderForm
                      [copilot]="primaryCopilot()"
                      (saved)="onModelProviderSaved()"
                    />
                  }
                </div>
              } @else {
                <div class="text-sm font-medium text-text-primary">
                  {{ 'PAC.Chat.ClawXpert.ContactAdminForModelProvider' | translate }}
                </div>
                <div class="mt-1 text-sm leading-6 text-text-secondary">
                  {{ 'PAC.Chat.ClawXpert.ContactAdminForModelProviderDesc' | translate }}
                </div>
              }
            </div>
          </section>
        </z-step>
      </z-stepper>

      <div class="flex items-center justify-between gap-3 border-t border-divider-regular px-6 py-4">
        <div class="text-sm text-text-tertiary">
          @if (!hasCopilotFeature()) {
            {{ 'PAC.Chat.ClawXpert.CopilotFeatureDisabled' | translate }}
          } @else if (currentStep() === 0) {
            {{ 'PAC.Chat.ClawXpert.PluginStepFooter' | translate }}
          } @else if (!hasLlmModelProvider()) {
            {{ 'PAC.Chat.ClawXpert.ModelProviderRequiredBeforeCreate' | translate }}
          } @else if (!hasSelectedCopilotModel()) {
            {{ 'PAC.Chat.ClawXpert.SelectModelBeforeCreate' | translate }}
          } @else {
            {{ 'PAC.Chat.ClawXpert.ReadyToCreate' | translate }}
          }
        </div>

        <div class="flex shrink-0 items-center gap-2">
          @if (currentStep() === 0) {
            <button
              z-button
              zType="default"
              displayDensity="cosy"
              type="button"
              data-clawxpert-setup-next
              [zDisabled]="marketplacePluginsLoading()"
              (click)="stepper.next()"
            >
              {{ 'PAC.ACTIONS.Next' | translate }}
            </button>
          } @else {
            <button
              z-button
              zType="outline"
              displayDensity="cosy"
              type="button"
              [disabled]="creatingXpert()"
              (click)="stepper.previous()"
            >
              {{ 'PAC.ACTIONS.Back' | translate }}
            </button>

            @if (!hasLlmModelProvider()) {
              <button
                z-button
                zType="default"
                displayDensity="cosy"
                type="button"
                [disabled]="modelProviderSaveDisabled()"
                (click)="saveModelProvider()"
              >
                {{ 'PAC.Chat.ClawXpert.SaveModelProvider' | translate }}
              </button>
            } @else {
              <button
                z-button
                zType="default"
                displayDensity="cosy"
                type="button"
                [disabled]="creatingXpert() || !canCreateXpert()"
                (click)="createAndBindClawXpert()"
              >
                {{ 'PAC.Chat.ClawXpert.CreateFirst' | translate }}
              </button>
            }
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host ::ng-deep .clawxpert-setup-stepper > .z-stepper__panel {
        display: flex;
        flex-direction: column;
        min-height: 0;
        flex: 1 1 0%;
        overflow: hidden;
      }

      :host ::ng-deep .clawxpert-setup-stepper > .z-stepper__panel > [data-onboarding-step] {
        min-height: 0;
        flex: 1 1 0%;
      }
    `
  ]
})
export class ClawXpertSetupWizardComponent {
  readonly facade = inject(ClawXpertFacade)
  readonly #dialog = inject(Dialog)
  readonly #dialogRef = inject<DialogRef<unknown> | null>(DialogRef, { optional: true })
  readonly #copilotServer = inject(CopilotServerService)
  readonly #environmentService = inject(EnvironmentService)
  readonly #store = inject(Store)
  readonly #pluginAPI = injectPluginAPI()
  readonly #toastr = inject(ToastrService)
  readonly #xpertService = inject(XpertAPIService)
  readonly #workspaceService = inject(XpertWorkspaceService)
  readonly modelProviderForm = viewChild(CopilotConfigFormComponent)
  readonly #marketplaceRefresh$ = new BehaviorSubject<void>(undefined)
  readonly llmModelType = AiModelTypeEnum.LLM
  readonly currentStep = signal(0)
  readonly creatingXpert = signal(false)
  readonly enablingPrimaryCopilot = signal(false)
  readonly savingModelProvider = signal(false)
  readonly selectedCopilotModel = signal<ICopilotModel | null>(null)

  readonly marketplacePlugins = toSignal(
    this.#marketplaceRefresh$.pipe(
      switchMap(() =>
        this.#pluginAPI.getMarketplace({ targetApp: PLUGIN_MARKETPLACE_TARGET_APP }).pipe(
          map((manifest) => (manifest?.items ?? []).map(toOnboardingPlugin)),
          catchError(() => of([] as TPluginWithDownloads[]))
        )
      )
    ),
    {
      initialValue: null as TPluginWithDownloads[] | null
    }
  )
  readonly marketplacePluginsLoading = computed(() => this.marketplacePlugins() === null)
  readonly modelMarketplacePlugins = computed(() => {
    return (this.marketplacePlugins() ?? []).filter((plugin) => plugin.category === 'model')
  })
  readonly installedModelPlugins = computed(() => this.modelMarketplacePlugins().filter((plugin) => plugin.installed))
  readonly uninitializedModelPlugins = computed(() =>
    this.modelMarketplacePlugins().filter((plugin) => !plugin.installed)
  )
  readonly orgCopilots = toSignal(
    this.#copilotServer.refresh$.pipe(
      switchMap(() => this.#copilotServer.getAllInOrg()),
      map(({ items }) => items ?? []),
      catchError(() => of([] as ICopilot[]))
    ),
    {
      initialValue: [] as ICopilot[]
    }
  )
  readonly primaryCopilot = computed(
    () => this.orgCopilots().find((item) => item.role === AiProviderRole.Primary) ?? null
  )
  readonly showModelProviderForm = computed(() => !!this.primaryCopilot()?.enabled)

  readonly llmCopilots = toSignal(
    this.#copilotServer.getCopilotModels(AiModelTypeEnum.LLM).pipe(
      map((items) => items ?? []),
      catchError(() => of([] as ICopilotWithProvider[]))
    ),
    {
      initialValue: null as ICopilotWithProvider[] | null
    }
  )
  readonly hasCopilotFeature = computed(() => {
    return !this.#store.featureContextHydrated || this.#store.hasFeatureEnabled(AiFeatureEnum.FEATURE_COPILOT)
  })
  readonly canConfigureModelProvider = computed(() => {
    return this.hasCopilotFeature()
  })
  readonly availableModelCount = computed(() => {
    return (this.llmCopilots() ?? []).reduce(
      (total, copilot) => total + (copilot.providerWithModels?.models?.length ?? 0),
      0
    )
  })
  readonly hasLlmModelProvider = computed(() => this.availableModelCount() > 0)
  readonly hasSelectedCopilotModel = computed(() => {
    const model = this.selectedCopilotModel()
    return !!model?.copilotId && !!model.model
  })
  readonly canCreateXpert = computed(() => this.hasLlmModelProvider() && this.hasSelectedCopilotModel())

  constructor() {
    effect(() => {
      if (this.selectedCopilotModel()) {
        return
      }

      const firstModel = this.resolveFirstCopilotModel()
      if (firstModel) {
        this.selectedCopilotModel.set(firstModel)
      }
    })

    effect(() => {
      if (this.currentStep() === 1 && !this.hasLlmModelProvider()) {
        void this.prepareModelProviderStep()
      }
    })

    effect(() => {
      const form = this.modelProviderForm()
      const selectedCopilotModel = this.selectedCopilotModel()
      if (!form || !selectedCopilotModel || this.readFormCopilotModel()) {
        return
      }

      form.formGroup.patchValue({
        copilotModel: selectedCopilotModel
      })
    })
  }

  onStepChange(event: ZardStepperSelectionEvent) {
    this.currentStep.set(event.selectedIndex)
  }

  onModelProviderSaved() {
    const model = this.modelProviderForm()?.formGroup.value.copilotModel as ICopilotModel | null | undefined
    if (model?.copilotId && model.model) {
      this.selectedCopilotModel.set(model)
    }
    this.#copilotServer.refresh()
  }

  onSelectedCopilotModelChange(copilotModel: Partial<ICopilotModel> | null) {
    const copilotId = copilotModel?.copilotId
    const model = copilotModel?.model
    if (!copilotId || !model) {
      this.selectedCopilotModel.set(null)
      return
    }

    this.selectedCopilotModel.set({
      ...copilotModel,
      copilotId,
      model,
      modelType: copilotModel.modelType ?? AiModelTypeEnum.LLM
    })
  }

  modelProviderSaveDisabled() {
    const form = this.modelProviderForm()
    return (
      this.savingModelProvider() ||
      this.enablingPrimaryCopilot() ||
      !this.showModelProviderForm() ||
      !form?.canSubmit() ||
      !form?.hasSelectedModel()
    )
  }

  async saveModelProvider() {
    const form = this.modelProviderForm()
    if (!form || this.modelProviderSaveDisabled()) {
      return
    }

    this.savingModelProvider.set(true)
    try {
      const saved = await form.submit()
      if (saved) {
        this.onModelProviderSaved()
      }
    } finally {
      this.savingModelProvider.set(false)
    }
  }

  openPluginInstall(plugin: TPluginWithDownloads) {
    if (!plugin || plugin.installed) {
      return
    }

    this.#dialog
      .open(PluginInstallComponent, {
        data: {
          plugin,
          reload: () => this.reloadMarketplacePlugins()
        },
        disableClose: true
      })
      .closed.subscribe(() => this.reloadMarketplacePlugins())
  }

  async createAndBindClawXpert() {
    const selectedCopilotModel = this.modelProviderForm() ? this.readFormCopilotModel() : this.selectedCopilotModel()
    if (this.creatingXpert() || !this.canCreateXpert() || !selectedCopilotModel) {
      return
    }

    this.creatingXpert.set(true)
    try {
      const workspace = await this.ensureDefaultWorkspace()
      const createdXpert = await this.createClawXpertRecord(selectedCopilotModel, workspace.id)
      const draft = await buildBlankXpertDraft(createdXpert, undefined, {
        defaultCopilotModel: selectedCopilotModel
      })
      await firstValueFrom(this.#xpertService.saveDraft(createdXpert.id, draft))
      const publishedXpert = await this.publishCreatedXpert(createdXpert)

      await this.facade.bindPublishedXpert(publishedXpert, { navigateToChat: true })
      this.#dialogRef?.close()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.creatingXpert.set(false)
    }
  }

  displayI18n(value: I18nObject | string | null | undefined, fallback = '') {
    if (typeof value === 'string') {
      return value
    }

    if (!value) {
      return fallback
    }

    return value.zh_Hans || value.en_US || Object.values(value).find((item) => typeof item === 'string') || fallback
  }

  modelProviderHelpText() {
    if (!this.hasCopilotFeature()) {
      return 'PAC.Chat.ClawXpert.CopilotFeatureDisabledDesc'
    }

    if (this.hasLlmModelProvider()) {
      return 'PAC.Chat.ClawXpert.ModelProviderStepReadyDesc'
    }

    return this.canConfigureModelProvider()
      ? 'PAC.Chat.ClawXpert.ModelProviderStepDesc'
      : 'PAC.Chat.ClawXpert.ModelProviderStepAdminDesc'
  }

  private reloadMarketplacePlugins() {
    this.#marketplaceRefresh$.next()
  }

  private readFormCopilotModel(): ICopilotModel | null {
    const model = this.modelProviderForm()?.formGroup.value.copilotModel as ICopilotModel | null | undefined
    return model?.copilotId && model.model ? model : null
  }

  private async prepareModelProviderStep() {
    if (
      !this.hasCopilotFeature() ||
      this.hasLlmModelProvider() ||
      this.enablingPrimaryCopilot() ||
      this.primaryCopilot()?.enabled
    ) {
      return
    }

    this.enablingPrimaryCopilot.set(true)
    try {
      await firstValueFrom(this.#copilotServer.enableCopilot(AiProviderRole.Primary))
      this.#copilotServer.refresh()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.enablingPrimaryCopilot.set(false)
    }
  }

  private resolveFirstCopilotModel(): ICopilotModel | null {
    for (const copilot of this.llmCopilots() ?? []) {
      const model = copilot.providerWithModels?.models?.[0]
      if (copilot.id && model?.model) {
        return {
          copilotId: copilot.id,
          model: model.model,
          modelType: AiModelTypeEnum.LLM
        }
      }
    }

    return null
  }

  private async ensureDefaultWorkspace(): Promise<IXpertWorkspace> {
    const defaultWorkspace = await firstValueFrom(this.#workspaceService.getMyDefault())
    if (defaultWorkspace?.id) {
      return defaultWorkspace
    }

    const createdWorkspace = await firstValueFrom(
      this.#workspaceService.create({
        name: CLAWXPERT_DEFAULT_WORKSPACE_NAME
      })
    )

    if (!createdWorkspace?.id) {
      throw new Error('Default workspace creation did not return an id.')
    }

    const workspace = await firstValueFrom(this.#workspaceService.setMyDefault(createdWorkspace.id))
    this.#workspaceService.refresh()

    return workspace?.id ? workspace : createdWorkspace
  }

  private async createClawXpertRecord(copilotModel: ICopilotModel, workspaceId: string): Promise<IXpert> {
    const xpert = await firstValueFrom(
      this.#xpertService.create({
        workspaceId,
        type: XpertTypeEnum.Agent,
        name: CLAWXPERT_NAME,
        title: CLAWXPERT_TITLE,
        copilotModel,
        latest: true,
        agent: {
          key: genAgentKey(),
          copilotModel,
          prompt: CLAWXPERT_PRIMARY_AGENT_PROMPT_TEMPLATE,
          options: {
            vision: {
              enabled: true
            }
          }
        }
      })
    )

    return this.withInitialPrimaryAgentPrompt(xpert, copilotModel, workspaceId)
  }

  private withInitialPrimaryAgentPrompt(xpert: IXpert, copilotModel: ICopilotModel, workspaceId: string): IXpert {
    return {
      ...xpert,
      workspaceId: xpert.workspaceId ?? workspaceId,
      copilotModel: xpert.copilotModel ?? copilotModel,
      agent: xpert.agent
        ? {
            ...xpert.agent,
            copilotModel: xpert.agent.copilotModel ?? copilotModel,
            prompt: xpert.agent.prompt ?? CLAWXPERT_PRIMARY_AGENT_PROMPT_TEMPLATE
          }
        : xpert.agent
    }
  }

  private async publishCreatedXpert(xpert: IXpert): Promise<IXpert> {
    const workspaceId = xpert.workspaceId ?? null
    let environmentId: string | null = null

    if (workspaceId) {
      try {
        environmentId = (await firstValueFrom(this.#environmentService.getDefaultByWorkspace(workspaceId)))?.id ?? null
      } catch {
        environmentId = null
      }
    }

    return firstValueFrom(
      this.#xpertService.publish(xpert.id, false, {
        environmentId,
        releaseNotes: CLAWXPERT_AUTO_PUBLISH_RELEASE_NOTES
      })
    )
  }
}

function toOnboardingPlugin(item: PluginMarketplaceItem): TPluginWithDownloads {
  const name = item.name || item.packageName || ''
  const packageName = item.packageName ?? name

  return {
    name,
    packageName,
    displayName: item.displayName ?? name,
    description: item.description ?? name,
    version: item.version ?? '',
    level: item.level,
    deprecated: item.deprecated,
    deprecationMessage: item.deprecationMessage ?? undefined,
    category: item.category ?? 'integration',
    icon: item.icon ?? {
      type: 'font',
      value: 'ri-puzzle-2-line'
    },
    author: normalizeAuthor(item.author),
    source: normalizeSource(item.source),
    keywords: item.keywords,
    downloads: item.downloads,
    sourceId: item.sourceId ?? null,
    sourceName: item.sourceName ?? null,
    sourceNameI18nKey: item.sourceNameI18nKey ?? null,
    installed: item.installed,
    screenshots: item.screenshots,
    contributions: item.contributions ?? [],
    defaultPrompt: item.defaultPrompt,
    trialShortcuts: item.trialShortcuts,
    operationSummary: item.operationSummary,
    targetAppMeta: item.targetAppMeta ?? null
  }
}

function normalizeAuthor(author: PluginMarketplaceItem['author']): TPluginWithDownloads['author'] {
  if (typeof author === 'string') {
    return {
      name: author,
      url: ''
    }
  }

  return {
    name: author?.displayName || author?.name || 'XpertAI',
    url: author?.url || author?.homepage || ''
  }
}

function normalizeSource(source: PluginMarketplaceItem['source']): TPluginWithDownloads['source'] {
  if (!source?.url) {
    return undefined
  }

  return {
    type: normalizeSourceType(source.type),
    url: source.url
  }
}

function normalizeSourceType(type: string | undefined): NonNullable<TPluginWithDownloads['source']>['type'] {
  if (
    type === 'marketplace' ||
    type === 'github' ||
    type === 'git' ||
    type === 'url' ||
    type === 'npm' ||
    type === 'website'
  ) {
    return type
  }

  return 'other'
}
