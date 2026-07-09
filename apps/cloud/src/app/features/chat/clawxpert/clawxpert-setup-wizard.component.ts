import { CommonModule } from '@angular/common'
import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { Component, computed, effect, inject, signal, viewChild } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { IPluginDescriptor, injectPluginAPI } from '@xpert-ai/cloud/state'
import { AiProviderRole, PluginMarketplaceItem } from '@xpert-ai/contracts'
import { BehaviorSubject, Subject, catchError, firstValueFrom, map, of, switchMap } from 'rxjs'
import {
  AiFeatureEnum,
  AiModelTypeEnum,
  CopilotServerService,
  getErrorMessage,
  I18nObject,
  ICopilot,
  ICopilotModel,
  ICopilotWithProvider,
  Store,
  ToastrService
} from '../../../@core'
import { CopilotConfigFormComponent, CopilotModelSelectComponent } from '../../../@shared/copilot'
import { PluginInstallComponent } from '../../setting/plugins/install/install.component'
import { PLUGIN_MARKETPLACE_TARGET_APP } from '../../setting/plugins/plugin-marketplace-categories'
import { TPluginWithDownloads } from '../../setting/plugins/types'
import { ClawXpertBootstrapService, resolveFirstClawXpertLlmModel } from './clawxpert-bootstrap.service'
import { ClawXpertFacade } from './clawxpert.facade'

@Component({
  standalone: true,
  selector: 'pac-clawxpert-setup-wizard',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ZardButtonComponent,
    CopilotModelSelectComponent,
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

      <section data-onboarding-step="model-provider" class="min-h-0 flex-1 overflow-auto px-6 py-5">
        <div class="min-w-0">
          <div class="text-base font-semibold text-text-primary">
            {{ 'PAC.Chat.ClawXpert.ModelProviderStepTitle' | translate }}
          </div>
          <p class="mt-2 text-sm leading-6 text-text-secondary">
            {{ modelProviderHelpText() | translate }}
          </p>
        </div>

        @if (llmCopilots() === null) {
          <div class="mt-4 flex min-h-48 items-center justify-center gap-2 text-sm text-text-secondary">
            <i class="ri-loader-4-line animate-spin"></i>
            <span>{{ 'PAC.Chat.ClawXpert.CheckingModelProviders' | translate }}</span>
          </div>
        } @else if (hasLlmModelProvider()) {
          <div
            data-model-provider-config-form
            class="mt-4 rounded-xl border border-divider-regular bg-components-card-bg p-4"
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

          <div
            data-model-plugin-section="initialized"
            class="mt-4 rounded-xl border border-divider-regular bg-components-card-bg p-4"
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
                    <span class="shrink-0 rounded-full bg-background-default px-2.5 py-1 text-xs text-text-tertiary">
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

          <button
            z-button
            zType="outline"
            displayDensity="cosy"
            type="button"
            class="mt-4"
            data-model-plugin-more
            (click)="toggleMoreModelPlugins()"
          >
            {{ 'PAC.Chat.ClawXpert.MoreModelPlugins' | translate: { Default: 'More model plugins' } }}
          </button>

          @if (showMoreModelPlugins()) {
            <div
              data-model-plugin-section="uninitialized"
              class="mt-4 rounded-xl border border-divider-regular bg-components-card-bg p-4"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="text-sm font-semibold text-text-primary">
                  {{ 'PAC.Chat.ClawXpert.UninitializedModelPlugins' | translate }}
                </div>
                <span class="rounded-full bg-background-default-subtle px-2 py-1 text-xs text-text-tertiary">
                  {{ uninitializedModelPlugins().length }}
                </span>
              </div>

              @if (marketplacePlugins() === null) {
                <div
                  class="mt-3 rounded-xl border border-dashed border-divider-regular px-3 py-6 text-sm text-text-secondary"
                >
                  {{ 'PAC.Chat.ClawXpert.LoadingPlugins' | translate }}
                </div>
              } @else {
                <div class="mt-3 space-y-3">
                  @for (plugin of uninitializedModelPlugins(); track plugin.packageName || plugin.name) {
                    <div class="rounded-xl border border-dashed border-divider-regular bg-components-card-bg px-3 py-3">
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
              }
            </div>
          }
        } @else {
          <div class="mt-4 text-sm font-medium text-text-primary">
            {{ 'PAC.Chat.ClawXpert.ContactAdminForModelProvider' | translate }}
          </div>
          <div class="mt-1 text-sm leading-6 text-text-secondary">
            {{ 'PAC.Chat.ClawXpert.ContactAdminForModelProviderDesc' | translate }}
          </div>
        }
      </section>

      <div class="flex items-center justify-between gap-3 border-t border-divider-regular px-6 py-4">
        <div class="text-sm text-text-tertiary">
          @if (!hasLoadedLlmModelProviders()) {
            {{ 'PAC.Chat.ClawXpert.CheckingModelProviders' | translate }}
          } @else if (!hasCopilotFeature()) {
            {{ 'PAC.Chat.ClawXpert.CopilotFeatureDisabled' | translate }}
          } @else if (!hasLlmModelProvider()) {
            {{ 'PAC.Chat.ClawXpert.ModelProviderRequiredBeforeCreate' | translate }}
          } @else if (!hasSelectedCopilotModel()) {
            {{ 'PAC.Chat.ClawXpert.SelectModelBeforeCreate' | translate }}
          } @else {
            {{ 'PAC.Chat.ClawXpert.ReadyToCreate' | translate }}
          }
        </div>

        <div class="flex shrink-0 items-center gap-2">
          @if (hasLoadedLlmModelProviders()) {
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
  `
})
export class ClawXpertSetupWizardComponent {
  readonly #bootstrap = inject(ClawXpertBootstrapService)
  readonly #facade = inject(ClawXpertFacade)
  readonly #dialog = inject(Dialog)
  readonly #dialogRef = inject<DialogRef<unknown> | null>(DialogRef, { optional: true })
  readonly #copilotServer = inject(CopilotServerService)
  readonly #store = inject(Store)
  readonly #pluginAPI = injectPluginAPI()
  readonly #toastr = inject(ToastrService)
  readonly modelProviderForm = viewChild(CopilotConfigFormComponent)
  readonly #installedPluginsRefresh$ = new BehaviorSubject<void>(undefined)
  readonly #marketplaceRefresh$ = new Subject<void>()
  readonly llmModelType = AiModelTypeEnum.LLM
  readonly creatingXpert = signal(false)
  readonly enablingPrimaryCopilot = signal(false)
  readonly savingModelProvider = signal(false)
  readonly showMoreModelPlugins = signal(false)
  readonly selectedCopilotModel = signal<ICopilotModel | null>(null)

  readonly installedPlugins = toSignal(
    this.#installedPluginsRefresh$.pipe(
      switchMap(() =>
        this.#pluginAPI.getPlugins().pipe(
          map((items) => (items ?? []).map(toInstalledOnboardingPlugin)),
          catchError(() => of([] as TPluginWithDownloads[]))
        )
      )
    ),
    {
      initialValue: [] as TPluginWithDownloads[]
    }
  )
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
  readonly installedModelPlugins = computed(() =>
    this.installedPlugins().filter((plugin) => plugin.category === 'model')
  )
  readonly uninitializedModelPlugins = computed(() =>
    (this.marketplacePlugins() ?? []).filter((plugin) => plugin.category === 'model' && !plugin.installed)
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
  readonly hasLoadedLlmModelProviders = computed(() => this.llmCopilots() !== null)
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
      if (this.hasLoadedLlmModelProviders() && !this.hasLlmModelProvider()) {
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
          reload: () => this.reloadModelPlugins()
        },
        disableClose: true
      })
      .closed.subscribe(() => this.reloadModelPlugins())
  }

  toggleMoreModelPlugins() {
    const next = !this.showMoreModelPlugins()
    this.showMoreModelPlugins.set(next)
    if (next && this.marketplacePlugins() === null) {
      this.#marketplaceRefresh$.next()
    }
  }

  async createAndBindClawXpert() {
    const selectedCopilotModel = this.modelProviderForm() ? this.readFormCopilotModel() : this.selectedCopilotModel()
    if (this.creatingXpert() || !this.canCreateXpert() || !selectedCopilotModel) {
      return
    }

    this.creatingXpert.set(true)
    try {
      const bindableXpert = await this.#bootstrap.createClawXpert(selectedCopilotModel)
      await this.#facade.bindPublishedXpert(bindableXpert, {
        navigateToChat: true,
        bindNextConversationToXpert: true
      })
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

  private reloadModelPlugins() {
    this.#installedPluginsRefresh$.next()
    if (this.marketplacePlugins() !== null) {
      this.#marketplaceRefresh$.next()
    }
  }

  private readFormCopilotModel(): ICopilotModel | null {
    const model = this.modelProviderForm()?.formGroup.value.copilotModel as ICopilotModel | null | undefined
    return model?.copilotId && model.model ? model : null
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
    artifactNamespace: item.artifactNamespace ?? null,
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

function toInstalledOnboardingPlugin(item: IPluginDescriptor): TPluginWithDownloads {
  const name = item.name || item.packageName || ''
  const meta = item.meta

  return {
    name,
    packageName: item.packageName ?? name,
    displayName: meta.displayName ?? meta.name ?? name,
    description: meta.description ?? meta.name ?? name,
    version: item.currentVersion ?? meta.version ?? '',
    level: item.level ?? meta.level,
    deprecated: meta.deprecated,
    deprecationMessage: meta.deprecationMessage,
    category: meta.category ?? 'integration',
    icon: meta.icon ?? {
      type: 'font',
      value: 'ri-puzzle-2-line'
    },
    author: {
      name: meta.author || 'XpertAI',
      url: meta.homepage || ''
    },
    keywords: meta.keywords,
    installed: true,
    targetAppMeta: meta.targetAppMeta ?? null
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
