import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CdkListboxModule } from '@angular/cdk/listbox'

import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal, viewChild } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import {
  injectPluginAPI,
  injectWorkspace,
  PLUGIN_COMPONENT_TYPE,
  PLUGIN_RESOURCE_RUNTIME_TYPE,
  type PluginResourceComponentSelector
} from '@xpert-ai/cloud/state'
import { parseYAML } from '@xpert-ai/core'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { AiModelTypeEnum, AiProviderRole } from '@xpert-ai/contracts'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardComboboxDeprecatedComponent,
  ZardCheckboxComponent,
  ZardDialogService,
  ZardIconComponent,
  ZardSelectImports,
  ZardStepperImports,
  ZardSwitchComponent,
  ZardTooltipImports,
  type ZardStepperSelectionEvent
} from '@xpert-ai/headless-ui'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  AIPermissionsEnum,
  CopilotServerService,
  EnvironmentService,
  IDocumentChunkerProvider,
  IDocumentProcessorProvider,
  IDocumentSourceProvider,
  IDocumentUnderstandingProvider,
  I18nObject,
  getErrorMessage,
  ICopilot,
  ICopilotModel,
  ICopilotWithProvider,
  isUserAddableAgentMiddleware,
  ISkillPackage,
  ISkillRepositoryIndex,
  IXpert,
  IXpertToolset,
  IXpertWorkspace,
  KnowledgebaseService,
  OrderTypeEnum,
  SkillPackageService,
  SkillRepositoryService,
  WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER,
  TKnowledgePipelineTemplate,
  TAgentMiddlewareMeta,
  TAvatar,
  ToastrService,
  TXpertTeamDraft,
  TXpertTemplate,
  TWorkflowTriggerMeta,
  WorkflowNodeTypeEnum,
  XpertAgentService,
  XpertAPIService,
  XpertTemplateService,
  XpertToolsetCategoryEnum,
  XpertToolsetService,
  XpertWorkspaceService,
  XpertTypeEnum
} from '../../../../@core'
import { genAgentKey } from '../../utils'
import { XpertBasicFormComponent } from 'apps/cloud/src/app/@shared/xpert'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'

import {
  CHAT_WORKFLOW_TRIGGER_PROVIDER,
  WorkflowTriggerProviderOption,
  XpertWorkflowIconComponent,
  hasJsonSchemaRequiredErrors
} from 'apps/cloud/src/app/@shared/workflow'
import { RouterModule } from '@angular/router'
import { CopilotConfigFormComponent } from 'apps/cloud/src/app/@shared/copilot'
import { XpertSkillInstallDialogComponent, XpertSkillInstallDialogResult } from 'apps/cloud/src/app/@shared/skills'
import { injectConfigureBuiltin } from '../../tools'
import {
  BehaviorSubject,
  catchError,
  distinctUntilChanged,
  firstValueFrom,
  from,
  map,
  Observable,
  of,
  startWith,
  switchMap,
  take
} from 'rxjs'
import { NgxPermissionsService } from 'ngx-permissions'
import {
  BlankMiddlewareDefinition,
  BlankRepositoryDefaultSelection,
  BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER,
  BlankTriggerSelection,
  BlankWorkflowStarterNodeKey,
  buildBlankKnowledgeDraft,
  buildBlankWorkflowDraft,
  buildBlankXpertDraft,
  hasBlankWizardSelections,
  isBlankMiddlewareRequired,
  mergeBlankMiddlewareRequiredFeatures,
  normalizeBlankMiddlewareRequiredSelections,
  normalizeBlankMiddlewareSelections
} from './blank-draft.util'
import {
  BLANK_XPERT_WORKFLOW_MODE,
  BlankXpertCompletionMode,
  BlankXpertMode,
  getBlankWizardDefaultMode,
  getBlankWizardPersistedType,
  getBlankWizardAvailableModes,
  isBlankWizardModeDisabled,
  shouldHideBlankWizardPrimaryAgent,
  shouldInitializeBlankWizardDraft
} from './blank-wizard.util'
import { BlankTriggerSelectionComponent } from './blank-trigger-selection.component'
import {
  applyAgentTemplateWizardState,
  applyKnowledgeTemplateWizardState,
  applyTemplateToolsetResolutionsToDraft,
  BlankTemplateToolsetResolution,
  BlankXpertStartMode,
  extractAgentTemplateWizardState,
  extractKnowledgeTemplateWizardState
} from './blank-template.util'
import { BlankTemplateChoice, BlankTemplateSelectionComponent } from './blank-template-selection.component'

type BlankWorkflowNodeOption = {
  key: BlankWorkflowStarterNodeKey
  type: WorkflowNodeTypeEnum
  labelKey: string
  defaultLabel: string
}

type BlankTemplateCatalog = {
  choices: BlankTemplateChoice[]
  items: Array<TXpertTemplate | TKnowledgePipelineTemplate>
}

type BlankWorkspaceSkillItem = {
  id: string
  label: string | I18nObject
  summary?: string | I18nObject | null
  repositoryId?: string | null
  repositoryName?: string | null
  repositoryProvider?: string | null
}

type BlankMiddlewareProviderOption = {
  meta: TAgentMiddlewareMeta
  unavailable?: boolean
}

type BlankSkillState = {
  loading: boolean
  skills: BlankWorkspaceSkillItem[]
  errorMessage: string | null
}

type BlankTemplatePluginSkillDependencyGroup = {
  pluginName: string
  components: PluginResourceComponentSelector[]
}

type BlankTemplateToolsetDependency = {
  pluginName: string
  provider: string
  templateNodeKey: string
  targetAgentKey?: string
  instanceName?: string
}

type BlankTemplateToolsetPreparation = {
  key: string
  resolutions: BlankTemplateToolsetResolution[]
}

type BlankTemplateToolsetSelectionState = {
  key: string
  dependency: BlankTemplateToolsetDependency
  loading: boolean
  toolsets: IXpertToolset[]
  selectedToolsetId: string | null
  errorMessage: string | null
}

export type BlankXpertWizardStatus = 'created' | 'published'

export type BlankXpertWizardResult = {
  xpert: IXpert
  status: BlankXpertWizardStatus
}

export const BLANK_XPERT_DIALOG_CATEGORY = {
  CLAW: 'claw'
} as const

export type BlankXpertDialogCategory = (typeof BLANK_XPERT_DIALOG_CATEGORY)[keyof typeof BLANK_XPERT_DIALOG_CATEGORY]

export function normalizeBlankXpertDialogCategory(
  category: string | null | undefined
): BlankXpertDialogCategory | null {
  const value = category?.trim().toLowerCase()

  switch (value) {
    case BLANK_XPERT_DIALOG_CATEGORY.CLAW:
      return value
    default:
      return null
  }
}

export type BlankXpertDialogData = {
  workspace?: IXpertWorkspace | null
  type?: XpertTypeEnum | null
  allowWorkspaceSelection?: boolean
  allowedModes?: BlankXpertMode[] | null
  completionMode?: BlankXpertCompletionMode
  category?: BlankXpertDialogCategory | null
  defaultCopilotModel?: ICopilotModel | null
  initialStartMode?: BlankXpertStartMode
  initialTemplateId?: string | null
  lockStartMode?: boolean
  lockType?: boolean
}

type DraftPreparationResult = {
  xpert: IXpert
  draftSaved: boolean
  hasBlockingChecklist: boolean
  preparationFailed: boolean
}

const XPERT_AUTO_PUBLISH_RELEASE_NOTES = 'Initial Xpert bootstrap release.'
const EMPTY_BLANK_SKILL_STATE: BlankSkillState = {
  loading: false,
  skills: [],
  errorMessage: null
}
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
const UNAVAILABLE_TEMPLATE_MIDDLEWARE_DESCRIPTION: I18nObject = {
  en_US:
    'This middleware comes from the selected template, but is not available in the current runtime. Keep it selected to preserve it in the imported draft, or deselect it to remove it.',
  zh_Hans: '该中间件来自所选模板，但当前运行时不可用。保留勾选会继续带入导入草稿，取消勾选会将其移除。'
}

const WORKFLOW_ACTION_NODE_OPTIONS: BlankWorkflowNodeOption[] = [
  {
    key: 'knowledge',
    type: WorkflowNodeTypeEnum.KNOWLEDGE,
    labelKey: 'PAC.Workflow.KnowledgeRetrieval',
    defaultLabel: 'Knowledge Retrieval'
  },
  {
    key: 'http',
    type: WorkflowNodeTypeEnum.HTTP,
    labelKey: 'PAC.Workflow.HTTPRequest',
    defaultLabel: 'HTTP Request'
  },
  {
    key: 'code',
    type: WorkflowNodeTypeEnum.CODE,
    labelKey: 'PAC.Workflow.CodeExecution',
    defaultLabel: 'Code Execution'
  }
]

const WORKFLOW_TRANSFORM_NODE_OPTIONS: BlankWorkflowNodeOption[] = [
  {
    key: 'template',
    type: WorkflowNodeTypeEnum.TEMPLATE,
    labelKey: 'PAC.Workflow.TemplateTransform',
    defaultLabel: 'Template Transform'
  },
  {
    key: 'assigner',
    type: WorkflowNodeTypeEnum.ASSIGNER,
    labelKey: 'PAC.Workflow.VariableAssigner',
    defaultLabel: 'Variable Assigner'
  },
  {
    key: 'json-parse',
    type: WorkflowNodeTypeEnum.JSON_PARSE,
    labelKey: 'PAC.Workflow.JSONParse',
    defaultLabel: 'JSON Parse'
  },
  {
    key: 'json-stringify',
    type: WorkflowNodeTypeEnum.JSON_STRINGIFY,
    labelKey: 'PAC.Workflow.JSONStringify',
    defaultLabel: 'JSON Stringify'
  },
  {
    key: 'answer',
    type: WorkflowNodeTypeEnum.ANSWER,
    labelKey: 'PAC.Workflow.Answer',
    defaultLabel: 'Answer'
  }
]

@Component({
  selector: 'xpert-new-blank',
  standalone: true,
  imports: [
    TranslateModule,
    RouterModule,
    DragDropModule,
    ...ZardStepperImports,
    ...ZardTooltipImports,
    FormsModule,
    CdkListboxModule,
    NgmI18nPipe,
    NgmSpinComponent,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardComboboxDeprecatedComponent,
    ZardIconComponent,
    ...ZardSelectImports,
    ZardSwitchComponent,
    XpertBasicFormComponent,
    CopilotConfigFormComponent,
    XpertWorkflowIconComponent,
    BlankTriggerSelectionComponent,
    BlankTemplateSelectionComponent
  ],
  templateUrl: './blank.component.html',
  styleUrl: './blank.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertNewBlankComponent {
  eXpertTypeEnum = XpertTypeEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum
  workflowMode = BLANK_XPERT_WORKFLOW_MODE
  readonly #dialogRef = inject(DialogRef<BlankXpertWizardResult>)
  readonly #dialog = inject(ZardDialogService)
  readonly #dialogData = inject<BlankXpertDialogData>(DIALOG_DATA)
  readonly #selectedWorkspace = injectWorkspace()
  readonly #pluginAPI = injectPluginAPI()
  readonly #configureBuiltinToolset = injectConfigureBuiltin()
  readonly #skillPackageService = inject(SkillPackageService)
  readonly #skillRepositoryService = inject(SkillRepositoryService)
  readonly #toolsetService = inject(XpertToolsetService)
  readonly xpertService = inject(XpertAPIService)
  readonly xpertAgentService = inject(XpertAgentService)
  readonly templateService = inject(XpertTemplateService)
  readonly workspaceService = inject(XpertWorkspaceService)
  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly environmentService = inject(EnvironmentService)
  readonly #copilotServer = inject(CopilotServerService)
  readonly #permissionsService = inject(NgxPermissionsService)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)
  readonly basicForm = viewChild(XpertBasicFormComponent)
  readonly clawCopilotForm = viewChild<CopilotConfigFormComponent>('clawCopilotForm')

  readonly requestedType = signal(this.#dialogData.type ?? null)
  readonly allowedModes = this.#dialogData.allowedModes ?? null
  readonly completionMode = this.#dialogData.completionMode ?? ('create' as BlankXpertCompletionMode)
  readonly templateCategory = normalizeBlankXpertDialogCategory(this.#dialogData.category)
  readonly usesWorkspaceSkillDefaults = computed(() => this.templateCategory === BLANK_XPERT_DIALOG_CATEGORY.CLAW)
  readonly allowWorkspaceSelection = !!this.#dialogData.allowWorkspaceSelection
  readonly lockStartMode = !!this.#dialogData.lockStartMode
  readonly lockType = !!this.#dialogData.lockType
  readonly initialMode = getBlankWizardDefaultMode(this.#dialogData.type, this.allowedModes)
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
  readonly startMode = model<BlankXpertStartMode>(this.#dialogData.initialStartMode ?? 'blank')
  readonly workspaceId = model<string | null>(this.#dialogData.workspace?.id ?? this.#selectedWorkspace()?.id ?? null)
  readonly name = model<string>()
  readonly description = model<string>()
  readonly avatar = model<TAvatar>()
  readonly title = model<string>()
  readonly copilotModel = model<ICopilotModel>(this.#dialogData.defaultCopilotModel ?? undefined)
  readonly selectedTemplateId = model<string | null>(this.#dialogData.initialTemplateId ?? null)
  readonly selectedTemplate = signal<TXpertTemplate | null>(null)
  readonly selectedTemplateDraft = signal<TXpertTeamDraft | null>(null)
  readonly templateLoading = signal(false)
  readonly templateLoadError = signal<string | null>(null)
  readonly templatePluginSkillInstallError = signal<string | null>(null)
  readonly templateToolsetInstallError = signal<string | null>(null)
  readonly agentTemplateCatalogLoading = signal(true)
  readonly agentTemplateCatalogError = signal<string | null>(null)
  readonly knowledgeTemplateCatalogLoading = signal(true)
  readonly knowledgeTemplateCatalogError = signal<string | null>(null)
  readonly #refreshWorkspaces$ = new BehaviorSubject<void>(undefined)
  readonly workspaces = toSignal(
    this.#refreshWorkspaces$.pipe(
      switchMap(() =>
        this.workspaceService
          .getAllMy({ order: { updatedAt: OrderTypeEnum.DESC } }, { purpose: 'authoring' })
          .pipe(map(({ items }) => items))
      )
    ),
    { initialValue: [] as IXpertWorkspace[] }
  )
  readonly agentTemplateCatalog = toSignal(
    this.templateService.getAll().pipe(
      map(({ recommendedApps }) => {
        const items = recommendedApps.filter((template) => template.type === XpertTypeEnum.Agent)
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
    initialValue: [] as { meta: TAgentMiddlewareMeta }[]
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

        return this.#copilotServer.getCopilotModels(AiModelTypeEnum.LLM).pipe(
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

        return this.#copilotServer.refresh$.pipe(
          switchMap(() => this.#copilotServer.getAllInOrg()),
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
    this.#permissionsService.permissions$.pipe(
      map((permissions) => !!permissions[AIPermissionsEnum.COPILOT_EDIT]),
      startWith(!!this.#permissionsService.getPermissions()[AIPermissionsEnum.COPILOT_EDIT])
    ),
    { initialValue: !!this.#permissionsService.getPermissions()[AIPermissionsEnum.COPILOT_EDIT] }
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

        return this.#skillPackageService
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
  readonly selectedMiddlewareRequired = signal<Record<string, boolean>>({})
  readonly middlewareSearch = signal('')
  readonly selectedKnowledgeTriggers = model<BlankTriggerSelection[]>([])
  readonly selectedDataSources = model<string[]>([])
  readonly selectedProcessors = model<string[]>([])
  readonly selectedChunkers = model<string[]>([])
  readonly selectedUnderstandings = model<string[]>([])
  readonly selectedWorkflowNodes = model<BlankWorkflowStarterNodeKey[]>([])
  readonly preparedSkillWorkspaces = signal<Set<string>>(new Set())
  readonly preparedTemplatePluginSkillDependencies = signal<Set<string>>(new Set())
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
      (this.#dialogData.workspace?.id === workspaceId ? this.#dialogData.workspace : null)
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
      middlewares: this.selectedMiddlewares()
    })
  )

  readonly loading = signal(false)
  readonly enablingPrimaryCopilot = signal(false)
  readonly modelProviderSetupCompleted = signal(false)

  refreshWorkspaces() {
    this.#refreshWorkspaces$.next()
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
      const dialogWorkspaceId = this.#dialogData.workspace?.id ?? null

      if (!this.allowWorkspaceSelection) {
        if (this.workspaceId() !== dialogWorkspaceId) {
          this.workspaceId.set(dialogWorkspaceId)
        }
        return
      }

      const preferredWorkspaceId = dialogWorkspaceId ?? this.#selectedWorkspace()?.id ?? null
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

  async create() {
    if (
      this.loading() ||
      this.startStepInvalid() ||
      this.modelProviderStepInvalid() ||
      this.basicStepInvalid() ||
      (this.isAgentType() && this.selectedTriggersInvalid()) ||
      (this.isKnowledgeType() && this.selectedKnowledgeTriggersInvalid()) ||
      this.installingSkillPackage() ||
      this.loadingTemplateToolsets() ||
      !!this.templatePluginSkillInstallError() ||
      !!this.templateToolsetInstallError()
    ) {
      return
    }

    this.loading.set(true)
    try {
      if (this.isAgentType()) {
        const templatePluginSkillsReady = await this.prepareTemplatePluginSkillsForCurrentWorkspace()
        if (!templatePluginSkillsReady) {
          return
        }

        const templateToolsetsReady = await this.prepareTemplateToolsetsForCurrentWorkspace()
        if (!templateToolsetsReady) {
          return
        }
      }

      const result = this.startMode() === 'template' ? await this.createFromTemplate() : await this.createBlankXpert()

      this.#toastr.success(
        result.status === 'published'
          ? 'PAC.Xpert.CreatedAndPublishedSuccessfully'
          : 'PAC.Messages.CreatedSuccessfully',
        {
          Default: result.status === 'published' ? 'Created and published successfully' : 'Created Successfully'
        }
      )
      this.close(result)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }

  modelProviderStepInvalid() {
    if (!this.needsModelProviderSetup()) {
      return false
    }

    return (
      !this.canConfigureModelProvider() ||
      this.enablingPrimaryCopilot() ||
      !this.showClawModelProviderForm() ||
      !this.hasSelectedClawModelProviderModel()
    )
  }

  clawModelProviderSaveDisabled() {
    const form = this.clawCopilotForm()
    return (
      this.loading() ||
      this.enablingPrimaryCopilot() ||
      !this.canConfigureModelProvider() ||
      !this.showClawModelProviderForm() ||
      !form?.canSubmit() ||
      !form?.hasSelectedModel()
    )
  }

  async saveClawModelProviderStep() {
    const form = this.clawCopilotForm()
    if (!form || this.clawModelProviderSaveDisabled()) {
      return
    }

    const saved = await form.submit()
    if (!saved) {
      return
    }

    this.applyClawModelProviderFormModel()
    this.modelProviderSetupCompleted.set(true)
    this.#copilotServer.refresh()
  }

  setStartMode(mode: BlankXpertStartMode) {
    if (this.lockStartMode && mode !== this.startMode()) {
      return
    }

    if (mode === this.startMode()) {
      return
    }

    if (mode === 'template' && !this.supportsTemplateStart()) {
      return
    }

    this.startMode.set(mode)
    this.resetTemplateFlow({ preserveStartMode: true })
    this.applyBlankDefaults()
  }

  private async createBlankXpert(): Promise<BlankXpertWizardResult> {
    const selectedType = this.selectedType()
    const selectedMode = this.selectedMode()
    const selectedMiddlewareDefinitions = this.getSelectedMiddlewareDefinitions()
    const selectedMiddlewares = this.selectedMiddlewares()
    const defaultSandboxProvider =
      await this.getDefaultSandboxProviderForMiddlewareDefinitions(selectedMiddlewareDefinitions)
    const primaryAgentPrompt = this.buildInitialPrimaryAgentPrompt()
    const features = mergeBlankMiddlewareRequiredFeatures(
      undefined,
      selectedMiddlewares,
      selectedMiddlewareDefinitions,
      defaultSandboxProvider
    )

    const xpert = await firstValueFrom(
      this.xpertService.create({
        type: selectedType,
        name: this.name(),
        title: this.title(),
        description: this.description(),
        copilotModel: this.copilotModel(),
        latest: true,
        workspaceId: this.workspaceId() ?? undefined,
        avatar: this.avatar(),
        ...(features ? { features } : {}),
        agent: {
          key: genAgentKey(),
          avatar: this.avatar(),
          ...(primaryAgentPrompt ? { prompt: primaryAgentPrompt } : {}),
          options: {
            ...(shouldHideBlankWizardPrimaryAgent(selectedMode)
              ? {
                  hidden: true
                }
              : {}),
            vision: {
              enabled: true
            }
          }
        }
      })
    )
    const hydratedXpert = this.withInitialPrimaryAgentPrompt(xpert, primaryAgentPrompt)
    const mergedFeatures = features
      ? mergeBlankMiddlewareRequiredFeatures(
          hydratedXpert.features,
          selectedMiddlewares,
          selectedMiddlewareDefinitions,
          defaultSandboxProvider
        )
      : hydratedXpert.features
    const preparedXpert = await this.provisionKnowledgebaseIfNeeded({
      ...hydratedXpert,
      ...(mergedFeatures ? { features: mergedFeatures } : {})
    })
    return this.completeCreation(preparedXpert)
  }

  private async createFromTemplate(): Promise<BlankXpertWizardResult> {
    const draft = this.selectedTemplateDraft()
    if (!draft) {
      throw new Error('Select a template before continuing.')
    }

    const primaryAgentPrompt = this.buildInitialPrimaryAgentPrompt()
    const defaultSandboxProvider = await this.getDefaultSandboxProviderForMiddlewareDefinitions(
      this.getSelectedMiddlewareDefinitions()
    )
    const nextDraft = this.withInitialPrimaryAgentPromptInDraft(
      this.buildTemplateImportDraftWithTemplateToolsets(draft, defaultSandboxProvider),
      primaryAgentPrompt
    )
    const xpert = await firstValueFrom(
      this.xpertService.importDSL(nextDraft, {
        templateId: this.selectedTemplate()?.id ?? this.selectedTemplateId() ?? undefined
      })
    )
    const hydratedXpert = this.withInitialPrimaryAgentPrompt(xpert, primaryAgentPrompt)
    const preparedXpert = await this.provisionKnowledgebaseIfNeeded(hydratedXpert)
    return this.completeImportedCreation(preparedXpert)
  }

  toggleMiddleware(provider: string, enabled: boolean) {
    const middlewares = normalizeBlankMiddlewareSelections(
      this.toggleValue(this.selectedMiddlewares(), provider, enabled),
      this.selectedExplicitSkills(),
      this.selectedRepositoryDefault()
    )
    this.selectedMiddlewares.set(middlewares)
    this.syncMiddlewareRequiredSelections(middlewares)
  }

  toggleMiddlewareRequired(provider: string, required: boolean) {
    if (!this.selectedMiddlewares().includes(provider)) {
      return
    }

    this.selectedMiddlewareRequired.update((current) => {
      const next = { ...current }
      if (required) {
        delete next[provider]
      } else {
        next[provider] = false
      }
      return normalizeBlankMiddlewareRequiredSelections(this.selectedMiddlewares(), next)
    })
  }

  isMiddlewareRequired(provider: string) {
    return isBlankMiddlewareRequired(provider, this.selectedMiddlewareRequired())
  }

  toggleSkill(skillId: string, enabled: boolean) {
    if (this.usesWorkspaceSkillDefaults()) {
      this.selectedExplicitSkills.set(this.toggleValue(this.selectedExplicitSkills(), skillId, enabled))
      this.refreshAgentSkillMiddlewareSelections()
      return
    }

    const skill = this.skillState().skills.find((item) => item.id === skillId)
    if (!skill) {
      this.selectedExplicitSkills.set(this.toggleValue(this.selectedExplicitSkills(), skillId, enabled))
      this.refreshAgentSkillMiddlewareSelections()
      return
    }

    if (skill.repositoryProvider === WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER && skill.repositoryId) {
      const current = this.selectedRepositoryDefault()
      const publicSkillIds = this.getRepositorySkillIds(skill.repositoryId)
      const disabledSkillIds = new Set(
        current?.repositoryId === skill.repositoryId ? current.disabledSkillIds : publicSkillIds
      )

      if (enabled) {
        disabledSkillIds.delete(skillId)
      } else {
        disabledSkillIds.add(skillId)
      }

      this.selectedRepositoryDefault.set({
        repositoryId: skill.repositoryId,
        disabledSkillIds: Array.from(disabledSkillIds)
      })
      this.refreshAgentSkillMiddlewareSelections()
      return
    }

    this.selectedExplicitSkills.set(this.toggleValue(this.selectedExplicitSkills(), skillId, enabled))
    this.refreshAgentSkillMiddlewareSelections()
  }

  toggleDataSource(provider: string, enabled: boolean) {
    this.selectedDataSources.set(this.toggleValue(this.selectedDataSources(), provider, enabled))
  }

  toggleProcessor(provider: string, enabled: boolean) {
    this.selectedProcessors.set(this.toggleValue(this.selectedProcessors(), provider, enabled))
  }

  toggleChunker(provider: string, enabled: boolean) {
    this.selectedChunkers.set(this.toggleValue(this.selectedChunkers(), provider, enabled))
  }

  toggleUnderstanding(provider: string, enabled: boolean) {
    this.selectedUnderstandings.set(this.toggleValue(this.selectedUnderstandings(), provider, enabled))
  }

  toggleWorkflowNode(node: BlankWorkflowStarterNodeKey, enabled: boolean) {
    this.selectedWorkflowNodes.set(this.toggleValue(this.selectedWorkflowNodes(), node, enabled))
  }

  async openSkillInstallDialog() {
    if (!this.workspaceId() || this.installingSkillPackage()) {
      return
    }

    const skillIndex = await firstValueFrom(
      this.#dialog
        .open(XpertSkillInstallDialogComponent, {
          width: 'min(96vw, 72rem)',
          maxWidth: '72rem',
          data: {
            workspaceId: this.workspaceId()
          }
        })
        .afterClosed()
        .pipe(take(1))
    )

    if (skillIndex) {
      await this.handleSkillInstallDialogResult(skillIndex)
    }
  }

  async handleSkillInstallDialogResult(result: XpertSkillInstallDialogResult) {
    if (result.kind === 'repository-index') {
      await this.installSkill(result.skillIndex)
      return
    }

    const packageIds = result.packages.map((item) => item.id).filter((id): id is string => !!id)
    if (packageIds.length) {
      this.selectedExplicitSkills.set(Array.from(new Set([...this.selectedExplicitSkills(), ...packageIds])))
      this.refreshAgentSkillMiddlewareSelections()
      this.refreshSkills()
    }
  }

  async installSkill(item: ISkillRepositoryIndex) {
    const workspaceId = this.workspaceId()
    if (!workspaceId || this.installingSkillPackage()) {
      return
    }

    this.installingSkillPackage.set(true)

    try {
      const skillPackage = await firstValueFrom(
        this.#skillPackageService.installPackage(workspaceId, item.id).pipe(take(1))
      )
      if (
        !this.usesWorkspaceSkillDefaults() &&
        item.repository?.provider === WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER &&
        item.repositoryId
      ) {
        const repositoryDefault = this.selectedRepositoryDefault()
        const disabledSkillIds =
          repositoryDefault?.repositoryId === item.repositoryId
            ? repositoryDefault.disabledSkillIds.filter((id) => id !== skillPackage.id)
            : []

        this.selectedRepositoryDefault.set({
          repositoryId: item.repositoryId,
          disabledSkillIds
        })
      } else {
        this.selectedExplicitSkills.set(Array.from(new Set([...this.selectedExplicitSkills(), skillPackage.id])))
      }
      this.refreshAgentSkillMiddlewareSelections()
      this.refreshSkills()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error) || 'Failed to install the selected skill.')
    } finally {
      this.installingSkillPackage.set(false)
    }
  }

  removeSkill(skillId: string) {
    this.toggleSkill(skillId, false)
  }

  close(value?: BlankXpertWizardResult) {
    this.#dialogRef.close(value)
  }

  private refreshSkills() {
    this.skillRefreshTick.update((value) => value + 1)
  }

  private async completeCreation(xpert: IXpert): Promise<BlankXpertWizardResult> {
    const result = await this.initializeDraftIfNeeded(xpert)
    if (this.completionMode !== 'publish') {
      return { xpert: result.xpert, status: 'created' as const }
    }

    if (result.preparationFailed || result.hasBlockingChecklist) {
      this.showAutoPublishInterruptedWarning()
      return { xpert: result.xpert, status: 'created' as const }
    }

    try {
      const publishedXpert = await this.publishCreatedXpert(result.xpert)
      return { xpert: publishedXpert, status: 'published' as const }
    } catch (error) {
      this.showAutoPublishFailedWarning(getErrorMessage(error))
      console.error(error)
      return { xpert: result.xpert, status: 'created' as const }
    }
  }

  private async completeImportedCreation(xpert: IXpert): Promise<BlankXpertWizardResult> {
    if (this.completionMode !== 'publish') {
      return { xpert, status: 'created' as const }
    }

    try {
      const draftTeam = await firstValueFrom(this.xpertService.getTeam(xpert.id, { relations: ['agent'] }))
      if (hasBlockingChecklist(draftTeam.draft?.checklist)) {
        this.showAutoPublishInterruptedWarning()
        return { xpert, status: 'created' as const }
      }

      try {
        const publishedXpert = await this.publishCreatedXpert(xpert)
        return { xpert: publishedXpert, status: 'published' as const }
      } catch (error) {
        this.showAutoPublishFailedWarning(getErrorMessage(error))
        console.error(error)
        return { xpert, status: 'created' as const }
      }
    } catch (error) {
      this.showAutoPublishInterruptedWarning(getErrorMessage(error))
      console.error(error)
      return { xpert, status: 'created' as const }
    }
  }

  private buildTemplateImportDraft(draft: TXpertTeamDraft, defaultSandboxProvider?: string | null) {
    const selectedCopilotModel =
      this.copilotModel() ?? draft.team.agent?.copilotModel ?? draft.team.copilotModel ?? null
    const finalDraft = this.isAgentType()
      ? applyAgentTemplateWizardState(draft, this.getSelections(), {
          defaultCopilotModel: selectedCopilotModel,
          defaultSandboxProvider,
          middlewareDefinitions: this.getSelectedMiddlewareDefinitions()
        })
      : this.isKnowledgeType()
        ? applyKnowledgeTemplateWizardState(draft, this.getKnowledgeSelections())
        : draft
    const features = this.isAgentType()
      ? mergeBlankMiddlewareRequiredFeatures(
          finalDraft.team.features,
          this.selectedMiddlewares(),
          this.getSelectedMiddlewareDefinitions(),
          defaultSandboxProvider
        )
      : finalDraft.team.features

    return {
      ...finalDraft,
      team: {
        ...finalDraft.team,
        type: this.selectedType(),
        latest: true,
        workspaceId: this.workspaceId() ?? undefined,
        name: this.name(),
        title: this.title(),
        description: this.description(),
        avatar: this.avatar(),
        copilotModel: selectedCopilotModel,
        ...(features ? { features } : {})
      }
    }
  }

  private buildTemplateImportDraftWithTemplateToolsets(draft: TXpertTeamDraft, defaultSandboxProvider?: string | null) {
    const nextDraft = this.buildTemplateImportDraft(draft, defaultSandboxProvider)
    const resolutions = this.getPreparedTemplateToolsetResolutions()

    return resolutions.length ? applyTemplateToolsetResolutionsToDraft(nextDraft, resolutions) : nextDraft
  }

  private getPreparedTemplateToolsetResolutions() {
    const workspaceId = this.workspaceId()
    const dependencies = this.templateToolsetDependencies()
    if (!workspaceId || !dependencies.length) {
      return []
    }

    const dependencyKey = this.templateToolsetDependencyInstallKey(workspaceId, dependencies)
    const prepared = this.preparedTemplateToolsetDependencies()
    return prepared?.key === dependencyKey ? prepared.resolutions : []
  }

  private applyTemplateDefaults(draft: TXpertTeamDraft) {
    if (this.isAgentType()) {
      const state = extractAgentTemplateWizardState(draft)
      this.applyTemplateBasicInfo(state.basic)
      this.selectedTriggers.set(state.selections.triggers)
      this.applyAgentSkillSelections(state.selections)
      return
    }

    if (this.isKnowledgeType()) {
      const state = extractKnowledgeTemplateWizardState(draft)
      this.applyTemplateBasicInfo(state.basic)
      this.selectedKnowledgeTriggers.set(state.selections.triggers)
      this.selectedDataSources.set(state.selections.sourceProviders)
      this.selectedProcessors.set(state.selections.processorProviders)
      this.selectedChunkers.set(state.selections.chunkerProviders)
      this.selectedUnderstandings.set(state.selections.understandingProviders)
    }
  }

  private applyTemplateBasicInfo(basic: {
    name?: string
    title?: string
    description?: string
    avatar?: TAvatar
    copilotModel?: ICopilotModel
  }) {
    this.name.set(basic.name)
    this.title.set(basic.title)
    this.description.set(basic.description)
    this.avatar.set(basic.avatar)
    this.copilotModel.set(basic.copilotModel)
  }

  private applyBlankDefaults() {
    this.name.set(undefined)
    this.description.set(undefined)
    this.avatar.set(undefined)
    this.title.set(undefined)
    this.copilotModel.set(undefined)
    this.templatePluginSkillInstallError.set(null)
    this.clearTemplateToolsetSelections()
    this.resetSelections()
  }

  private resetSelections() {
    this.selectedTriggers.set([])
    this.applyAgentSkillSelections({
      skills: [],
      repositoryDefault: null,
      middlewares: []
    })
    this.selectedKnowledgeTriggers.set([])
    this.selectedDataSources.set([])
    this.selectedProcessors.set([])
    this.selectedChunkers.set([])
    this.selectedUnderstandings.set([])
    this.selectedWorkflowNodes.set([])
  }

  private resetTemplateFlow(options?: { preserveStartMode?: boolean }) {
    if (!options?.preserveStartMode) {
      this.startMode.set('blank')
    }
    this.selectedTemplateId.set(null)
    this.selectedTemplate.set(null)
    this.selectedTemplateDraft.set(null)
    this.templateLoading.set(false)
    this.templateLoadError.set(null)
    this.templatePluginSkillInstallError.set(null)
    this.clearTemplateToolsetSelections()
    this.preparedTemplatePluginSkillDependencies.set(new Set())
  }

  private async initializeDraftIfNeeded(xpert: IXpert): Promise<DraftPreparationResult> {
    if (!shouldInitializeBlankWizardDraft(this.selectedMode(), this.hasAdvancedSelections(), this.completionMode)) {
      return {
        xpert,
        draftSaved: false,
        hasBlockingChecklist: false,
        preparationFailed: false
      } satisfies DraftPreparationResult
    }

    if (this.isKnowledgeType()) {
      try {
        const draft = await buildBlankKnowledgeDraft(xpert, this.getKnowledgeSelections())
        const savedDraft = await firstValueFrom(this.xpertService.saveDraft(xpert.id, draft))
        return {
          xpert: {
            ...xpert,
            draft: savedDraft
          },
          draftSaved: true,
          hasBlockingChecklist: hasBlockingChecklist(savedDraft?.checklist),
          preparationFailed: false
        }
      } catch (error) {
        this.showPreconfigurationNotSavedWarning()
        console.error(error)
        return {
          xpert,
          draftSaved: false,
          hasBlockingChecklist: false,
          preparationFailed: true
        } satisfies DraftPreparationResult
      }
    }

    if (this.isWorkflowType()) {
      try {
        const team = await this.getDraftTeam(xpert)
        const draft = await buildBlankWorkflowDraft(team, this.getWorkflowSelections())
        const savedDraft = await firstValueFrom(this.xpertService.saveDraft(xpert.id, draft))
        return {
          xpert: {
            ...xpert,
            draft: savedDraft
          },
          draftSaved: true,
          hasBlockingChecklist: hasBlockingChecklist(savedDraft?.checklist),
          preparationFailed: false
        }
      } catch (error) {
        this.showPreconfigurationNotSavedWarning()
        console.error(error)
        return {
          xpert,
          draftSaved: false,
          hasBlockingChecklist: false,
          preparationFailed: true
        } satisfies DraftPreparationResult
      }
    }

    try {
      const team = await this.getDraftTeam(xpert)
      const selectedMiddlewareDefinitions = this.getSelectedMiddlewareDefinitions()
      const defaultSandboxProvider =
        await this.getDefaultSandboxProviderForMiddlewareDefinitions(selectedMiddlewareDefinitions)
      const draft = await buildBlankXpertDraft(team, this.getSelections(), {
        defaultCopilotModel: team.agent?.copilotModel ?? team.copilotModel ?? this.copilotModel() ?? null,
        defaultSandboxProvider,
        middlewareDefinitions: selectedMiddlewareDefinitions
      })
      const savedDraft = await firstValueFrom(this.xpertService.saveDraft(xpert.id, draft))
      return {
        xpert: {
          ...xpert,
          draft: savedDraft
        },
        draftSaved: true,
        hasBlockingChecklist: hasBlockingChecklist(savedDraft?.checklist),
        preparationFailed: false
      }
    } catch (error) {
      this.showPreconfigurationNotSavedWarning()
      console.error(error)
      return {
        xpert,
        draftSaved: false,
        hasBlockingChecklist: false,
        preparationFailed: true
      } satisfies DraftPreparationResult
    }
  }

  private async publishCreatedXpert(xpert: IXpert): Promise<IXpert> {
    const workspaceId = xpert.workspaceId ?? this.workspaceId() ?? null
    let environmentId: string | null = null

    if (workspaceId) {
      try {
        environmentId = (await firstValueFrom(this.environmentService.getDefaultByWorkspace(workspaceId)))?.id ?? null
      } catch {
        environmentId = null
      }
    }

    return firstValueFrom(
      this.xpertService.publish(xpert.id, false, {
        environmentId,
        releaseNotes: XPERT_AUTO_PUBLISH_RELEASE_NOTES
      })
    )
  }

  private async provisionKnowledgebaseIfNeeded(xpert: IXpert): Promise<IXpert> {
    if (xpert.type !== XpertTypeEnum.Knowledge) {
      return xpert
    }

    if (xpert.knowledgebase?.id) {
      return xpert
    }

    try {
      const knowledgebase = await firstValueFrom(
        this.knowledgebaseService.create({
          name: xpert.title || xpert.name,
          description: xpert.description,
          avatar: xpert.avatar,
          workspaceId: xpert.workspaceId ?? this.workspaceId() ?? undefined,
          copilotModel: xpert.copilotModel
        })
      )

      try {
        await firstValueFrom(this.knowledgebaseService.update(knowledgebase.id, { pipelineId: xpert.id }))
        return {
          ...xpert,
          knowledgebase: {
            ...knowledgebase,
            pipelineId: xpert.id
          }
        }
      } catch (error) {
        return this.rollbackKnowledgePipelineCreation(xpert.id, knowledgebase.id, error)
      }
    } catch (error) {
      return this.rollbackKnowledgeXpertCreation(xpert.id, error)
    }
  }

  private async rollbackKnowledgeXpertCreation(xpertId: string, error: unknown): Promise<never> {
    try {
      await firstValueFrom(this.xpertService.delete(xpertId))
    } catch {
      // Ignore rollback errors and surface the original failure.
    }

    throw error
  }

  private async rollbackKnowledgePipelineCreation(
    xpertId: string,
    knowledgebaseId: string,
    error: unknown
  ): Promise<never> {
    try {
      await firstValueFrom(this.knowledgebaseService.delete(knowledgebaseId))
    } catch {
      // Ignore rollback errors and surface the original failure.
    }

    return this.rollbackKnowledgeXpertCreation(xpertId, error)
  }

  private async getDraftTeam(xpert: IXpert): Promise<IXpert> {
    if (xpert.agent?.key) {
      return xpert
    }

    return firstValueFrom(this.xpertService.getTeam(xpert.id, { relations: ['agent'] }))
  }

  private showAutoPublishInterruptedWarning(detail?: string) {
    this.showTranslatedWarning(
      'PAC.Xpert.AutoPublishInterrupted',
      'Expert created, but auto publish was not completed. You can continue in Studio.',
      detail
    )
  }

  private showAutoPublishFailedWarning(detail?: string) {
    this.showTranslatedWarning(
      'PAC.Xpert.AutoPublishFailed',
      'Expert created, but auto publish was not completed. You can continue in Studio.',
      detail
    )
  }

  private showPreconfigurationNotSavedWarning(detail?: string) {
    this.showTranslatedWarning(
      'PAC.Xpert.PreconfigurationNotSaved',
      'Expert created, but the preconfiguration could not be saved. You can continue in Studio.',
      detail
    )
  }

  private showTranslatedWarning(key: string, defaultMessage: string, detail?: string) {
    const message = this.#translate.instant(key, { Default: defaultMessage })
    this.#toastr.warning(detail ? `${message}: ${detail}` : message)
  }

  private getSelections() {
    return {
      triggers: this.selectedTriggers(),
      skills: this.selectedExplicitSkills(),
      repositoryDefault: this.selectedRepositoryDefault(),
      middlewares: this.selectedMiddlewares(),
      middlewareRequired: this.selectedMiddlewareRequired()
    }
  }

  private buildInitialPrimaryAgentPrompt(): string | undefined {
    if (this.templateCategory !== BLANK_XPERT_DIALOG_CATEGORY.CLAW) {
      return undefined
    }

    return CLAWXPERT_PRIMARY_AGENT_PROMPT_TEMPLATE
  }

  private withInitialPrimaryAgentPromptInDraft(draft: TXpertTeamDraft, prompt?: string): TXpertTeamDraft {
    const primaryAgentKey = draft.team?.agent?.key
    if (!prompt || !primaryAgentKey) {
      return draft
    }

    return {
      ...draft,
      nodes: draft.nodes.map((node) =>
        node.type === 'agent' && node.key === primaryAgentKey
          ? {
              ...node,
              entity: {
                ...node.entity,
                prompt: node.entity?.prompt || prompt
              }
            }
          : node
      )
    }
  }

  private withInitialPrimaryAgentPrompt(xpert: IXpert, prompt?: string): IXpert {
    if (!prompt || !xpert.agent) {
      return xpert
    }

    return {
      ...xpert,
      agent: {
        ...xpert.agent,
        prompt: xpert.agent.prompt ?? prompt
      }
    }
  }

  private getSelectedMiddlewareDefinitions(): BlankMiddlewareDefinition[] {
    const selected = new Set(this.selectedMiddlewares())
    return this.middlewareProviders()
      .map(({ meta }) => ({
        name: meta.name,
        configSchema: meta.configSchema,
        features: meta.features
      }))
      .filter((definition) => selected.has(definition.name))
  }

  private async getDefaultSandboxProviderForMiddlewareDefinitions(
    middlewareDefinitions: BlankMiddlewareDefinition[]
  ): Promise<string | null> {
    const requiresSandbox = middlewareDefinitions.some((definition) => definition.features?.includes('sandbox'))
    if (!requiresSandbox) {
      return null
    }

    const providers = await firstValueFrom(this.xpertService.getSandboxProviders())
    return providers[0]?.type ?? null
  }

  private getKnowledgeSelections() {
    return {
      triggers: this.selectedKnowledgeTriggers(),
      sourceProviders: this.selectedDataSources(),
      processorProviders: this.selectedProcessors(),
      chunkerProviders: this.selectedChunkers(),
      understandingProviders: this.selectedUnderstandings()
    }
  }

  private getWorkflowSelections() {
    return {
      nodes: this.selectedWorkflowNodes()
    }
  }

  private hasInvalidTriggerSelections(
    selections: BlankTriggerSelection[],
    providers: WorkflowTriggerProviderOption[]
  ): boolean {
    return selections.some((selection) => {
      const provider = providers.find((item) => item.name === selection.provider)
      if (!provider || provider.name === 'chat') {
        return false
      }

      return hasJsonSchemaRequiredErrors(provider.configSchema, selection.config ?? {})
    })
  }

  private toggleValue<T extends string>(values: T[], value: T, enabled: boolean): T[] {
    if (enabled) {
      return values.includes(value) ? values : [...values, value]
    }

    return values.filter((item) => item !== value)
  }

  isModeDisabled(mode: BlankXpertMode) {
    return isBlankWizardModeDisabled(mode, this.requestedType(), this.allowedModes)
  }

  private applyAgentSkillSelections(selections: BlankAgentSkillSelections) {
    this.selectedExplicitSkills.set(selections.skills)
    this.selectedRepositoryDefault.set(cloneRepositoryDefaultSelection(selections.repositoryDefault))
    const middlewares = normalizeBlankMiddlewareSelections(
      selections.middlewares,
      selections.skills,
      selections.repositoryDefault
    )
    this.selectedMiddlewares.set(middlewares)
    this.selectedMiddlewareRequired.set(
      normalizeBlankMiddlewareRequiredSelections(middlewares, selections.middlewareRequired)
    )
  }

  private clearWorkspaceScopedAgentSelections() {
    this.initializedWorkspaceSkillDefaultWorkspaces.set(new Set())
    this.templatePluginSkillInstallError.set(null)
    this.clearTemplateToolsetSelections()
    this.applyAgentSkillSelections({
      skills: [],
      repositoryDefault: null,
      middlewares: this.selectedMiddlewares().filter(
        (provider) => provider !== BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER
      ),
      middlewareRequired: this.selectedMiddlewareRequired()
    })
  }

  async onAgentStepChange(event: ZardStepperSelectionEvent) {
    if (event.selectedIndex === this.agentModelProviderStepIndex()) {
      await this.prepareClawModelProviderStep()
      return
    }

    if (event.selectedIndex === this.agentSkillStepIndex()) {
      await this.prepareAgentSkillStep()
      return
    }

    if (event.selectedIndex === this.agentToolsetStepIndex()) {
      await this.prepareTemplateToolsetStep()
    }
  }

  private async prepareClawModelProviderStep() {
    if (
      !this.needsModelProviderSetup() ||
      !this.canConfigureModelProvider() ||
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

  private hasSelectedClawModelProviderModel() {
    const model = this.copilotModel()
    return !!model?.copilotId && !!model?.model
  }

  private applyClawModelProviderFormModel() {
    const model = this.clawCopilotForm()?.formGroup.value.copilotModel as ICopilotModel | null | undefined
    if (model?.copilotId && model.model) {
      this.copilotModel.set(model)
    }
  }

  private async prepareAgentSkillStep() {
    const workspaceId = this.workspaceId()
    if (!workspaceId || this.installingSkillPackage()) {
      return
    }

    if (this.preparedSkillWorkspaces().has(workspaceId)) {
      if (this.usesWorkspaceSkillDefaults()) {
        this.applyWorkspaceSkillDefaults(workspaceId, this.getWorkspaceSkillIds())
        await this.prepareTemplatePluginSkillsForCurrentWorkspace()
        return
      }

      if (!this.selectedRepositoryDefault()?.repositoryId) {
        const repositoryId = await this.getWorkspacePublicRepositoryId()
        if (repositoryId) {
          this.selectedRepositoryDefault.set({
            repositoryId,
            disabledSkillIds: []
          })
          this.refreshAgentSkillMiddlewareSelections()
        }
      }
      await this.prepareTemplatePluginSkillsForCurrentWorkspace()
      return
    }

    this.installingSkillPackage.set(true)
    try {
      const repositoryId = await this.getWorkspacePublicRepositoryId()
      let installedSkillIds: string[] = []
      if (repositoryId) {
        const installedSkillPackages = await firstValueFrom(
          this.#skillPackageService.installRepositoryPackages(workspaceId, repositoryId).pipe(take(1))
        )
        installedSkillIds = installedSkillPackages
          .map((item) => (typeof item?.id === 'string' ? item.id.trim() : ''))
          .filter((id) => !!id)

        if (this.usesWorkspaceSkillDefaults()) {
          this.selectedRepositoryDefault.set(null)
        } else if (!this.selectedRepositoryDefault()?.repositoryId) {
          this.selectedRepositoryDefault.set({
            repositoryId,
            disabledSkillIds: []
          })
        }
      }

      this.preparedSkillWorkspaces.update((value) => new Set([...value, workspaceId]))
      this.applyWorkspaceSkillDefaults(workspaceId, [...this.getWorkspaceSkillIds(), ...installedSkillIds])
      this.refreshAgentSkillMiddlewareSelections()
      this.refreshSkills()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error) || 'Failed to load default workspace skills.')
    } finally {
      this.installingSkillPackage.set(false)
    }

    await this.prepareTemplatePluginSkillsForCurrentWorkspace()
  }

  private async prepareTemplatePluginSkillsForCurrentWorkspace() {
    const workspaceId = this.workspaceId()
    if (!workspaceId) {
      return !this.templatePluginSkillDependencyGroups().length
    }

    return this.prepareTemplatePluginSkills(workspaceId)
  }

  private async prepareTemplatePluginSkills(workspaceId: string): Promise<boolean> {
    const groups = this.templatePluginSkillDependencyGroups()
    if (!groups.length) {
      this.templatePluginSkillInstallError.set(null)
      return true
    }

    const dependencyKey = this.templatePluginSkillDependencyInstallKey(workspaceId, groups)
    if (this.preparedTemplatePluginSkillDependencies().has(dependencyKey)) {
      this.templatePluginSkillInstallError.set(null)
      return true
    }

    if (this.installingSkillPackage()) {
      return false
    }

    this.installingSkillPackage.set(true)
    this.templatePluginSkillInstallError.set(null)

    try {
      const skillPackageIds: string[] = []
      for (const group of groups) {
        const result = await firstValueFrom(
          this.#pluginAPI
            .installResourcesToWorkspace(group.pluginName, {
              workspaceId,
              components: group.components
            })
            .pipe(take(1))
        )

        const skillInstallations = result.installations.filter(
          (installation) =>
            installation.componentType === PLUGIN_COMPONENT_TYPE.SKILL &&
            installation.runtimeType === PLUGIN_RESOURCE_RUNTIME_TYPE.SKILL_PACKAGE &&
            !!installation.runtimeId
        )
        const installedComponentKeys = new Set(skillInstallations.map((installation) => installation.componentKey))
        const missingComponentKeys = Array.from(
          new Set(group.components.map((component) => component.componentKey))
        ).filter((componentKey) => !installedComponentKeys.has(componentKey))

        if (missingComponentKeys.length) {
          throw new Error(
            `Failed to initialize template skills: ${group.pluginName}/${missingComponentKeys.join(', ')}`
          )
        }

        skillPackageIds.push(...skillInstallations.map((installation) => installation.runtimeId as string))
      }

      if (skillPackageIds.length) {
        this.selectedExplicitSkills.set(Array.from(new Set([...this.selectedExplicitSkills(), ...skillPackageIds])))
      }

      this.preparedTemplatePluginSkillDependencies.update((value) => new Set([...value, dependencyKey]))
      this.refreshAgentSkillMiddlewareSelections()
      this.refreshSkills()
      return true
    } catch (error) {
      const message = getErrorMessage(error) || 'Failed to initialize template skills.'
      this.templatePluginSkillInstallError.set(message)
      this.#toastr.error(message)
      return false
    } finally {
      this.installingSkillPackage.set(false)
    }
  }

  private async prepareTemplateToolsetsForCurrentWorkspace() {
    const workspaceId = this.workspaceId()
    if (!workspaceId) {
      return !this.templateToolsetDependencies().length
    }

    return this.prepareTemplateToolsets(workspaceId)
  }

  private async prepareTemplateToolsets(workspaceId: string): Promise<boolean> {
    const dependencies = this.templateToolsetDependencies()
    if (!dependencies.length) {
      this.templateToolsetInstallError.set(null)
      this.preparedTemplateToolsetDependencies.set(null)
      return true
    }

    const dependencyKey = this.templateToolsetDependencyInstallKey(workspaceId, dependencies)
    const prepared = this.preparedTemplateToolsetDependencies()
    if (prepared?.key === dependencyKey) {
      this.templateToolsetInstallError.set(null)
      return true
    }

    const loaded = await this.loadTemplateToolsetSelectionStates(workspaceId)
    if (!loaded) {
      return false
    }

    try {
      const resolutions: BlankTemplateToolsetResolution[] = []
      for (const dependency of dependencies) {
        const dependencyState = this.templateToolsetSelectionStates().find(
          (state) => state.key === this.templateToolsetDependencyKey(dependency)
        )
        const toolset = dependencyState?.toolsets.find((item) => item.id === dependencyState.selectedToolsetId)
        if (!toolset) {
          throw new Error(this.getTemplateToolsetSelectionError(dependency, dependencyState?.toolsets ?? []))
        }

        resolutions.push({
          templateNodeKey: dependency.templateNodeKey,
          targetAgentKey: dependency.targetAgentKey,
          toolset
        })
      }

      this.preparedTemplateToolsetDependencies.set({
        key: dependencyKey,
        resolutions
      })
      return true
    } catch (error) {
      const message = getErrorMessage(error) || 'Failed to initialize template toolsets.'
      this.preparedTemplateToolsetDependencies.set(null)
      this.templateToolsetInstallError.set(message)
      this.#toastr.error(message)
      return false
    }
  }

  private async prepareTemplateToolsetStep(force = false) {
    const workspaceId = this.workspaceId()
    if (!workspaceId || !this.hasTemplateToolsetStep()) {
      return
    }

    await this.loadTemplateToolsetSelectionStates(workspaceId, { force })
  }

  async refreshTemplateToolsetStep() {
    await this.prepareTemplateToolsetStep(true)
  }

  async configureTemplateToolset(key: string) {
    const workspaceId = this.workspaceId()
    const state = this.templateToolsetSelectionStates().find((item) => item.key === key)
    if (!workspaceId || !state || this.configuringTemplateToolsetKey()) {
      return
    }

    this.configuringTemplateToolsetKey.set(key)
    try {
      const toolset = await firstValueFrom(
        this.#configureBuiltinToolset(state.dependency.provider, workspaceId).pipe(take(1))
      )
      if (!toolset || typeof toolset !== 'object' || !toolset.id) {
        return
      }

      this.mergeConfiguredTemplateToolset(key, toolset)
      this.#toastr.success('PAC.Messages.SavedSuccessfully', { Default: 'Saved successfully' })
    } catch (error) {
      this.#toastr.error(
        getErrorMessage(error) ||
          this.#translate.instant('PAC.Xpert.TemplateToolsetConfigureFailed', {
            Default: 'Failed to configure the required toolset.'
          })
      )
    } finally {
      this.configuringTemplateToolsetKey.set(null)
    }
  }

  selectTemplateToolset(key: string, toolsetId: string | null) {
    this.templateToolsetSelectionStates.update((states) =>
      states.map((state) => {
        if (state.key !== key) {
          return state
        }

        const selectedId = readNonEmptyString(toolsetId) ?? null
        return {
          ...state,
          selectedToolsetId: selectedId,
          errorMessage: selectedId ? null : this.getTemplateToolsetSelectionError(state.dependency, state.toolsets)
        }
      })
    )
    this.templateToolsetInstallError.set(null)
    this.preparedTemplateToolsetDependencies.set(null)
  }

  selectTemplateToolsetValue(key: string, value: unknown) {
    if (Array.isArray(value)) {
      this.selectTemplateToolset(key, readNonEmptyString(value[0]) ?? null)
      return
    }

    this.selectTemplateToolset(key, readNonEmptyString(value) ?? null)
  }

  getSelectedTemplateToolset(state: BlankTemplateToolsetSelectionState) {
    return state.toolsets.find((toolset) => toolset.id === state.selectedToolsetId) ?? null
  }

  private async loadTemplateToolsetSelectionStates(
    workspaceId: string,
    options?: { force?: boolean }
  ): Promise<boolean> {
    const dependencies = this.templateToolsetDependencies()
    if (!dependencies.length) {
      this.clearTemplateToolsetSelections()
      return true
    }

    const dependencyKey = this.templateToolsetDependencyInstallKey(workspaceId, dependencies)
    if (
      !options?.force &&
      this.loadedTemplateToolsetDependencyKey() === dependencyKey &&
      this.templateToolsetSelectionStates().length === dependencies.length
    ) {
      return true
    }

    const previousStates = new Map(this.templateToolsetSelectionStates().map((state) => [state.key, state]))
    this.loadingTemplateToolsets.set(true)
    this.templateToolsetInstallError.set(null)
    this.preparedTemplateToolsetDependencies.set(null)
    this.templateToolsetSelectionStates.set(
      dependencies.map((dependency) => {
        const key = this.templateToolsetDependencyKey(dependency)
        const previous = previousStates.get(key)
        return {
          key,
          dependency,
          loading: true,
          toolsets: previous?.toolsets ?? [],
          selectedToolsetId: previous?.selectedToolsetId ?? null,
          errorMessage: null
        }
      })
    )

    try {
      const states: BlankTemplateToolsetSelectionState[] = []
      for (const dependency of dependencies) {
        const key = this.templateToolsetDependencyKey(dependency)
        const previous = previousStates.get(key)
        const toolsets = await this.loadTemplateToolsetCandidates(workspaceId, dependency)
        const selectedToolset = this.selectDefaultTemplateToolset(toolsets, dependency, previous?.selectedToolsetId)
        states.push({
          key,
          dependency,
          loading: false,
          toolsets,
          selectedToolsetId: selectedToolset?.id ?? null,
          errorMessage: selectedToolset ? null : this.getTemplateToolsetSelectionError(dependency, toolsets)
        })
      }

      this.templateToolsetSelectionStates.set(states)
      this.loadedTemplateToolsetDependencyKey.set(dependencyKey)
      return true
    } catch (error) {
      const message =
        getErrorMessage(error) ||
        this.#translate.instant('PAC.Xpert.TemplateToolsetsLoadFailed', {
          Default: 'Failed to load template toolsets.'
        })
      this.templateToolsetSelectionStates.update((states) =>
        states.map((state) => ({
          ...state,
          loading: false,
          errorMessage: state.errorMessage ?? message
        }))
      )
      this.loadedTemplateToolsetDependencyKey.set(null)
      this.templateToolsetInstallError.set(message)
      this.#toastr.error(message)
      return false
    } finally {
      this.loadingTemplateToolsets.set(false)
    }
  }

  private async loadTemplateToolsetCandidates(
    workspaceId: string,
    dependency: BlankTemplateToolsetDependency
  ): Promise<IXpertToolset[]> {
    const response = await firstValueFrom(
      this.#toolsetService
        .getAllByWorkspace(workspaceId, {
          where: {
            type: dependency.provider,
            category: XpertToolsetCategoryEnum.BUILTIN
          },
          relations: ['tools'],
          order: {
            updatedAt: OrderTypeEnum.DESC
          }
        })
        .pipe(take(1))
    )

    return (Array.isArray(response) ? response : (response?.items ?? []))
      .filter((toolset) => this.isTemplateDependencyToolset(toolset, dependency))
      .sort(compareToolsetsByUpdatedAtDesc)
  }

  private selectDefaultTemplateToolset(
    toolsets: IXpertToolset[],
    dependency: BlankTemplateToolsetDependency,
    previousSelectedToolsetId?: string | null
  ) {
    const previousSelected = toolsets.find((toolset) => toolset.id === previousSelectedToolsetId)
    if (previousSelected) {
      return previousSelected
    }

    if (dependency.instanceName) {
      return toolsets.find((toolset) => toolset.name === dependency.instanceName) ?? null
    }

    return toolsets.length === 1 ? toolsets[0] : null
  }

  private mergeConfiguredTemplateToolset(key: string, toolset: IXpertToolset) {
    this.templateToolsetSelectionStates.update((states) =>
      states.map((state) => {
        if (state.key !== key || !this.isTemplateDependencyToolset(toolset, state.dependency)) {
          return state
        }

        const toolsets = [toolset, ...state.toolsets.filter((item) => item.id !== toolset.id)].sort(
          compareToolsetsByUpdatedAtDesc
        )

        return {
          ...state,
          toolsets,
          selectedToolsetId: toolset.id,
          errorMessage: null
        }
      })
    )
    this.templateToolsetInstallError.set(null)
    this.preparedTemplateToolsetDependencies.set(null)
  }

  private isTemplateDependencyToolset(toolset: IXpertToolset, dependency: BlankTemplateToolsetDependency) {
    return (
      toolset.type === dependency.provider &&
      (toolset.category ?? XpertToolsetCategoryEnum.BUILTIN) === XpertToolsetCategoryEnum.BUILTIN
    )
  }

  private getTemplateToolsetSelectionError(dependency: BlankTemplateToolsetDependency, toolsets: IXpertToolset[]) {
    if (!toolsets.length) {
      return dependency.instanceName
        ? this.#translate.instant('PAC.Xpert.TemplateToolsetMissingNamed', {
            Default: `Required template toolset '${dependency.instanceName}' (${dependency.provider}) is not configured in this workspace.`,
            instanceName: dependency.instanceName,
            provider: dependency.provider
          })
        : this.#translate.instant('PAC.Xpert.TemplateToolsetMissingProvider', {
            Default: `Required template toolset '${dependency.provider}' is not configured in this workspace.`,
            provider: dependency.provider
          })
    }

    return this.#translate.instant('PAC.Xpert.TemplateToolsetSelectRequired', {
      Default: `Select a '${dependency.provider}' toolset before creating this template.`,
      provider: dependency.provider
    })
  }

  private templatePluginSkillDependencyInstallKey(
    workspaceId: string,
    groups: BlankTemplatePluginSkillDependencyGroup[]
  ) {
    return JSON.stringify({
      workspaceId,
      templateId: this.selectedTemplateId(),
      groups
    })
  }

  private templateToolsetDependencyInstallKey(workspaceId: string, dependencies: BlankTemplateToolsetDependency[]) {
    return JSON.stringify({
      workspaceId,
      templateId: this.selectedTemplateId(),
      dependencies
    })
  }

  private templateToolsetDependencyKey(dependency: BlankTemplateToolsetDependency) {
    return JSON.stringify({
      pluginName: dependency.pluginName,
      provider: dependency.provider,
      templateNodeKey: dependency.templateNodeKey,
      targetAgentKey: dependency.targetAgentKey ?? null,
      instanceName: dependency.instanceName ?? null
    })
  }

  private clearTemplateToolsetSelections() {
    this.templateToolsetInstallError.set(null)
    this.loadedTemplateToolsetDependencyKey.set(null)
    this.preparedTemplateToolsetDependencies.set(null)
    this.templateToolsetSelectionStates.set([])
    this.loadingTemplateToolsets.set(false)
    this.configuringTemplateToolsetKey.set(null)
  }

  private async getWorkspacePublicRepositoryId() {
    const existing = this.workspacePublicRepositoryId()
    if (existing) {
      return existing
    }

    const { items } = await firstValueFrom(this.#skillRepositoryService.getAllInOrg().pipe(take(1)))
    const repositoryId =
      items?.find((repository) => repository.provider === WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER)?.id ?? null
    this.workspacePublicRepositoryId.set(repositoryId)
    return repositoryId
  }

  private getRepositorySkillIds(repositoryId: string) {
    return this.skillState()
      .skills.filter((skill) => skill.repositoryId === repositoryId)
      .map((skill) => skill.id)
  }

  private getWorkspaceSkillIds() {
    return this.skillState().skills.map((skill) => skill.id)
  }

  private applyWorkspaceSkillDefaults(workspaceId: string, skillIds: string[]) {
    if (!this.usesWorkspaceSkillDefaults()) {
      return
    }

    if (this.initializedWorkspaceSkillDefaultWorkspaces().has(workspaceId)) {
      return
    }

    const normalizedSkillIds = Array.from(
      new Set(skillIds.map((skillId) => skillId?.trim()).filter((skillId): skillId is string => !!skillId))
    )
    if (normalizedSkillIds.length) {
      this.selectedExplicitSkills.set(Array.from(new Set([...this.selectedExplicitSkills(), ...normalizedSkillIds])))
    }
    this.selectedRepositoryDefault.set(null)
    this.initializedWorkspaceSkillDefaultWorkspaces.update((value) => new Set([...value, workspaceId]))
  }

  private refreshAgentSkillMiddlewareSelections() {
    const middlewares = normalizeBlankMiddlewareSelections(
      this.selectedMiddlewares(),
      this.selectedExplicitSkills(),
      this.selectedRepositoryDefault()
    )
    this.selectedMiddlewares.set(middlewares)
    this.syncMiddlewareRequiredSelections(middlewares)
  }

  private syncMiddlewareRequiredSelections(middlewares = this.selectedMiddlewares()) {
    this.selectedMiddlewareRequired.set(
      normalizeBlankMiddlewareRequiredSelections(middlewares, this.selectedMiddlewareRequired())
    )
  }
}

type BlankAgentSkillSelections = {
  skills: string[]
  repositoryDefault: BlankRepositoryDefaultSelection | null
  middlewares: string[]
  middlewareRequired?: Record<string, boolean>
}

function cloneRepositoryDefaultSelection(
  selection: BlankRepositoryDefaultSelection | null
): BlankRepositoryDefaultSelection | null {
  if (!selection) {
    return null
  }

  return {
    repositoryId: selection.repositoryId,
    disabledSkillIds: [...selection.disabledSkillIds]
  }
}

function buildBlankWorkspaceSkillState(skills: ISkillPackage[]): BlankSkillState {
  return {
    loading: false,
    skills: skills.map((skill) => ({
      id: skill.id,
      label:
        skill.metadata?.displayName ??
        normalizeI18nCandidate(skill.name) ??
        skill.metadata?.name ??
        skill.skillIndex?.name ??
        skill.skillIndex?.skillId ??
        skill.id,
      summary:
        skill.metadata?.summary ??
        skill.metadata?.description ??
        normalizeI18nCandidate(skill.metadata?.description) ??
        skill.skillIndex?.description ??
        null,
      repositoryId: skill.skillIndex?.repositoryId ?? skill.skillIndex?.repository?.id ?? null,
      repositoryName: skill.skillIndex?.repository?.name ?? null,
      repositoryProvider: skill.skillIndex?.repository?.provider ?? null
    })),
    errorMessage: null
  }
}

function collectI18nTextValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.trim() ? [value] : []
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }

  return Object.values(value).filter((item): item is string => typeof item === 'string' && !!item.trim())
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function matchesMiddlewareSearch(provider: BlankMiddlewareProviderOption, search: string) {
  const normalizedSearch = normalizeSearchText(search)
  if (!normalizedSearch) {
    return true
  }

  return normalizeSearchText(
    [
      provider.meta.name,
      ...collectI18nTextValues(provider.meta.label),
      ...collectI18nTextValues(provider.meta.description)
    ]
      .filter(Boolean)
      .join(' ')
  ).includes(normalizedSearch)
}

function normalizeI18nCandidate(value: unknown): string | I18nObject | null {
  if (typeof value === 'string') {
    return value
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as I18nObject
  }

  return null
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function compareToolsetsByUpdatedAtDesc(left: IXpertToolset, right: IXpertToolset) {
  return readDateTime(right.updatedAt) - readDateTime(left.updatedAt)
}

function readDateTime(value: unknown) {
  if (!value) {
    return 0
  }

  const time = new Date(value as string).getTime()
  return Number.isFinite(time) ? time : 0
}

function uniqueByName<T>(values: T[], getName: (value: T) => string) {
  const seen = new Set<string>()
  return values.filter((value) => {
    const name = getName(value)
    if (!name || seen.has(name)) {
      return false
    }

    seen.add(name)
    return true
  })
}

function hasBlockingChecklist(checklist: Array<{ level?: string }> | null | undefined) {
  return (checklist ?? []).some((item) => item.level === 'error')
}
