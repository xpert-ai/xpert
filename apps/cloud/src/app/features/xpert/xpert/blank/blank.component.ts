import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CdkListboxModule } from '@angular/cdk/listbox'

import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal, viewChild } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { injectWorkspace } from '@xpert-ai/cloud/state'
import { parseYAML } from '@xpert-ai/core'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import {
  ZardComboboxDeprecatedComponent,
  ZardDialogService,
  ZardStepperImports,
  type ZardStepperSelectionEvent
} from '@xpert-ai/headless-ui'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  EnvironmentService,
  IDocumentChunkerProvider,
  IDocumentProcessorProvider,
  IDocumentSourceProvider,
  IDocumentUnderstandingProvider,
  I18nObject,
  getErrorMessage,
  ICopilotModel,
  ISkillPackage,
  ISkillRepositoryIndex,
  IXpert,
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
import { XpertSkillInstallDialogComponent, XpertSkillInstallDialogResult } from 'apps/cloud/src/app/@shared/skills'
import {
  BehaviorSubject,
  catchError,
  firstValueFrom,
  from,
  map,
  Observable,
  of,
  startWith,
  switchMap,
  take
} from 'rxjs'
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
  mergeBlankMiddlewareRequiredFeatures,
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

export type BlankXpertWizardStatus = 'created' | 'published'

export type BlankXpertWizardResult = {
  xpert: IXpert
  status: BlankXpertWizardStatus
}

export const BLANK_XPERT_DIALOG_CATEGORY = {
  CLAW: 'claw'
} as const

export type BlankXpertDialogCategory =
  (typeof BLANK_XPERT_DIALOG_CATEGORY)[keyof typeof BLANK_XPERT_DIALOG_CATEGORY]

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
const AGENT_SKILL_STEP_INDEX = 4

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
    FormsModule,
    CdkListboxModule,
    NgmI18nPipe,
    NgmSpinComponent,
    ZardComboboxDeprecatedComponent,
    XpertBasicFormComponent,
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
  readonly #skillPackageService = inject(SkillPackageService)
  readonly #skillRepositoryService = inject(SkillRepositoryService)
  readonly xpertService = inject(XpertAPIService)
  readonly xpertAgentService = inject(XpertAgentService)
  readonly templateService = inject(XpertTemplateService)
  readonly workspaceService = inject(XpertWorkspaceService)
  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly environmentService = inject(EnvironmentService)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)
  readonly basicForm = viewChild(XpertBasicFormComponent)

  readonly requestedType = signal(this.#dialogData.type ?? null)
  readonly allowedModes = this.#dialogData.allowedModes ?? null
  readonly completionMode = this.#dialogData.completionMode ?? ('create' as BlankXpertCompletionMode)
  readonly templateCategory = normalizeBlankXpertDialogCategory(this.#dialogData.category)
  readonly usesWorkspaceSkillDefaults = computed(() => this.templateCategory === BLANK_XPERT_DIALOG_CATEGORY.CLAW)
  readonly allowWorkspaceSelection = !!this.#dialogData.allowWorkspaceSelection
  readonly availableModes = computed(() => getBlankWizardAvailableModes(this.requestedType(), this.allowedModes))
  readonly types = model<BlankXpertMode[]>([getBlankWizardDefaultMode(this.#dialogData.type, this.allowedModes)])
  readonly startMode = model<BlankXpertStartMode>('blank')
  readonly workspaceId = model<string | null>(this.#dialogData.workspace?.id ?? this.#selectedWorkspace()?.id ?? null)
  readonly name = model<string>()
  readonly description = model<string>()
  readonly avatar = model<TAvatar>()
  readonly title = model<string>()
  readonly copilotModel = model<ICopilotModel>()
  readonly selectedTemplateId = model<string | null>(null)
  readonly selectedTemplateDraft = signal<TXpertTeamDraft | null>(null)
  readonly templateLoading = signal(false)
  readonly templateLoadError = signal<string | null>(null)
  readonly agentTemplateCatalogLoading = signal(true)
  readonly agentTemplateCatalogError = signal<string | null>(null)
  readonly knowledgeTemplateCatalogLoading = signal(true)
  readonly knowledgeTemplateCatalogError = signal<string | null>(null)
  readonly #refreshWorkspaces$ = new BehaviorSubject<void>(undefined)
  readonly workspaces = toSignal(
    this.#refreshWorkspaces$.pipe(
      switchMap(() =>
        this.workspaceService.getAllMy({ order: { updatedAt: OrderTypeEnum.DESC } }).pipe(map(({ items }) => items))
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
  readonly triggerProviderOptions = computed(() =>
    uniqueByName<WorkflowTriggerProviderOption>(
      [CHAT_WORKFLOW_TRIGGER_PROVIDER, ...this.triggerProviders()],
      (provider) => provider.name
    )
  )
  readonly middlewareProviderOptions = computed<BlankMiddlewareProviderOption[]>(() => {
    const availableProviders = uniqueByName<BlankMiddlewareProviderOption>(
      this.middlewareProviders().map(({ meta }) => ({ meta })),
      (provider) => provider.meta.name
    ).filter((provider) => provider.meta.name !== BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER)
    const availableNames = new Set(availableProviders.map((provider) => provider.meta.name))
    const unavailableTemplateSelections = this.selectedMiddlewares()
      .filter(
        (provider) =>
          !!provider && provider !== BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER && !availableNames.has(provider)
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
  readonly selectedKnowledgeTriggers = model<BlankTriggerSelection[]>([])
  readonly selectedDataSources = model<string[]>([])
  readonly selectedProcessors = model<string[]>([])
  readonly selectedChunkers = model<string[]>([])
  readonly selectedUnderstandings = model<string[]>([])
  readonly selectedWorkflowNodes = model<BlankWorkflowStarterNodeKey[]>([])
  readonly preparedSkillWorkspaces = signal<Set<string>>(new Set())
  readonly initializedWorkspaceSkillDefaultWorkspaces = signal<Set<string>>(new Set())
  readonly workflowActionNodeOptions = WORKFLOW_ACTION_NODE_OPTIONS
  readonly workflowTransformNodeOptions = WORKFLOW_TRANSFORM_NODE_OPTIONS
  readonly selectedMode = computed<BlankXpertMode>(
    () => this.types()[0] ?? getBlankWizardDefaultMode(this.requestedType(), this.allowedModes)
  )
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
  readonly selectedType = computed(() => getBlankWizardPersistedType(this.selectedMode()))
  readonly isAgentType = computed(() => this.selectedMode() === XpertTypeEnum.Agent)
  readonly isWorkflowType = computed(() => this.selectedMode() === BLANK_XPERT_WORKFLOW_MODE)
  readonly isKnowledgeType = computed(() => this.selectedMode() === XpertTypeEnum.Knowledge)
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
          this.selectedTemplateDraft.set(null)
        }
        return
      }

      this.templateLoading.set(true)
      this.templateLoadError.set(null)
      this.selectedTemplateDraft.set(null)
      this.applyBlankDefaults()

      const template$: Observable<{ export_data: string }> =
        selectedMode === XpertTypeEnum.Agent
          ? this.templateService
              .getTemplate(templateId)
              .pipe(map((template) => ({ export_data: template.export_data })))
          : this.templateService
              .getKnowledgePipelineTemplate(templateId)
              .pipe(map((template) => ({ export_data: template.export_data })))

      const subscription = template$
        .pipe(switchMap((data) => from(parseYAML(data.export_data) as Promise<TXpertTeamDraft>)))
        .subscribe({
          next: (draft) => {
            this.templateLoading.set(false)
            this.selectedTemplateDraft.set(draft)
            this.applyTemplateDefaults(draft)
          },
          error: (error) => {
            this.templateLoading.set(false)
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
      this.basicStepInvalid() ||
      (this.isAgentType() && this.selectedTriggersInvalid()) ||
      (this.isKnowledgeType() && this.selectedKnowledgeTriggersInvalid())
    ) {
      return
    }

    this.loading.set(true)
    try {
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

  setStartMode(mode: BlankXpertStartMode) {
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
    const primaryAgentPrompt = this.buildInitialPrimaryAgentPrompt()
    const features = mergeBlankMiddlewareRequiredFeatures(
      undefined,
      this.selectedMiddlewares(),
      selectedMiddlewareDefinitions
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
          this.selectedMiddlewares(),
          selectedMiddlewareDefinitions
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
    const nextDraft = this.withInitialPrimaryAgentPromptInDraft(this.buildTemplateImportDraft(draft), primaryAgentPrompt)
    const xpert = await firstValueFrom(this.xpertService.importDSL(nextDraft))
    const hydratedXpert = this.withInitialPrimaryAgentPrompt(xpert, primaryAgentPrompt)
    const preparedXpert = await this.provisionKnowledgebaseIfNeeded(hydratedXpert)
    return this.completeImportedCreation(preparedXpert)
  }

  toggleMiddleware(provider: string, enabled: boolean) {
    this.selectedMiddlewares.set(
      normalizeBlankMiddlewareSelections(
        this.toggleValue(this.selectedMiddlewares(), provider, enabled),
        this.selectedExplicitSkills(),
        this.selectedRepositoryDefault()
      )
    )
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
      if (!this.usesWorkspaceSkillDefaults() && item.repository?.provider === WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER && item.repositoryId) {
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

  private buildTemplateImportDraft(draft: TXpertTeamDraft) {
    const selectedCopilotModel = this.copilotModel() ?? draft.team.agent?.copilotModel ?? draft.team.copilotModel ?? null
    const finalDraft = this.isAgentType()
      ? applyAgentTemplateWizardState(draft, this.getSelections(), {
          defaultCopilotModel: selectedCopilotModel,
          middlewareDefinitions: this.getSelectedMiddlewareDefinitions()
        })
      : this.isKnowledgeType()
        ? applyKnowledgeTemplateWizardState(draft, this.getKnowledgeSelections())
        : draft
    const features = this.isAgentType()
      ? mergeBlankMiddlewareRequiredFeatures(
          finalDraft.team.features,
          this.selectedMiddlewares(),
          this.getSelectedMiddlewareDefinitions()
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
    this.selectedTemplateDraft.set(null)
    this.templateLoading.set(false)
    this.templateLoadError.set(null)
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
      const draft = await buildBlankXpertDraft(team, this.getSelections(), {
        defaultCopilotModel: team.agent?.copilotModel ?? team.copilotModel ?? this.copilotModel() ?? null,
        middlewareDefinitions: this.getSelectedMiddlewareDefinitions()
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
      middlewares: this.selectedMiddlewares()
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
    this.selectedMiddlewares.set(
      normalizeBlankMiddlewareSelections(selections.middlewares, selections.skills, selections.repositoryDefault)
    )
  }

  private clearWorkspaceScopedAgentSelections() {
    this.initializedWorkspaceSkillDefaultWorkspaces.set(new Set())
    this.applyAgentSkillSelections({
      skills: [],
      repositoryDefault: null,
      middlewares: this.selectedMiddlewares().filter((provider) => provider !== BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER)
    })
  }

  async onAgentStepChange(event: ZardStepperSelectionEvent) {
    if (event.selectedIndex !== AGENT_SKILL_STEP_INDEX) {
      return
    }

    await this.prepareAgentSkillStep()
  }

  private async prepareAgentSkillStep() {
    const workspaceId = this.workspaceId()
    if (!workspaceId || this.installingSkillPackage()) {
      return
    }

    if (this.preparedSkillWorkspaces().has(workspaceId)) {
      if (this.usesWorkspaceSkillDefaults()) {
        this.applyWorkspaceSkillDefaults(workspaceId, this.getWorkspaceSkillIds())
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
    this.selectedMiddlewares.set(
      normalizeBlankMiddlewareSelections(
        this.selectedMiddlewares(),
        this.selectedExplicitSkills(),
        this.selectedRepositoryDefault()
      )
    )
  }
}

type BlankAgentSkillSelections = {
  skills: string[]
  repositoryDefault: BlankRepositoryDefaultSelection | null
  middlewares: string[]
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

function normalizeI18nCandidate(value: unknown): string | I18nObject | null {
  if (typeof value === 'string') {
    return value
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as I18nObject
  }

  return null
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
