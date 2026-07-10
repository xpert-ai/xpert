import { CommonModule } from '@angular/common'
import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { Component, computed, effect, inject, signal, viewChild } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardCheckboxComponent } from '@xpert-ai/headless-ui'
import { injectPluginAPI, IPluginDescriptor } from '@xpert-ai/cloud/state'
import { AiProviderRole } from '@xpert-ai/contracts'
import { catchError, firstValueFrom, from, map, of, switchMap } from 'rxjs'
import {
  AiFeatureEnum,
  AiModelTypeEnum,
  CopilotServerService,
  getErrorMessage,
  ICopilot,
  ICopilotModel,
  ICopilotWithProvider,
  IXpertToolset,
  OrderTypeEnum,
  Store,
  ToastrService,
  TXpertTemplate,
  XpertTemplateService,
  XpertToolsetCategoryEnum,
  XpertToolsetService,
  XpertWorkspaceService
} from '../../../@core'
import { CopilotConfigFormComponent } from '../../../@shared/copilot'
import { toPluginMarketplaceDetails } from '../../setting/plugins/plugin-marketplace-details'
import { PluginMarketplaceDetailComponent } from '../../setting/plugins/marketplace/marketplace-detail.component'
import clawxpertRecommendedTemplates from './clawxpert-recommended-templates.json'
import { ClawXpertBootstrapService, resolveFirstClawXpertLlmModel } from './clawxpert-bootstrap.service'
import { ClawXpertFacade } from './clawxpert.facade'

const CLAWXPERT_RECOMMENDED_TEMPLATE_IDS = clawxpertRecommendedTemplates.templateIds
const SUPPRESS_SETUP_WARNINGS = {
  suppressAutoPublishWarning: true,
  suppressPluginPrepareWarning: true
}

type InitializationStatus = {
  key: string
  params?: {
    name?: string
  }
}

type RecommendedTemplateItem = {
  template: TXpertTemplate
  unavailableReasonKey?: string
  unavailableReasonParams?: {
    name?: string
  }
}

type RecommendedTemplateToolsetDependency = {
  provider: string
  instanceName?: string
}

@Component({
  standalone: true,
  selector: 'pac-clawxpert-setup-wizard',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardCheckboxComponent,
    CopilotConfigFormComponent
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

      <section data-onboarding-step="default-clawxpert" class="min-h-0 flex-1 overflow-auto px-6 py-5">
        <div class="min-w-0">
          <div class="text-base font-semibold text-text-primary">
            {{ 'PAC.Chat.ClawXpert.DefaultInstallTitle' | translate }}
          </div>
          <p class="mt-2 text-sm leading-6 text-text-secondary">
            {{ 'PAC.Chat.ClawXpert.DefaultInstallDesc' | translate }}
          </p>
        </div>

        @if (llmCopilots() === null) {
          <div class="mt-4 flex min-h-48 items-center justify-center gap-2 text-sm text-text-secondary">
            <i class="ri-loader-4-line animate-spin"></i>
            <span>{{ 'PAC.Chat.ClawXpert.CheckingModelProviders' | translate }}</span>
          </div>
        } @else {
          <div
            data-clawxpert-default-install
            class="mt-4 rounded-xl border border-divider-regular bg-background-default-subtle p-4"
          >
            <div class="flex items-start gap-3">
              <div
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-divider-regular bg-components-card-bg text-lg text-text-secondary"
              >
                C
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <div class="text-sm font-semibold text-text-primary">ClawXpert</div>
                  <span class="rounded-full bg-components-card-bg px-2 py-0.5 text-xs text-text-tertiary">
                    {{ 'PAC.Chat.ClawXpert.DefaultInstallBadge' | translate }}
                  </span>
                </div>
                <div class="mt-1 text-sm leading-6 text-text-secondary">
                  {{ 'PAC.Chat.ClawXpert.DefaultInstallCardDesc' | translate }}
                </div>
                @if (hasSelectedCopilotModel()) {
                  <div class="mt-2 text-xs text-text-tertiary">
                    {{ 'PAC.Chat.ClawXpert.DefaultModelReady' | translate: { model: defaultCopilotModelLabel() } }}
                  </div>
                } @else if (enablingPrimaryCopilot()) {
                  <div class="mt-2 flex items-center gap-2 text-xs text-text-tertiary">
                    <i class="ri-loader-4-line animate-spin"></i>
                    {{ 'PAC.Chat.ClawXpert.PreparingModelProvider' | translate }}
                  </div>
                } @else {
                  <div class="mt-2 text-xs text-text-tertiary">
                    {{ 'PAC.Chat.ClawXpert.DefaultModelUnavailable' | translate }}
                  </div>
                }
              </div>
            </div>
          </div>

          @if (!hasSelectedCopilotModel() && hasCopilotFeature()) {
            <div
              data-model-provider-config-form
              class="mt-4 rounded-xl border border-divider-regular bg-components-card-bg p-4"
            >
              <div class="min-w-0">
                <div class="text-sm font-semibold text-text-primary">
                  {{ 'PAC.Chat.ClawXpert.ModelProviderStepTitle' | translate }}
                </div>
                <p class="mt-1 text-sm leading-6 text-text-secondary">
                  {{ 'PAC.Chat.ClawXpert.ModelProviderStepDesc' | translate }}
                </p>
              </div>

              @if (showModelProviderForm()) {
                <pac-copilot-config-form
                  class="mt-4 w-full"
                  [copilot]="primaryCopilot()"
                  (saved)="onModelProviderSaved()"
                />
              } @else if (enablingPrimaryCopilot()) {
                <div class="mt-4 flex items-center gap-2 text-sm text-text-secondary">
                  <i class="ri-loader-4-line animate-spin"></i>
                  {{ 'PAC.Chat.ClawXpert.PreparingModelProvider' | translate }}
                </div>
              } @else {
                <div class="mt-4 text-sm font-medium text-text-primary">
                  {{ 'PAC.Chat.ClawXpert.ContactAdminForModelProvider' | translate }}
                </div>
                <div class="mt-1 text-sm leading-6 text-text-secondary">
                  {{ 'PAC.Chat.ClawXpert.ContactAdminForModelProviderDesc' | translate }}
                </div>
              }
            </div>
          }

          <div data-clawxpert-recommended-templates class="mt-5">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="text-sm font-semibold text-text-primary">
                  {{ 'PAC.Chat.ClawXpert.RecommendedTemplatesTitle' | translate }}
                </div>
                <p class="mt-1 text-sm leading-6 text-text-secondary">
                  {{ 'PAC.Chat.ClawXpert.RecommendedTemplatesDesc' | translate }}
                </p>
              </div>
            </div>

            @if (recommendedTemplateItems(); as items) {
              @if (items.length) {
                <div class="mt-3 grid gap-3 lg:grid-cols-2">
                  @for (item of items; track item.template.id) {
                    <div
                      [class]="recommendedTemplateCardClass(item)"
                      [attr.data-recommended-template-unavailable]="item.unavailableReasonKey ? item.template.id : null"
                    >
                      <div class="flex min-w-0 items-start justify-between gap-3">
                        <div class="min-w-0 flex-1">
                          <div class="truncate text-sm font-semibold text-text-primary">
                            {{ item.template.title || item.template.name }}
                          </div>
                          <div class="mt-1 truncate text-xs text-text-tertiary">
                            {{ item.template.pluginDisplayName || item.template.category }}
                          </div>
                        </div>
                        <z-checkbox
                          class="shrink-0"
                          labelClass="sr-only"
                          [attr.data-recommended-template-select]="item.template.id"
                          [ngModel]="isRecommendedTemplateSelected(item.template)"
                          [ngModelOptions]="{ standalone: true }"
                          [zDisabled]="creatingXpert() || !canCreateXpert() || !!item.unavailableReasonKey"
                          (ngModelChange)="setRecommendedTemplateSelected(item.template, $event)"
                        >
                          {{ 'PAC.Chat.ClawXpert.SelectRecommendedTemplate' | translate }}
                        </z-checkbox>
                      </div>
                      <div class="mt-3 line-clamp-2 text-sm leading-6 text-text-secondary">
                        {{ item.template.description || ('PAC.Xpert.NoTemplateDescription' | translate) }}
                      </div>
                      @if (item.unavailableReasonKey) {
                        <div class="mt-3 text-xs leading-5 text-text-destructive">
                          {{ item.unavailableReasonKey | translate: item.unavailableReasonParams }}
                        </div>
                      }
                      @if (item.template.pluginName) {
                        <button
                          z-button
                          type="button"
                          zType="secondary"
                          zSize="sm"
                          class="pointer-events-none absolute inset-x-3 bottom-3 justify-center gap-1 opacity-0 shadow-sm transition-opacity !bg-components-card-bg hover:!bg-background-default-subtle group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:!bg-background-default-subtle"
                          [attr.data-recommended-template-details]="item.template.id"
                          (click)="openRecommendedTemplateDetails(item.template, $event)"
                        >
                          <i class="ri-list-check-3"></i>
                          <span>{{ 'PAC.Plugin.Details' | translate: { Default: 'Details' } }}</span>
                        </button>
                      }
                    </div>
                  }
                </div>
              } @else {
                <div
                  class="mt-3 rounded-xl border border-dashed border-divider-regular px-3 py-6 text-sm text-text-secondary"
                >
                  {{ 'PAC.Chat.ClawXpert.NoRecommendedTemplates' | translate }}
                </div>
              }
            } @else {
              <div
                class="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-divider-regular px-3 py-6 text-sm text-text-secondary"
              >
                <i class="ri-loader-4-line animate-spin"></i>
                {{ 'PAC.Chat.ClawXpert.LoadingRecommendedTemplates' | translate }}
              </div>
            }
          </div>
        }
      </section>

      <div class="flex items-center justify-between gap-3 border-t border-divider-regular px-6 py-4">
        <div class="min-w-0 text-sm text-text-tertiary">
          @if (initializationError(); as error) {
            <div
              data-clawxpert-initialization-error
              class="max-w-xl rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm leading-5 text-destructive"
            >
              {{ error }}
            </div>
          } @else if (initializationStatus(); as status) {
            <div data-clawxpert-initialization-status class="flex items-center gap-2 text-text-secondary">
              <i class="ri-loader-4-line animate-spin"></i>
              <span>{{ status.key | translate: status.params }}</span>
            </div>
          } @else if (!hasLoadedLlmModelProviders()) {
            {{ 'PAC.Chat.ClawXpert.CheckingModelProviders' | translate }}
          } @else if (!hasCopilotFeature()) {
            {{ 'PAC.Chat.ClawXpert.CopilotFeatureDisabled' | translate }}
          } @else if (!hasSelectedCopilotModel()) {
            {{ 'PAC.Chat.ClawXpert.ModelProviderRequiredBeforeCreate' | translate }}
          } @else if (selectedRecommendedTemplateCount()) {
            {{
              'PAC.Chat.ClawXpert.ReadyToInitializeWithRecommendations'
                | translate: { count: selectedRecommendedTemplateCount() }
            }}
          } @else {
            {{ 'PAC.Chat.ClawXpert.ReadyToInitialize' | translate }}
          }
        </div>

        <div class="flex shrink-0 items-center gap-2">
          @if (hasLoadedLlmModelProviders()) {
            @if (!hasSelectedCopilotModel() && hasCopilotFeature()) {
              <button
                z-button
                zType="default"
                displayDensity="cosy"
                type="button"
                [disabled]="modelProviderSaveDisabled()"
                (click)="saveModelProvider()"
              >
                @if (savingModelProvider()) {
                  <i class="ri-loader-4-line mr-1 animate-spin"></i>
                }
                {{ 'PAC.Chat.ClawXpert.SaveModelProvider' | translate }}
              </button>
            } @else {
              <button
                z-button
                zType="default"
                displayDensity="cosy"
                type="button"
                [disabled]="creatingXpert() || !canCreateXpert()"
                (click)="completeInitialization()"
              >
                @if (creatingXpert()) {
                  <i class="ri-loader-4-line mr-1 animate-spin"></i>
                  {{ 'PAC.Chat.ClawXpert.Initializing' | translate }}
                } @else {
                  {{ 'PAC.Chat.ClawXpert.CompleteInitialization' | translate }}
                }
              </button>
            }
          }
        </div>
      </div>
    </div>
  `
})
export class ClawXpertSetupWizardComponent {
  readonly #bootstrap = inject(ClawXpertBootstrapService)
  readonly #facade = inject(ClawXpertFacade)
  readonly #dialog = inject(Dialog)
  readonly #dialogRef = inject<DialogRef<unknown> | null>(DialogRef, { optional: true })
  readonly #pluginAPI = injectPluginAPI()
  readonly #copilotServer = inject(CopilotServerService)
  readonly #store = inject(Store)
  readonly #toastr = inject(ToastrService)
  readonly #templateService = inject(XpertTemplateService)
  readonly #toolsetService = inject(XpertToolsetService)
  readonly #workspaceService = inject(XpertWorkspaceService)
  readonly modelProviderForm = viewChild(CopilotConfigFormComponent)
  readonly creatingXpert = signal(false)
  readonly enablingPrimaryCopilot = signal(false)
  readonly savingModelProvider = signal(false)
  readonly selectedCopilotModel = signal<ICopilotModel | null>(null)
  readonly selectedRecommendedTemplateIds = signal<string[]>([])
  readonly initializationStatus = signal<InitializationStatus | null>(null)
  readonly initializationError = signal<string | null>(null)

  readonly recommendedTemplateItems = toSignal(
    this.#templateService.getAll().pipe(
      switchMap(({ recommendedApps }) => from(this.buildRecommendedTemplateItems(recommendedApps ?? []))),
      catchError(() => of([] as RecommendedTemplateItem[]))
    ),
    {
      initialValue: null as RecommendedTemplateItem[] | null
    }
  )
  readonly selectedRecommendedTemplates = computed(() => {
    const selectedTemplateIds = new Set(this.selectedRecommendedTemplateIds())
    return (this.recommendedTemplateItems() ?? [])
      .filter((item) => selectedTemplateIds.has(item.template.id) && !item.unavailableReasonKey)
      .map((item) => item.template)
  })
  readonly selectedRecommendedTemplateCount = computed(() => this.selectedRecommendedTemplates().length)
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
  readonly hasLoadedLlmModelProviders = computed(() => this.llmCopilots() !== null)
  readonly hasCopilotFeature = computed(() => {
    return !this.#store.featureContextHydrated || this.#store.hasFeatureEnabled(AiFeatureEnum.FEATURE_COPILOT)
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
  readonly canCreateXpert = computed(() => this.hasLoadedLlmModelProviders() && this.hasSelectedCopilotModel())

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
      if (this.hasLoadedLlmModelProviders() && !this.hasLlmModelProvider()) {
        void this.prepareModelProviderStep()
      }
    })

    effect(() => {
      const items = this.recommendedTemplateItems()
      if (!items) {
        return
      }

      const availableTemplateIds = new Set(
        items.filter((item) => !item.unavailableReasonKey).map((item) => item.template.id)
      )
      this.selectedRecommendedTemplateIds.update((ids) => ids.filter((id) => availableTemplateIds.has(id)))
    })
  }

  onModelProviderSaved() {
    const model = this.readFormCopilotModel()
    if (model) {
      this.selectedCopilotModel.set(model)
    }
    this.#copilotServer.refresh()
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

  completeInitialization() {
    void this.initializeSelectedExperts()
  }

  isRecommendedTemplateSelected(template: TXpertTemplate) {
    return this.selectedRecommendedTemplateIds().includes(template.id)
  }

  setRecommendedTemplateSelected(template: TXpertTemplate, selected: boolean) {
    if (!template.id) {
      return
    }

    if (selected && !this.isRecommendedTemplateAvailable(template)) {
      this.selectedRecommendedTemplateIds.update((ids) => ids.filter((id) => id !== template.id))
      return
    }

    this.selectedRecommendedTemplateIds.update((ids) => {
      const nextIds = new Set(ids)
      if (selected) {
        nextIds.add(template.id)
      } else {
        nextIds.delete(template.id)
      }
      return Array.from(nextIds)
    })
  }

  openRecommendedTemplateDetails(template: TXpertTemplate, event?: MouseEvent) {
    event?.stopPropagation()
    void this.openRecommendedTemplateDetailsDialog(template)
  }

  private async initializeSelectedExperts() {
    const selectedCopilotModel = this.selectedCopilotModel()
    if (this.creatingXpert() || !this.canCreateXpert() || !selectedCopilotModel) {
      return
    }

    this.creatingXpert.set(true)
    this.initializationError.set(null)
    this.initializationStatus.set({
      key: 'PAC.Chat.ClawXpert.InitializingDefault'
    })
    try {
      const selectedTemplates = this.selectedRecommendedTemplates()
      const failedTemplateNames: string[] = []
      const xpert = await this.#bootstrap.createClawXpert(selectedCopilotModel, SUPPRESS_SETUP_WARNINGS)
      for (const template of selectedTemplates) {
        const templateName = template.title || template.name || template.id
        this.initializationStatus.set({
          key: 'PAC.Chat.ClawXpert.InitializingRecommendedTemplate',
          params: {
            name: templateName
          }
        })
        try {
          await this.#bootstrap.createTemplateXpert(template, selectedCopilotModel, SUPPRESS_SETUP_WARNINGS)
        } catch {
          failedTemplateNames.push(templateName)
        }
      }
      this.initializationStatus.set({
        key: 'PAC.Chat.ClawXpert.BindingInitialized'
      })
      await this.#facade.bindPublishedXpert(xpert, {
        bindNextConversationToXpert: true,
        navigateToChat: true,
        notifySuccess: false,
        notifyError: false,
        rethrowOnError: true
      })
      if (failedTemplateNames.length) {
        this.showRecommendedTemplateInitializationError(failedTemplateNames)
      }
      this.#dialogRef?.close()
    } catch (error) {
      this.initializationError.set(getErrorMessage(error))
    } finally {
      this.initializationStatus.set(null)
      this.creatingXpert.set(false)
    }
  }

  defaultCopilotModelLabel() {
    const model = this.selectedCopilotModel()
    return model?.model ?? ''
  }

  recommendedTemplateCardClass(item: RecommendedTemplateItem) {
    if (item.unavailableReasonKey) {
      return 'group relative rounded-xl border border-dashed border-divider-regular bg-background-default-subtle p-4 opacity-75'
    }

    return this.isRecommendedTemplateSelected(item.template)
      ? 'group relative rounded-xl border border-primary-500 bg-background-default-subtle p-4'
      : 'group relative rounded-xl border border-divider-regular bg-components-card-bg p-4'
  }

  private async openRecommendedTemplateDetailsDialog(template: TXpertTemplate) {
    const pluginName = readNonEmptyString(template.pluginName)
    if (!pluginName) {
      return
    }

    try {
      const plugins = await firstValueFrom(this.#pluginAPI.getPlugins())
      const plugin = (plugins ?? []).find((item) => matchesInstalledPluginName(item, pluginName))
      if (!plugin) {
        return
      }

      this.#dialog.open(PluginMarketplaceDetailComponent, {
        data: {
          plugin: toPluginMarketplaceDetails(plugin),
          showActions: false
        },
        backdropClass: 'backdrop-blur-sm-black'
      })
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }

  private async prepareModelProviderStep() {
    if (
      !this.hasCopilotFeature() ||
      !this.hasLoadedLlmModelProviders() ||
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
    return resolveFirstClawXpertLlmModel(this.llmCopilots())
  }

  private readFormCopilotModel(): ICopilotModel | null {
    const value: unknown = this.modelProviderForm()?.formGroup.value.copilotModel
    return normalizeCopilotModelSelection(value)
  }

  private showRecommendedTemplateInitializationError(failedTemplateNames: string[]) {
    this.#toastr.error('PAC.Chat.ClawXpert.RecommendedTemplatesInitializeFailed', '', {
      Default: 'ClawXpert was initialized, but {{names}} could not be initialized.',
      count: failedTemplateNames.length,
      names: failedTemplateNames.join(', ')
    })
  }

  private filterRecommendedTemplates(templates: TXpertTemplate[]) {
    const recommendedOrder = new Map(CLAWXPERT_RECOMMENDED_TEMPLATE_IDS.map((id, index) => [id, index]))
    return templates
      .filter((template) => recommendedOrder.has(template.id))
      .sort((a, b) => (recommendedOrder.get(a.id) ?? 0) - (recommendedOrder.get(b.id) ?? 0))
  }

  private async buildRecommendedTemplateItems(templates: TXpertTemplate[]): Promise<RecommendedTemplateItem[]> {
    const recommendedTemplates = this.filterRecommendedTemplates(templates)
    const requiredToolsetProviders = Array.from(
      new Set(
        recommendedTemplates.flatMap((template) =>
          this.readTemplateToolsetDependencies(template).map(({ provider }) => provider)
        )
      )
    )

    if (!requiredToolsetProviders.length) {
      return recommendedTemplates.map((template) => ({ template }))
    }

    const workspace = await this.readDefaultWorkspace()
    const toolsetsByProvider = workspace?.id
      ? await this.loadTemplateToolsetsByProvider(workspace.id, requiredToolsetProviders)
      : new Map<string, IXpertToolset[]>()

    return recommendedTemplates.map((template) => {
      const dependencies = this.readTemplateToolsetDependencies(template)
      const unavailableDependency = dependencies.find(
        (dependency) => !this.hasMatchingTemplateToolset(toolsetsByProvider.get(dependency.provider) ?? [], dependency)
      )

      if (!unavailableDependency) {
        return { template }
      }

      return {
        template,
        unavailableReasonKey: 'PAC.Chat.ClawXpert.RecommendedTemplateToolsetUnavailable',
        unavailableReasonParams: {
          name: unavailableDependency.instanceName || unavailableDependency.provider
        }
      }
    })
  }

  private async readDefaultWorkspace() {
    try {
      return await firstValueFrom(this.#workspaceService.getMyDefault({ purpose: 'authoring' }))
    } catch {
      return null
    }
  }

  private async loadTemplateToolsetsByProvider(workspaceId: string, providers: string[]) {
    const entries = await Promise.all(
      providers.map(async (provider) => {
        const response = await firstValueFrom(
          this.#toolsetService
            .getAllByWorkspace(workspaceId, {
              where: {
                type: provider,
                category: XpertToolsetCategoryEnum.BUILTIN
              },
              relations: ['tools'],
              order: {
                updatedAt: OrderTypeEnum.DESC
              }
            })
            .pipe(catchError(() => of({ items: [] as IXpertToolset[] })))
        )
        const toolsets = (response?.items ?? []).filter(
          (toolset) =>
            toolset.type === provider &&
            (toolset.category ?? XpertToolsetCategoryEnum.BUILTIN) === XpertToolsetCategoryEnum.BUILTIN
        )
        return [provider, toolsets] as const
      })
    )

    return new Map(entries)
  }

  private readTemplateToolsetDependencies(template: TXpertTemplate): RecommendedTemplateToolsetDependency[] {
    return (template.dependencies?.toolsets ?? [])
      .map((dependency) => {
        const provider = readNonEmptyString(dependency.provider)
        if (!provider) {
          return null
        }

        const instanceName = readNonEmptyString(dependency.instanceName)
        return {
          provider,
          ...(instanceName ? { instanceName } : {})
        }
      })
      .filter((dependency): dependency is RecommendedTemplateToolsetDependency => !!dependency)
  }

  private hasMatchingTemplateToolset(toolsets: IXpertToolset[], dependency: RecommendedTemplateToolsetDependency) {
    if (dependency.instanceName) {
      return toolsets.some((toolset) => toolset.name === dependency.instanceName)
    }

    return toolsets.length === 1
  }

  private isRecommendedTemplateAvailable(template: TXpertTemplate) {
    const item = this.recommendedTemplateItems()?.find((entry) => entry.template.id === template.id)
    return !item?.unavailableReasonKey
  }
}

function readNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeCopilotModelSelection(value: unknown): ICopilotModel | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const copilotId = readNonEmptyString(Reflect.get(value, 'copilotId'))
  const model = readNonEmptyString(Reflect.get(value, 'model'))
  if (!copilotId || !model) {
    return null
  }

  return {
    copilotId,
    model,
    modelType: AiModelTypeEnum.LLM
  }
}

function matchesInstalledPluginName(plugin: IPluginDescriptor, pluginName: string) {
  const normalizedPluginName = normalizePluginInstallName(pluginName)
  return [plugin.name, plugin.packageName, plugin.meta.name]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => normalizePluginInstallName(value) === normalizedPluginName)
}

function normalizePluginInstallName(pluginName: string) {
  const normalized = pluginName.trim()
  if (!normalized.includes('@')) {
    return normalized
  }

  const lastAt = normalized.lastIndexOf('@')
  return lastAt > 0 ? normalized.slice(0, lastAt) : normalized
}
