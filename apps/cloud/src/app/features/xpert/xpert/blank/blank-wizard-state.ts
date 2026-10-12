import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { computed, Directive, effect, inject, model, signal, viewChild } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import {
  injectPluginAPI,
  injectWorkspace,
  PLUGIN_COMPONENT_TYPE,
  type PluginResourceComponentSelector
} from '@cloud/app/@core/state'
import { TranslateService } from '@ngx-translate/core'
import { AiModelTypeEnum, AiProviderRole } from '@xpert-ai/contracts'
import { parseYAML } from '@xpert-ai/headless-ui'
import { CopilotConfigFormComponent } from 'apps/cloud/src/app/@shared/copilot'
import { CHAT_WORKFLOW_TRIGGER_PROVIDER, WorkflowTriggerProviderOption } from 'apps/cloud/src/app/@shared/workflow'
import { XpertBasicFormComponent } from 'apps/cloud/src/app/@shared/xpert'
import { NgxPermissionsService } from 'ngx-permissions'
import {
  BehaviorSubject,
  catchError,
  distinctUntilChanged,
  from,
  map,
  Observable,
  of,
  startWith,
  switchMap,
  take
} from 'rxjs'
import {
  AIPermissionsEnum,
  convertToUrlPath,
  CopilotServerService,
  EnvironmentService,
  getErrorMessage,
  ICopilot,
  ICopilotModel,
  ICopilotWithProvider,
  IDocumentChunkerProvider,
  IDocumentProcessorProvider,
  IDocumentSourceProvider,
  IDocumentUnderstandingProvider,
  isUserAddableAgentMiddleware,
  IXpertWorkspace,
  KnowledgebaseService,
  OrderTypeEnum,
  SkillPackageService,
  SkillRepositoryService,
  TAgentMiddlewareDescriptor,
  TAvatar,
  ToastrService,
  TWorkflowTriggerMeta,
  TXpertTeamDraft,
  TXpertTemplate,
  WorkflowNodeTypeEnum,
  XpertAgentService,
  XpertAPIService,
  XpertTemplateService,
  XpertToolsetService,
  XpertTypeEnum,
  XpertWorkspaceService
} from '../../../../@core'
import { injectConfigureBuiltin } from '../../tools'
import {
  BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER,
  BlankRepositoryDefaultSelection,
  BlankTriggerSelection,
  BlankWorkflowStarterNodeKey,
  hasBlankWizardSelections
} from './blank-draft.util'
import { BlankXpertStartMode } from './blank-template.util'
import {
  BLANK_XPERT_DIALOG_CATEGORY,
  BlankMiddlewareProviderOption,
  BlankTemplateCatalog,
  BlankTemplatePluginSkillBinding,
  BlankTemplatePluginSkillDependencyGroup,
  BlankTemplateToolsetDependency,
  BlankTemplateToolsetPreparation,
  BlankTemplateToolsetSelectionState,
  BlankWorkspaceSkillItem,
  BlankXpertDialogData,
  BlankXpertWizardResult,
  buildBlankWorkspaceSkillState,
  EMPTY_BLANK_SKILL_STATE,
  matchesMiddlewareSearch,
  normalizeBlankXpertDialogCategory,
  readNonEmptyString,
  UNAVAILABLE_TEMPLATE_MIDDLEWARE_DESCRIPTION,
  uniqueByName,
  WORKFLOW_ACTION_NODE_OPTIONS,
  WORKFLOW_TRANSFORM_NODE_OPTIONS
} from './blank-wizard-data'
import {
  BLANK_XPERT_WORKFLOW_MODE,
  BlankXpertCompletionMode,
  BlankXpertMode,
  getBlankWizardAvailableModes,
  getBlankWizardDefaultMode,
  getBlankWizardPersistedType
} from './blank-wizard.util'

@Directive()
export abstract class BlankWizardState {
  eXpertTypeEnum = XpertTypeEnum

  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  workflowMode = BLANK_XPERT_WORKFLOW_MODE

  readonly _dialogRef = inject(DialogRef<BlankXpertWizardResult>)

  readonly _dialog = inject(Dialog)

  readonly _dialogData = inject<BlankXpertDialogData>(DIALOG_DATA)

  readonly _selectedWorkspace = injectWorkspace()

  readonly _pluginAPI = injectPluginAPI()

  readonly _configureBuiltinToolset = injectConfigureBuiltin()

  readonly _skillPackageService = inject(SkillPackageService)

  readonly _skillRepositoryService = inject(SkillRepositoryService)

  readonly _toolsetService = inject(XpertToolsetService)

  readonly xpertService = inject(XpertAPIService)

  readonly xpertAgentService = inject(XpertAgentService)

  readonly templateService = inject(XpertTemplateService)

  readonly workspaceService = inject(XpertWorkspaceService)

  readonly knowledgebaseService = inject(KnowledgebaseService)

  readonly environmentService = inject(EnvironmentService)

  readonly _copilotServer = inject(CopilotServerService)

  readonly _permissionsService = inject(NgxPermissionsService)

  readonly _toastr = inject(ToastrService)

  readonly _translate = inject(TranslateService)

  readonly basicForm = viewChild(XpertBasicFormComponent)

  readonly clawCopilotForm = viewChild<CopilotConfigFormComponent>('clawCopilotForm')

  readonly requestedType = signal(this._dialogData.type ?? null)

  readonly allowedModes = this._dialogData.allowedModes ?? null

  readonly completionMode = this._dialogData.completionMode ?? ('create' as BlankXpertCompletionMode)

  readonly templateCategory = normalizeBlankXpertDialogCategory(this._dialogData.category)

  readonly usesWorkspaceSkillDefaults = computed(() => this.templateCategory === BLANK_XPERT_DIALOG_CATEGORY.CLAW)

  readonly allowWorkspaceSelection = !!this._dialogData.allowWorkspaceSelection

  readonly lockStartMode = !!this._dialogData.lockStartMode

  readonly lockType = !!this._dialogData.lockType

  readonly skipTemplateSelectionStep =
    !!this._dialogData.skipTemplateSelectionStep &&
    this._dialogData.initialStartMode === 'template' &&
    !!this._dialogData.initialTemplateId

  readonly agentInitialStepIndex = this.skipTemplateSelectionStep ? 1 : 0

  readonly initialMode = getBlankWizardDefaultMode(this._dialogData.type, this.allowedModes)

  readonly availableModes = computed(() =>
    this.lockType ? [this.initialMode] : getBlankWizardAvailableModes(this.requestedType(), this.allowedModes)
  )

  readonly types = model<BlankXpertMode[]>([this.initialMode])

  readonly selectedMode = computed<BlankXpertMode>(
    () => this.types()[0] ?? getBlankWizardDefaultMode(this.requestedType(), this.allowedModes)
  )

  readonly selectedType = computed(() => getBlankWizardPersistedType(this.selectedMode()))

  readonly isAgentType = computed(() => this.selectedMode() === XpertTypeEnum.Agent)

  readonly isWorkflowType = computed(() => this.selectedMode() === BLANK_XPERT_WORKFLOW_MODE)

  readonly isKnowledgeType = computed(() => this.selectedMode() === XpertTypeEnum.Knowledge)

  readonly isClawAgentWizard = computed(
    () => this.templateCategory === BLANK_XPERT_DIALOG_CATEGORY.CLAW && this.isAgentType()
  )

  readonly startMode = model<BlankXpertStartMode>(this._dialogData.initialStartMode ?? 'blank')

  readonly workspaceId = model<string | null>(this._dialogData.workspace?.id ?? this._selectedWorkspace()?.id ?? null)

  readonly name = model<string>()

  readonly description = model<string>()

  readonly avatar = model<TAvatar>()

  readonly title = model<string>()

  readonly copilotModel = model<ICopilotModel>(this._dialogData.defaultCopilotModel ?? undefined)

  readonly isolateWorkspaceData = signal(false)

  readonly selectedTemplateId = model<string | null>(this._dialogData.initialTemplateId ?? null)

  readonly selectedTemplate = signal<TXpertTemplate | null>(null)

  readonly selectedTemplateDraft = signal<TXpertTeamDraft | null>(null)

  readonly templateLoading = signal(false)

  readonly templateLoadError = signal<string | null>(null)

  readonly templatePluginSkillInstallError = signal<string | null>(null)

  readonly templatePluginSkillBindings = signal<BlankTemplatePluginSkillBinding[]>([])

  readonly templateToolsetInstallError = signal<string | null>(null)

  readonly agentTemplateCatalogLoading = signal(true)

  readonly agentTemplateCatalogError = signal<string | null>(null)

  readonly knowledgeTemplateCatalogLoading = signal(true)

  readonly knowledgeTemplateCatalogError = signal<string | null>(null)

  readonly _refreshWorkspaces$ = new BehaviorSubject<void>(undefined)

  readonly workspaces = toSignal(
    this._refreshWorkspaces$.pipe(
      switchMap(() =>
        this.workspaceService
          .getAllMy({ order: { updatedAt: OrderTypeEnum.DESC } }, { purpose: 'authoring' })
          .pipe(map(({ items }) => items))
      )
    ),
    { initialValue: [] as IXpertWorkspace[] }
  )

  readonly agentTemplateCatalog = toSignal(
    this.templateService.getSummaries().pipe(
      map((summaries) => {
        const items = summaries.filter((template) => template.type === XpertTypeEnum.Agent)
        return {
          choices: items.map((template) => ({
            id: template.id,
            name: template.name,
            title: template.title,
            description: template.description,
            category: template.category,
            avatar: template.avatar
          })),
          items
        } satisfies BlankTemplateCatalog
      }),
      map((catalog) => {
        this.agentTemplateCatalogLoading.set(false)
        this.agentTemplateCatalogError.set(null)
        return catalog
      }),
      catchError((error) => {
        this.agentTemplateCatalogLoading.set(false)
        this.agentTemplateCatalogError.set(getErrorMessage(error))
        return of({ choices: [], items: [] } satisfies BlankTemplateCatalog)
      })
    ),
    { initialValue: { choices: [], items: [] } satisfies BlankTemplateCatalog }
  )

  readonly knowledgeTemplateCatalog = toSignal(
    this.templateService.getAllKnowledgePipelines({}).pipe(
      map(
        ({ templates }) =>
          ({
            choices: templates.map((template) => ({
              id: template.id,
              name: template.name,
              title: template.title,
              description: template.description,
              category: template.category,
              icon: template.icon
            })),
            items: templates
          }) satisfies BlankTemplateCatalog
      ),
      map((catalog) => {
        this.knowledgeTemplateCatalogLoading.set(false)
        this.knowledgeTemplateCatalogError.set(null)
        return catalog
      }),
      catchError((error) => {
        this.knowledgeTemplateCatalogLoading.set(false)
        this.knowledgeTemplateCatalogError.set(getErrorMessage(error))
        return of({ choices: [], items: [] } satisfies BlankTemplateCatalog)
      })
    ),
    { initialValue: { choices: [], items: [] } satisfies BlankTemplateCatalog }
  )

  readonly workspaceOptions = computed(() =>
    this.workspaces().map((workspace) => ({
      value: workspace.id,
      label: workspace.name
    }))
  )

  readonly triggerProviders = toSignal(this.xpertService.getTriggerProviders(), {
    initialValue: [] as TWorkflowTriggerMeta[]
  })

  readonly middlewareProviders = toSignal(this.xpertAgentService.agentMiddlewares$, {
    initialValue: [] as TAgentMiddlewareDescriptor[]
  })

  readonly dataSourceProviders = toSignal(this.knowledgebaseService.documentSourceStrategies$, {
    initialValue: [] as { meta: IDocumentSourceProvider; integration: { service: string } }[]
  })

  readonly processorProviders = toSignal(this.knowledgebaseService.documentTransformerStrategies$, {
    initialValue: [] as { meta: IDocumentProcessorProvider; integration: { service: string } }[]
  })

  readonly chunkerProviders = toSignal(this.knowledgebaseService.textSplitterStrategies$, {
    initialValue: [] as IDocumentChunkerProvider[]
  })

  readonly understandingProviders = toSignal(this.knowledgebaseService.understandingStrategies$, {
    initialValue: [] as {
      meta: IDocumentUnderstandingProvider
      requireVisionModel: boolean
      integration: { service: string }
    }[]
  })

  readonly modelProviderLoadError = signal<string | null>(null)

  readonly availableLlmCopilots = toSignal(
    toObservable(this.isClawAgentWizard).pipe(
      distinctUntilChanged(),
      switchMap((enabled) => {
        if (!enabled) {
          this.modelProviderLoadError.set(null)
          return of(null as ICopilotWithProvider[] | null)
        }

        return this._copilotServer.getCopilotModels(AiModelTypeEnum.LLM).pipe(
          map((copilots) => {
            this.modelProviderLoadError.set(null)
            return copilots ?? []
          }),
          catchError((error) => {
            this.modelProviderLoadError.set(getErrorMessage(error) || 'Failed to load model providers.')
            return of([] as ICopilotWithProvider[])
          })
        )
      })
    ),
    { initialValue: null as ICopilotWithProvider[] | null }
  )

  readonly orgCopilots = toSignal(
    toObservable(this.isClawAgentWizard).pipe(
      distinctUntilChanged(),
      switchMap((enabled) => {
        if (!enabled) {
          return of([] as ICopilot[])
        }

        return this._copilotServer.refresh$.pipe(
          switchMap(() => this._copilotServer.getAllInOrg()),
          map(({ items }) => items ?? []),
          catchError((error) => {
            this.modelProviderLoadError.set(getErrorMessage(error) || 'Failed to load model providers.')
            return of([] as ICopilot[])
          })
        )
      })
    ),
    { initialValue: [] as ICopilot[] }
  )

  readonly hasCopilotEditPermission = toSignal(
    this._permissionsService.permissions$.pipe(
      map((permissions) => !!permissions[AIPermissionsEnum.COPILOT_EDIT]),
      startWith(!!this._permissionsService.getPermissions()[AIPermissionsEnum.COPILOT_EDIT])
    ),
    { initialValue: !!this._permissionsService.getPermissions()[AIPermissionsEnum.COPILOT_EDIT] }
  )

  readonly triggerProviderOptions = computed(() =>
    uniqueByName<WorkflowTriggerProviderOption>(
      [CHAT_WORKFLOW_TRIGGER_PROVIDER, ...this.triggerProviders()],
      (provider) => provider.name
    )
  )

  readonly middlewareProviderOptions = computed<BlankMiddlewareProviderOption[]>(() => {
    const runtimeProviders = uniqueByName<BlankMiddlewareProviderOption>(
      this.middlewareProviders().map(({ meta }) => ({ meta })),
      (provider) => provider.meta.name
    ).filter((provider) => provider.meta.name !== BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER)
    const builtinProviderNames = new Set(
      runtimeProviders
        .filter((provider) => !isUserAddableAgentMiddleware(provider.meta))
        .map((provider) => provider.meta.name)
    )
    const availableProviders = runtimeProviders.filter((provider) => isUserAddableAgentMiddleware(provider.meta))
    const availableNames = new Set(availableProviders.map((provider) => provider.meta.name))
    const unavailableTemplateSelections = this.selectedMiddlewares()
      .filter(
        (provider) =>
          !!provider &&
          provider !== BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER &&
          !availableNames.has(provider) &&
          !builtinProviderNames.has(provider)
      )
      .map((provider) => ({
        meta: {
          name: provider,
          label: {
            en_US: provider,
            zh_Hans: provider
          },
          description: UNAVAILABLE_TEMPLATE_MIDDLEWARE_DESCRIPTION
        },
        unavailable: true
      }))

    return [...availableProviders, ...unavailableTemplateSelections]
  })

  readonly filteredMiddlewareProviderOptions = computed(() =>
    this.middlewareProviderOptions().filter((provider) => matchesMiddlewareSearch(provider, this.middlewareSearch()))
  )

  readonly dataSourceProviderOptions = computed(() =>
    uniqueByName<{ meta: IDocumentSourceProvider; integration: { service: string } }>(
      this.dataSourceProviders(),
      (provider) => provider.meta.name
    )
  )

  readonly processorProviderOptions = computed(() =>
    uniqueByName<{ meta: IDocumentProcessorProvider; integration: { service: string } }>(
      this.processorProviders(),
      (provider) => provider.meta.name
    )
  )

  readonly chunkerProviderOptions = computed(() =>
    uniqueByName<IDocumentChunkerProvider>(this.chunkerProviders(), (provider) => provider.name)
  )

  readonly understandingProviderOptions = computed(() =>
    uniqueByName<{
      meta: IDocumentUnderstandingProvider
      requireVisionModel: boolean
      integration: { service: string }
    }>(this.understandingProviders(), (provider) => provider.meta.name)
  )

  readonly installingSkillPackage = signal(false)

  readonly workspacePublicRepositoryId = signal<string | null>(null)

  readonly skillRefreshTick = signal(0)

  readonly skillState = toSignal(
    toObservable(
      computed(() => ({
        workspaceId: this.workspaceId(),
        refreshTick: this.skillRefreshTick()
      }))
    ).pipe(
      switchMap(({ workspaceId }) => {
        if (!workspaceId) {
          return of(EMPTY_BLANK_SKILL_STATE)
        }

        return this._skillPackageService
          .getAllByWorkspace(workspaceId, { relations: ['skillIndex', 'skillIndex.repository'] })
          .pipe(
            take(1),
            map(({ items }) => buildBlankWorkspaceSkillState(items ?? [])),
            catchError((error) =>
              of({
                ...EMPTY_BLANK_SKILL_STATE,
                errorMessage: getErrorMessage(error) || 'Failed to load workspace skills.'
              })
            ),
            startWith({
              ...EMPTY_BLANK_SKILL_STATE,
              loading: true
            })
          )
      })
    ),
    { initialValue: EMPTY_BLANK_SKILL_STATE }
  )

  readonly selectedTriggers = model<BlankTriggerSelection[]>([])

  readonly selectedExplicitSkills = model<string[]>([])

  readonly selectedRepositoryDefault = signal<BlankRepositoryDefaultSelection | null>(null)

  readonly selectedMiddlewares = model<string[]>([])

  readonly preserveSkillsMiddleware = signal(false)

  readonly selectedMiddlewareRequired = signal<Record<string, boolean>>({})

  readonly middlewareSearch = signal('')

  readonly selectedKnowledgeTriggers = model<BlankTriggerSelection[]>([])

  readonly selectedDataSources = model<string[]>([])

  readonly selectedProcessors = model<string[]>([])

  readonly selectedChunkers = model<string[]>([])

  readonly selectedUnderstandings = model<string[]>([])

  readonly selectedWorkflowNodes = model<BlankWorkflowStarterNodeKey[]>([])

  readonly preparedSkillWorkspaces = signal<Set<string>>(new Set())

  readonly preparedTemplatePluginSkillDependencies = signal<Map<string, BlankTemplatePluginSkillBinding[]>>(new Map())

  readonly preparedTemplateToolsetDependencies = signal<BlankTemplateToolsetPreparation | null>(null)

  readonly loadedTemplateToolsetDependencyKey = signal<string | null>(null)

  readonly templateToolsetSelectionStates = signal<BlankTemplateToolsetSelectionState[]>([])

  readonly loadingTemplateToolsets = signal(false)

  readonly configuringTemplateToolsetKey = signal<string | null>(null)

  readonly initializedWorkspaceSkillDefaultWorkspaces = signal<Set<string>>(new Set())

  readonly workflowActionNodeOptions = WORKFLOW_ACTION_NODE_OPTIONS

  readonly workflowTransformNodeOptions = WORKFLOW_TRANSFORM_NODE_OPTIONS

  readonly primaryCopilot = computed(
    () => this.orgCopilots().find((item) => item.role === AiProviderRole.Primary) ?? null
  )

  readonly hasAvailableLlmProvider = computed(() => (this.availableLlmCopilots()?.length ?? 0) > 0)

  readonly checkingModelProviders = computed(
    () => this.isClawAgentWizard() && this.availableLlmCopilots() === null && !this.modelProviderSetupCompleted()
  )

  readonly needsModelProviderSetup = computed(
    () =>
      this.isClawAgentWizard() &&
      !this.modelProviderSetupCompleted() &&
      this.availableLlmCopilots() !== null &&
      !this.hasAvailableLlmProvider()
  )

  readonly canConfigureModelProvider = computed(() => !!this.hasCopilotEditPermission())

  readonly showClawModelProviderForm = computed(() => !!this.primaryCopilot()?.enabled)

  readonly agentModelProviderStepIndex = computed(() => (this.needsModelProviderSetup() ? 1 : -1))

  readonly agentBasicStepIndex = computed(() => (this.needsModelProviderSetup() ? 2 : 1))

  readonly agentTriggerStepIndex = computed(() => (this.needsModelProviderSetup() ? 3 : 2))

  readonly agentSkillStepIndex = computed(() => (this.needsModelProviderSetup() ? 5 : 4))

  readonly selectedSkills = computed<string[]>(() => {
    const selected = new Set(this.selectedExplicitSkills())
    const repositoryDefault = this.selectedRepositoryDefault()

    if (repositoryDefault?.repositoryId) {
      const disabledSkillIds = new Set(repositoryDefault.disabledSkillIds)
      for (const skill of this.skillState().skills) {
        if (skill.repositoryId === repositoryDefault.repositoryId && !disabledSkillIds.has(skill.id)) {
          selected.add(skill.id)
        }
      }
    }

    return Array.from(selected)
  })

  readonly selectedSkillItems = computed<BlankWorkspaceSkillItem[]>(() => {
    const itemMap = new Map(this.skillState().skills.map((skill) => [skill.id, skill]))
    return this.selectedSkills().map((skillId) => itemMap.get(skillId) ?? { id: skillId, label: skillId })
  })

  readonly templatePluginSkillDependencyGroups = computed<BlankTemplatePluginSkillDependencyGroup[]>(() => {
    const template = this.selectedTemplate()
    const defaultPluginName = readNonEmptyString(template?.pluginName)
    const groups = new Map<string, PluginResourceComponentSelector[]>()

    for (const dependency of template?.dependencies?.skills ?? []) {
      const componentKey = readNonEmptyString(dependency.componentKey)
      const pluginName = readNonEmptyString(dependency.pluginName) ?? defaultPluginName
      if (!componentKey || !pluginName) {
        continue
      }

      const targetAgentKey = readNonEmptyString(dependency.targetAgentKey)
      const components = groups.get(pluginName) ?? []
      components.push({
        pluginName,
        componentType: PLUGIN_COMPONENT_TYPE.SKILL,
        componentKey,
        ...(targetAgentKey ? { targetAgentKey } : {})
      })
      groups.set(pluginName, components)
    }

    return Array.from(groups.entries()).map(([pluginName, components]) => ({ pluginName, components }))
  })

  readonly templateToolsetDependencies = computed<BlankTemplateToolsetDependency[]>(() => {
    const template = this.selectedTemplate()
    const defaultPluginName = readNonEmptyString(template?.pluginName)

    return (template?.dependencies?.toolsets ?? [])
      .map((dependency) => {
        const provider = readNonEmptyString(dependency.provider)
        const templateNodeKey = readNonEmptyString(dependency.templateNodeKey)
        const pluginName = readNonEmptyString(dependency.pluginName) ?? defaultPluginName
        if (!provider || !templateNodeKey || !pluginName) {
          return null
        }

        const targetAgentKey = readNonEmptyString(dependency.targetAgentKey)
        const instanceName = readNonEmptyString(dependency.instanceName)
        return {
          pluginName,
          provider,
          templateNodeKey,
          ...(targetAgentKey ? { targetAgentKey } : {}),
          ...(instanceName ? { instanceName } : {})
        }
      })
      .filter((dependency): dependency is BlankTemplateToolsetDependency => !!dependency)
  })

  readonly hasTemplateToolsetStep = computed(
    () => this.isAgentType() && this.startMode() === 'template' && this.templateToolsetDependencies().length > 0
  )

  readonly agentToolsetStepIndex = computed(() => (this.hasTemplateToolsetStep() ? this.agentSkillStepIndex() + 1 : -1))

  readonly agentLastStepIndex = computed(() =>
    this.hasTemplateToolsetStep() ? this.agentToolsetStepIndex() : this.agentSkillStepIndex()
  )

  readonly templateToolsetsStepInvalid = computed(() => {
    if (!this.hasTemplateToolsetStep()) {
      return false
    }

    return (
      this.loadingTemplateToolsets() ||
      !!this.templateToolsetInstallError() ||
      this.templateToolsetSelectionStates().length !== this.templateToolsetDependencies().length ||
      this.templateToolsetSelectionStates().some(
        (state) => state.loading || !state.selectedToolsetId || !!state.errorMessage
      )
    )
  })

  readonly supportsTemplateStart = computed(() => this.isAgentType() || this.isKnowledgeType())

  readonly templateChoices = computed(() =>
    this.isAgentType()
      ? this.agentTemplateCatalog().choices
      : this.isKnowledgeType()
        ? this.knowledgeTemplateCatalog().choices
        : []
  )

  readonly templateOptionsLoading = computed(() =>
    this.isAgentType()
      ? this.agentTemplateCatalogLoading()
      : this.isKnowledgeType()
        ? this.knowledgeTemplateCatalogLoading()
        : false
  )

  readonly templateOptionsError = computed(() =>
    this.isAgentType()
      ? this.agentTemplateCatalogError()
      : this.isKnowledgeType()
        ? this.knowledgeTemplateCatalogError()
        : null
  )

  readonly startStepInvalid = computed(() => {
    if (this.startMode() !== 'template') {
      return false
    }

    if (!this.supportsTemplateStart()) {
      return true
    }

    return (
      !this.selectedTemplateId() ||
      this.templateLoading() ||
      !this.selectedTemplateDraft() ||
      !!this.templateLoadError()
    )
  })

  readonly selectedWorkspace = computed(() => {
    const workspaceId = this.workspaceId()
    if (!workspaceId) {
      return null
    }

    return (
      this.workspaces().find((workspace) => workspace.id === workspaceId) ??
      (this._dialogData.workspace?.id === workspaceId ? this._dialogData.workspace : null)
    )
  })

  readonly noAvailableWorkspaces = computed(() => this.allowWorkspaceSelection && !this.workspaces().length)

  readonly workspaceSelectionInvalid = computed(() => this.allowWorkspaceSelection && !this.workspaceId())

  readonly basicInvalid = computed(() => {
    const basicForm = this.basicForm()
    return !basicForm || basicForm.checking() || basicForm.invalid()
  })

  readonly basicStepInvalid = computed(
    () => this.basicInvalid() || this.workspaceSelectionInvalid() || this.noAvailableWorkspaces()
  )

  readonly directBasicStepInvalid = computed(() => {
    const basicForm = this.basicForm()
    if (basicForm) {
      return (
        basicForm.checking() ||
        !!basicForm.invalid() ||
        this.workspaceSelectionInvalid() ||
        this.noAvailableWorkspaces()
      )
    }

    const name = this.name()?.trim()
    return (
      !name ||
      /[^a-zA-Z0-9-\s]/.test(name) ||
      convertToUrlPath(name).length < 5 ||
      !this.copilotModel()?.copilotId ||
      this.workspaceSelectionInvalid() ||
      this.noAvailableWorkspaces()
    )
  })

  readonly selectedTriggersInvalid = computed(() =>
    this.hasInvalidTriggerSelections(this.selectedTriggers(), this.triggerProviderOptions())
  )

  readonly selectedKnowledgeTriggersInvalid = computed(() =>
    this.hasInvalidTriggerSelections(this.selectedKnowledgeTriggers(), this.triggerProviderOptions())
  )

  readonly hasAdvancedSelections = computed(() =>
    hasBlankWizardSelections({
      triggers: this.selectedTriggers(),
      skills: this.selectedExplicitSkills(),
      repositoryDefault: this.selectedRepositoryDefault(),
      middlewares: this.selectedMiddlewares(),
      preserveSkillsMiddleware: this.preserveSkillsMiddleware()
    })
  )

  readonly loading = signal(false)

  readonly enablingPrimaryCopilot = signal(false)

  readonly modelProviderSetupCompleted = signal(false)

  readonly canCreateDirectly = computed(
    () => this.lockStartMode && this.startMode() === 'template' && !!this.selectedTemplateId()
  )

  readonly directCreateDisabled = computed(
    () =>
      !this.canCreateDirectly() ||
      this.loading() ||
      this.startStepInvalid() ||
      this.checkingModelProviders() ||
      this.modelProviderStepInvalid() ||
      this.directBasicStepInvalid() ||
      this.selectedTriggersInvalid() ||
      this.installingSkillPackage() ||
      this.loadingTemplateToolsets() ||
      !!this.configuringTemplateToolsetKey() ||
      !!this.templatePluginSkillInstallError() ||
      !!this.templateToolsetInstallError() ||
      (this.templateToolsetSelectionStates().length > 0 && this.templateToolsetsStepInvalid())
  )

  refreshWorkspaces() {
    this._refreshWorkspaces$.next()
  }

  constructor() {
    let previousMode = this.selectedMode()
    let previousSkillWorkspaceId = this.workspaceId()

    effect(() => {
      const availableModes = this.availableModes()
      if (!availableModes.length) {
        return
      }

      const currentMode = this.types()[0]
      if (!currentMode || !availableModes.includes(currentMode)) {
        this.types.set([getBlankWizardDefaultMode(this.requestedType(), this.allowedModes)])
      }
    })

    effect(() => {
      const workspaces = this.workspaces()
      const dialogWorkspaceId = this._dialogData.workspace?.id ?? null

      if (!this.allowWorkspaceSelection) {
        if (this.workspaceId() !== dialogWorkspaceId) {
          this.workspaceId.set(dialogWorkspaceId)
        }
        return
      }

      const preferredWorkspaceId = dialogWorkspaceId ?? this._selectedWorkspace()?.id ?? null
      const currentWorkspaceId = this.workspaceId()
      const hasCurrentWorkspace =
        !!currentWorkspaceId && workspaces.some((workspace) => workspace.id === currentWorkspaceId)

      if (hasCurrentWorkspace) {
        return
      }

      if (
        !currentWorkspaceId &&
        preferredWorkspaceId &&
        workspaces.some((workspace) => workspace.id === preferredWorkspaceId)
      ) {
        this.workspaceId.set(preferredWorkspaceId)
        return
      }

      if (currentWorkspaceId && workspaces.length && !hasCurrentWorkspace) {
        this.workspaceId.set(null)
      }
    })

    effect(() => {
      const workspaceId = this.workspaceId()
      if (workspaceId === previousSkillWorkspaceId) {
        return
      }

      previousSkillWorkspaceId = workspaceId
      this.clearWorkspaceScopedAgentSelections()
      this.skillRefreshTick.update((value) => value + 1)
    })

    effect(() => {
      const mode = this.selectedMode()
      if (mode === previousMode) {
        return
      }

      previousMode = mode
      this.resetTemplateFlow()
      this.applyBlankDefaults()
    })

    effect((onCleanup) => {
      const startMode = this.startMode()
      const templateId = this.selectedTemplateId()
      const selectedMode = this.selectedMode()

      if (startMode !== 'template' || !templateId || !this.supportsTemplateStart()) {
        if (startMode !== 'template') {
          this.templateLoading.set(false)
          this.templateLoadError.set(null)
          this.selectedTemplate.set(null)
          this.selectedTemplateDraft.set(null)
        }
        return
      }

      this.templateLoading.set(true)
      this.templateLoadError.set(null)
      this.selectedTemplate.set(null)
      this.selectedTemplateDraft.set(null)
      this.applyBlankDefaults()

      const template$: Observable<{ template: TXpertTemplate | null; export_data: string }> =
        selectedMode === XpertTypeEnum.Agent
          ? this.templateService
              .getTemplate(templateId)
              .pipe(map((template) => ({ template, export_data: template.export_data })))
          : this.templateService
              .getKnowledgePipelineTemplate(templateId)
              .pipe(map((template) => ({ template: null, export_data: template.export_data })))

      const subscription = template$
        .pipe(
          switchMap((data) =>
            from(parseYAML(data.export_data) as Promise<TXpertTeamDraft>).pipe(
              map((draft) => ({
                template: data.template,
                draft
              }))
            )
          )
        )
        .subscribe({
          next: ({ template, draft }) => {
            this.templateLoading.set(false)
            this.selectedTemplate.set(template)
            this.selectedTemplateDraft.set(draft)
            this.applyTemplateDefaults(draft)
          },
          error: (error) => {
            this.templateLoading.set(false)
            this.selectedTemplate.set(null)
            this.templateLoadError.set(getErrorMessage(error))
          }
        })

      onCleanup(() => subscription.unsubscribe())
    })
  }
  abstract clearWorkspaceScopedAgentSelections(): void
  abstract modelProviderStepInvalid(): boolean
  abstract applyTemplateDefaults(draft: TXpertTeamDraft): void
  abstract applyBlankDefaults(): void
  abstract resetTemplateFlow(options?: { preserveStartMode?: boolean }): void
  abstract hasInvalidTriggerSelections(
    selections: BlankTriggerSelection[],
    providers: WorkflowTriggerProviderOption[]
  ): boolean
}
