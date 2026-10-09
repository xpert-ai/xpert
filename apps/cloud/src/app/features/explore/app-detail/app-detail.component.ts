import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { CopilotModelSelectComponent } from '@cloud/app/@shared/copilot/copilot-model-select/select.component'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { AiModelTypeEnum, ICopilotModel, ModelFeature, PluginApplicationToolsetSelection } from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, injectToastr, PluginApplicationDetail, PluginApplicationService } from '@cloud/app/@core'
import { injectPluginAPI, IPluginComponentDefinition } from '@cloud/app/@core/state'
import { IconComponent } from '@cloud/app/@shared/avatar'
import {
  XpI18nPipe,
  ZardAccordionImports,
  ZardAlertDialogService,
  ZardButtonComponent,
  ZardIconComponent
} from '@xpert-ai/headless-ui'
import { PluginMarketplaceMcpProviderComponent } from '../../setting/plugins/marketplace/marketplace-mcp-provider.component'
import {
  isRuntimeNativeMcp,
  runtimeMcpProviderDescription,
  runtimeMcpProviderKey,
  runtimeMcpProviderName,
  runtimeMcpProviderToolCount
} from '../../setting/plugins/marketplace/runtime-mcp-provider.util'
import { pluginApplicationDefaultCopilotModel, pluginApplicationModelId } from './app-detail-model.util'
import { ApplicationToolsetsComponent } from './app-toolsets.component'
import { applicationToolsetsSelected, reconcileApplicationToolsets } from './app-toolsets.util'

/** Marketplace detail and governed initialization surface for a trusted plugin App. */
@Component({
  standalone: true,
  selector: 'xp-application-detail',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    TranslateModule,
    IconComponent,
    CopilotModelSelectComponent,
    XpI18nPipe,
    ...ZardAccordionImports,
    ZardButtonComponent,
    ZardIconComponent,
    PluginMarketplaceMcpProviderComponent,
    ApplicationToolsetsComponent
  ],
  templateUrl: './app-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full min-h-full bg-background' }
})
export class ApplicationDetailComponent {
  readonly #route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly #applications = inject(PluginApplicationService)
  readonly #pluginAPI = injectPluginAPI()
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)
  readonly #alertDialog = inject(ZardAlertDialogService)

  readonly loading = signal(true)
  readonly initializing = signal(false)
  readonly detail = signal<PluginApplicationDetail | null>(null)
  readonly mcpProviders = signal<IPluginComponentDefinition[]>([])
  readonly setupOpen = signal(this.#route.snapshot.queryParamMap.get('setup') === '1')
  readonly embeddingModel = model<Partial<ICopilotModel> | null>(null)
  readonly visionModel = model<Partial<ICopilotModel> | null>(null)
  readonly toolsetSelections = signal<PluginApplicationToolsetSelection[]>([])
  readonly refreshingToolsets = signal(false)
  readonly configuringToolsets = signal(false)
  readonly discarding = signal(false)
  readonly toolsetRequirements = computed(() => this.detail()?.preflight.toolsetRequirements ?? [])
  readonly modelType = AiModelTypeEnum
  readonly visionFeatures = [ModelFeature.VISION]

  readonly application = computed(() => this.detail()?.application ?? null)
  readonly presentation = computed(() => this.application()?.config.presentation ?? null)
  readonly status = computed(() => this.detail()?.status.status ?? 'not_installed')
  readonly isReady = computed(() => this.status() === 'ready')
  readonly modelRequirements = computed(() => this.detail()?.preflight.modelRequirements ?? {})
  readonly embeddingModelId = computed(() => pluginApplicationModelId(this.embeddingModel()))
  readonly visionModelId = computed(() => pluginApplicationModelId(this.visionModel()))
  readonly canSubmit = computed(
    () =>
      !!this.detail()?.preflight.canInitialize &&
      (!this.modelRequirements().embedding || !!this.embeddingModelId()) &&
      (!this.modelRequirements().vision || !!this.visionModelId()) &&
      applicationToolsetsSelected(this.toolsetRequirements(), this.toolsetSelections()) &&
      !this.refreshingToolsets() &&
      !this.configuringToolsets() &&
      !this.discarding() &&
      this.status() !== 'initializing' &&
      !this.initializing()
  )

  constructor() {
    void this.load()
  }

  /** Loads trusted App metadata and seeds each required selector from server-authorized options. */
  async load() {
    const pluginName = this.#route.snapshot.queryParamMap.get('plugin')?.trim()
    const appName = this.#route.snapshot.paramMap.get('appName')?.trim()
    if (!pluginName || !appName) {
      this.loading.set(false)
      this.#toastr.error(
        this.#translate.instant('XP.Explore.Application.MissingIdentifier', {
          Default: 'The application or plugin identifier is missing.'
        })
      )
      return
    }

    this.loading.set(true)
    try {
      const detail = await firstValueFrom(this.#applications.getDetail(pluginName, appName))
      this.detail.set(detail)
      this.toolsetSelections.update((previous) =>
        reconcileApplicationToolsets(detail.preflight.toolsetRequirements ?? [], previous)
      )
      await this.loadMcpProviders(pluginName)
      this.embeddingModel.set(
        pluginApplicationDefaultCopilotModel(
          detail.preflight.embeddingModels,
          detail.preflight.defaultEmbeddingModelId,
          AiModelTypeEnum.TEXT_EMBEDDING
        )
      )
      this.visionModel.set(
        pluginApplicationDefaultCopilotModel(
          detail.preflight.visionModels,
          detail.preflight.defaultVisionModelId,
          AiModelTypeEnum.LLM
        )
      )
    } catch (error) {
      this.detail.set(null)
      this.mcpProviders.set([])
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }

  readonly reloadMcpProviders = () => {
    const pluginName = this.application()?.pluginName
    if (pluginName) void this.loadMcpProviders(pluginName)
  }

  async refreshToolsets() {
    const app = this.application()
    if (!app || this.refreshingToolsets()) return
    this.refreshingToolsets.set(true)
    try {
      const detail = await firstValueFrom(this.#applications.getDetail(app.pluginName, app.appName))
      this.detail.set(detail)
      this.toolsetSelections.update((previous) =>
        reconcileApplicationToolsets(detail.preflight.toolsetRequirements ?? [], previous)
      )
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.refreshingToolsets.set(false)
    }
  }

  async loadMcpProviders(pluginName: string) {
    try {
      const result = await firstValueFrom(this.#pluginAPI.getPluginComponents(pluginName))
      this.mcpProviders.set((result.items ?? []).filter(isRuntimeNativeMcp))
    } catch {
      this.mcpProviders.set([])
    }
  }

  mcpProviderName(component: IPluginComponentDefinition) {
    return runtimeMcpProviderName(component)
  }

  mcpProviderDescription(component: IPluginComponentDefinition) {
    return runtimeMcpProviderDescription(component)
  }

  mcpProviderKey(component: IPluginComponentDefinition) {
    return runtimeMcpProviderKey(component)
  }

  mcpProviderToolCount(component: IPluginComponentDefinition) {
    return runtimeMcpProviderToolCount(component)
  }

  primaryAction() {
    if (this.isReady()) {
      this.openApplication(this.detail()?.status)
      return
    }
    this.setupOpen.set(true)
  }

  primaryActionLabel() {
    if (this.isReady()) {
      return this.#translate.instant('XP.Explore.Application.Action.Open', { Default: 'Open application' })
    }
    if (this.detail()?.preflight.reason === 'role_required') {
      return this.#translate.instant('XP.Explore.Application.Action.ContactAdministrator', {
        Default: 'Contact administrator'
      })
    }
    if (this.detail()?.preflight.reason === 'organization_scope_required') {
      return this.#translate.instant('XP.Explore.Application.Action.SwitchOrganization', {
        Default: 'Switch organization'
      })
    }
    if (this.detail()?.preflight.reason === 'scope_not_supported') {
      return this.#translate.instant('XP.Explore.Application.Action.NotSupported', { Default: 'Not supported yet' })
    }
    if (this.status() === 'configuring') {
      return this.#translate.instant('XP.Explore.Application.Action.ContinueConfiguration')
    }
    if (this.status() === 'degraded') {
      return this.#translate.instant('XP.Explore.Application.Action.Repair', { Default: 'Repair application' })
    }
    if (this.status() === 'initializing') {
      return this.#translate.instant('XP.Explore.Application.Action.Initializing', { Default: 'Initializing…' })
    }
    return this.#translate.instant('XP.Explore.Application.Action.ApplyToOrganization', {
      Default: 'Apply to current organization'
    })
  }

  /** Closes setup and removes its deep-link flag before any follow-up navigation. */
  async closeSetup(): Promise<void> {
    if (this.configuringToolsets() || this.discarding() || this.initializing()) return
    this.setupOpen.set(false)
    await this.#router.navigate([], {
      relativeTo: this.#route,
      queryParams: { setup: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    })
  }

  async discardConfiguration() {
    const app = this.application()
    if (
      !app ||
      !this.detail()?.status.canDiscardConfiguration ||
      this.discarding() ||
      this.configuringToolsets() ||
      this.initializing()
    )
      return
    this.discarding.set(true)
    try {
      const confirmed = await firstValueFrom(
        this.#alertDialog.confirm({
          title: this.#translate.instant('XP.Explore.Application.Toolsets.Discard'),
          description: this.#translate.instant('XP.Explore.Application.Toolsets.DiscardDescription'),
          actionText: this.#translate.instant('XP.Explore.Application.Toolsets.Discard'),
          cancelText: this.#translate.instant('XP.ACTIONS.Cancel'),
          destructive: true
        })
      )
      if (!confirmed) return
      await firstValueFrom(
        this.#applications.discardConfiguration({ pluginName: app.pluginName, appName: app.appName })
      )
      this.toolsetSelections.set([])
      await this.refreshToolsets()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.discarding.set(false)
    }
  }

  /** Submits authorized configuration IDs; credentials and target scope remain server-owned. */
  async initialize() {
    const app = this.application()
    if (!app || !this.canSubmit()) {
      return
    }

    this.initializing.set(true)
    try {
      const status = await firstValueFrom(
        this.#applications.initialize({
          pluginName: app.pluginName,
          appName: app.appName,
          embeddingModelId: this.embeddingModelId() ?? undefined,
          visionModelId: this.visionModelId() ?? undefined,
          toolsets: this.toolsetSelections(),
          operationId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
        })
      )
      this.detail.update((detail) => (detail ? { ...detail, status } : detail))
      if (status.status === 'ready') {
        this.#toastr.success(
          this.#translate.instant('XP.Explore.Application.InitializedSuccessfully', {
            Default: 'The application was initialized successfully.'
          })
        )
        this.initializing.set(false)
        await this.closeSetup()
        this.openApplication(status)
      }
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
      await this.load()
    } finally {
      this.initializing.set(false)
    }
  }

  openApplication(status = this.detail()?.status) {
    if (status?.assistantSlug) {
      void this.#router.navigate(['/chat/x', status.assistantSlug, 'c'])
    }
  }

  preflightMessage() {
    switch (this.detail()?.preflight.reason) {
      case 'toolset_provider_required':
        return this.#translate.instant('XP.Explore.Application.Toolsets.ProvidersRequired')
      case 'toolset_configuration_required':
        return this.#translate.instant('XP.Explore.Application.Toolsets.ConfigurationsRequired')
      case 'organization_scope_required':
        return this.#translate.instant('XP.Explore.Application.Preflight.OrganizationRequired', {
          Default: 'Switch to an organization before enabling this organization-scoped application.'
        })
      case 'role_required':
        return this.#translate.instant('XP.Explore.Application.Preflight.RoleRequired', {
          Default: 'You can view the application details, but an organization administrator must initialize it.'
        })
      case 'primary_model_required':
        return this.#translate.instant('XP.Explore.Application.Preflight.PrimaryModelRequired', {
          Default: 'The current organization has no available primary language model. Configure a model first.'
        })
      case 'embedding_model_required':
        return this.#translate.instant('XP.Explore.Application.Preflight.EmbeddingModelRequired', {
          Default: 'The current organization has no available embedding model. Configure a model first.'
        })
      case 'vision_model_required':
        return this.#translate.instant('XP.Explore.Application.Preflight.VisionModelRequired', {
          Default: 'The current organization has no model with vision support. Configure a model first.'
        })
      case 'scope_not_supported':
        return this.#translate.instant('XP.Explore.Application.Preflight.ScopeNotSupported', {
          Default: 'Application initialization is not available for this scope yet.'
        })
      default:
        return ''
    }
  }

  statusLabel() {
    switch (this.status()) {
      case 'configuring':
        return this.#translate.instant('XP.Explore.Application.Status.Configuring')
      case 'ready':
        return this.#translate.instant('XP.Explore.Application.Status.Ready', { Default: 'Enabled' })
      case 'initializing':
        return this.#translate.instant('XP.Explore.Application.Status.Initializing', { Default: 'Initializing' })
      case 'failed':
        return this.#translate.instant('XP.Explore.Application.Status.Failed', { Default: 'Initialization failed' })
      case 'degraded':
        return this.#translate.instant('XP.Explore.Application.Status.Degraded', { Default: 'Needs repair' })
      default:
        return this.#translate.instant('XP.Explore.Application.Status.NotInstalled', { Default: 'Setup required' })
    }
  }

  scopeLabel() {
    switch (this.application()?.scope) {
      case 'tenant':
        return this.#translate.instant('XP.Explore.Application.Scope.Tenant', { Default: 'Tenant' })
      case 'personal':
        return this.#translate.instant('XP.Explore.Application.Scope.Personal', { Default: 'Personal' })
      default:
        return this.#translate.instant('XP.Explore.Application.Scope.Organization', { Default: 'Organization' })
    }
  }

  initializationSteps() {
    return (
      this.presentation()?.initializationSteps ?? [
        this.#translate.instant('XP.Explore.Application.DefaultStepWorkspace', {
          Default: 'Create a dedicated application workspace'
        }),
        this.#translate.instant('XP.Explore.Application.DefaultStepKnowledgebase', {
          Default: 'Create the plugin-declared knowledge base'
        }),
        this.#translate.instant('XP.Explore.Application.DefaultStepAssistant', {
          Default: 'Install and publish the Assistant'
        })
      ]
    )
  }

  screenshotAlt(appName: string | null | undefined) {
    return this.#translate.instant('XP.Explore.Application.ScreenshotAlt', {
      Default: 'Screenshot of {{app}}',
      app: appName ?? ''
    })
  }

  developerLabel() {
    return this.#translate.instant('XP.Explore.Application.DeveloperLabel', {
      Default: 'Developer: {{developer}}',
      developer: this.presentation()?.developer || 'XpertAI'
    })
  }

  enableApplicationLabel(appName: string | null | undefined) {
    return this.#translate.instant('XP.Explore.Application.EnableApp', {
      Default: 'Enable {{app}}',
      app: appName ?? ''
    })
  }

  initializeActionLabel() {
    if (this.initializing()) {
      return this.#translate.instant('XP.Explore.Application.Action.Initializing', { Default: 'Initializing…' })
    }
    if (this.status() === 'degraded') {
      return this.#translate.instant('XP.Explore.Application.Action.RepairAndReinitialize', {
        Default: 'Repair and reinitialize'
      })
    }
    if (this.status() === 'configuring') {
      return this.#translate.instant('XP.Explore.Application.Action.ApplyToOrganization', {
        Default: 'Apply to current organization'
      })
    }
    return this.primaryActionLabel()
  }
}
