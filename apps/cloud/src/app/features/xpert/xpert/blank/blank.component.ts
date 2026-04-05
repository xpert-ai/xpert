import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CdkListboxModule } from '@angular/cdk/listbox'

import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal, viewChild } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { injectWorkspace } from '@metad/cloud/state'
import { parseYAML } from '@metad/core'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { ZardComboboxDeprecatedComponent, ZardDialogService, ZardStepperImports } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
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
import { NgmSpinComponent } from '@metad/ocap-angular/common'

import {
  CHAT_WORKFLOW_TRIGGER_PROVIDER,
  WorkflowTriggerProviderOption,
  XpertWorkflowIconComponent,
  hasJsonSchemaRequiredErrors
} from 'apps/cloud/src/app/@shared/workflow'
import { RouterModule } from '@angular/router'
import { XpertSkillInstallDialogComponent } from 'apps/cloud/src/app/@shared/skills'
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
  take,
  throwError
} from 'rxjs'
import {
  BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER,
  BlankTriggerSelection,
  BlankWorkflowStarterNodeKey,
  buildBlankKnowledgeDraft,
  buildBlankWorkflowDraft,
  buildBlankXpertDraft,
  hasBlankWizardSelections,
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
  repositoryName?: string | null
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

export type BlankXpertDialogData = {
  workspace?: IXpertWorkspace | null
  type?: XpertTypeEnum | null
  allowWorkspaceSelection?: boolean
  allowedModes?: BlankXpertMode[] | null
  completionMode?: BlankXpertCompletionMode
  category?: string | null
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
  readonly xpertService = inject(XpertAPIService)
  readonly xpertAgentService = inject(XpertAgentService)
  readonly templateService = inject(XpertTemplateService)
  readonly workspaceService = inject(XpertWorkspaceService)
  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly environmentService = inject(EnvironmentService)
  readonly #toastr = inject(ToastrService)
  readonly basicForm = viewChild(XpertBasicFormComponent)

  readonly requestedType = signal(this.#dialogData.type ?? null)
  readonly allowedModes = this.#dialogData.allowedModes ?? null
  readonly completionMode = this.#dialogData.completionMode ?? ('create' as BlankXpertCompletionMode)
  readonly templateCategory = this.#dialogData.category?.trim() || null
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
  readonly middlewareProviderOptions = computed(() =>
    uniqueByName<{ meta: TAgentMiddlewareMeta }>(this.middlewareProviders(), (provider) => provider.meta.name).filter(
      (provider) => provider.meta.name !== BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER
    )
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
  readonly selectedSkills = model<string[]>([])
  readonly selectedMiddlewares = model<string[]>([])
  readonly selectedKnowledgeTriggers = model<BlankTriggerSelection[]>([])
  readonly selectedDataSources = model<string[]>([])
  readonly selectedProcessors = model<string[]>([])
  readonly selectedChunkers = model<string[]>([])
  readonly selectedUnderstandings = model<string[]>([])
  readonly selectedWorkflowNodes = model<BlankWorkflowStarterNodeKey[]>([])
  readonly workflowActionNodeOptions = WORKFLOW_ACTION_NODE_OPTIONS
  readonly workflowTransformNodeOptions = WORKFLOW_TRANSFORM_NODE_OPTIONS
  readonly selectedMode = computed<BlankXpertMode>(
    () => this.types()[0] ?? getBlankWizardDefaultMode(this.requestedType(), this.allowedModes)
  )
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
      skills: this.selectedSkills(),
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
      this.setAgentSkillSelections([])
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

  create() {
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
    const creation$ = this.startMode() === 'template' ? this.createFromTemplate() : this.createBlankXpert()

    creation$.subscribe({
      next: (result) => {
        this.loading.set(false)
        this.#toastr.success(
          result.status === 'published'
            ? 'PAC.Xpert.CreatedAndPublishedSuccessfully'
            : 'PAC.Messages.CreatedSuccessfully',
          {
            Default: result.status === 'published' ? 'Created and published successfully' : 'Created Successfully'
          }
        )
        this.close(result)
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
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

  private createBlankXpert() {
    const selectedType = this.selectedType()
    const selectedMode = this.selectedMode()

    return this.xpertService
      .create({
        type: selectedType,
        name: this.name(),
        title: this.title(),
        description: this.description(),
        copilotModel: this.copilotModel(),
        latest: true,
        workspaceId: this.workspaceId() ?? undefined,
        avatar: this.avatar(),
        agent: {
          key: genAgentKey(),
          avatar: this.avatar(),
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
      .pipe(switchMap((xpert) => this.provisionKnowledgebaseIfNeeded(xpert)))
      .pipe(switchMap((xpert) => this.completeCreation(xpert)))
  }

  private createFromTemplate() {
    const draft = this.selectedTemplateDraft()
    if (!draft) {
      return throwError(() => new Error('Select a template before continuing.'))
    }

    return of(this.buildTemplateImportDraft(draft)).pipe(
      switchMap((nextDraft) => this.xpertService.importDSL(nextDraft)),
      switchMap((xpert) => this.provisionKnowledgebaseIfNeeded(xpert)),
      switchMap((xpert) => this.completeImportedCreation(xpert))
    )
  }

  toggleMiddleware(provider: string, enabled: boolean) {
    this.selectedMiddlewares.set(
      normalizeBlankMiddlewareSelections(
        this.toggleValue(this.selectedMiddlewares(), provider, enabled),
        this.selectedSkills()
      )
    )
  }

  toggleSkill(skillId: string, enabled: boolean) {
    this.setAgentSkillSelections(this.toggleValue(this.selectedSkills(), skillId, enabled))
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
          maxWidth: '72rem'
        })
        .afterClosed()
        .pipe(take(1))
    )

    if (skillIndex) {
      await this.installSkill(skillIndex)
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
      this.setAgentSkillSelections(Array.from(new Set([...this.selectedSkills(), skillPackage.id])))
      this.refreshSkills()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error) || 'Failed to install the selected skill.')
    } finally {
      this.installingSkillPackage.set(false)
    }
  }

  removeSkill(skillId: string) {
    this.setAgentSkillSelections(this.selectedSkills().filter((item) => item !== skillId))
  }

  close(value?: BlankXpertWizardResult) {
    this.#dialogRef.close(value)
  }

  private refreshSkills() {
    this.skillRefreshTick.update((value) => value + 1)
  }

  private completeCreation(xpert: IXpert) {
    return this.initializeDraftIfNeeded(xpert).pipe(
      switchMap((result) => {
        if (this.completionMode !== 'publish') {
          return of({ xpert: result.xpert, status: 'created' as const })
        }

        if (result.preparationFailed || result.hasBlockingChecklist) {
          this.#toastr.warning('PAC.Xpert.AutoPublishInterrupted', {
            Default: 'Expert created, but auto publish was not completed. You can continue in Studio.'
          })
          return of({ xpert: result.xpert, status: 'created' as const })
        }

        return this.publishCreatedXpert(result.xpert).pipe(
          map((publishedXpert) => ({ xpert: publishedXpert, status: 'published' as const })),
          catchError((error) => {
            this.#toastr.warning(
              'PAC.Xpert.AutoPublishFailed',
              {
                Default: 'Expert created, but auto publish was not completed. You can continue in Studio.'
              },
              getErrorMessage(error)
            )
            console.error(error)
            return of({ xpert: result.xpert, status: 'created' as const })
          })
        )
      })
    )
  }

  private completeImportedCreation(xpert: IXpert) {
    if (this.completionMode !== 'publish') {
      return of({ xpert, status: 'created' as const })
    }

    return this.xpertService.getTeam(xpert.id, { relations: ['agent'] }).pipe(
      switchMap((draftTeam) => {
        if (hasBlockingChecklist(draftTeam.draft?.checklist)) {
          this.#toastr.warning('PAC.Xpert.AutoPublishInterrupted', {
            Default: 'Expert created, but auto publish was not completed. You can continue in Studio.'
          })
          return of({ xpert, status: 'created' as const })
        }

        return this.publishCreatedXpert(xpert).pipe(
          map((publishedXpert) => ({ xpert: publishedXpert, status: 'published' as const })),
          catchError((error) => {
            this.#toastr.warning(
              'PAC.Xpert.AutoPublishFailed',
              {
                Default: 'Expert created, but auto publish was not completed. You can continue in Studio.'
              },
              getErrorMessage(error)
            )
            console.error(error)
            return of({ xpert, status: 'created' as const })
          })
        )
      }),
      catchError((error) => {
        this.#toastr.warning(
          'PAC.Xpert.AutoPublishInterrupted',
          {
            Default: 'Expert created, but auto publish was not completed. You can continue in Studio.'
          },
          getErrorMessage(error)
        )
        console.error(error)
        return of({ xpert, status: 'created' as const })
      })
    )
  }

  private buildTemplateImportDraft(draft: TXpertTeamDraft) {
    const finalDraft = this.isAgentType()
      ? applyAgentTemplateWizardState(draft, this.getSelections())
      : this.isKnowledgeType()
        ? applyKnowledgeTemplateWizardState(draft, this.getKnowledgeSelections())
        : draft

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
        copilotModel: this.copilotModel()
      }
    }
  }

  private applyTemplateDefaults(draft: TXpertTeamDraft) {
    if (this.isAgentType()) {
      const state = extractAgentTemplateWizardState(draft)
      this.applyTemplateBasicInfo(state.basic)
      this.selectedTriggers.set(state.selections.triggers)
      this.applyAgentSkillSelections(state.selections.skills, state.selections.middlewares)
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
    this.applyAgentSkillSelections([], [])
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

  private initializeDraftIfNeeded(xpert: IXpert) {
    if (!shouldInitializeBlankWizardDraft(this.selectedMode(), this.hasAdvancedSelections(), this.completionMode)) {
      return of({
        xpert,
        draftSaved: false,
        hasBlockingChecklist: false,
        preparationFailed: false
      } satisfies DraftPreparationResult)
    }

    if (this.isKnowledgeType()) {
      return from(buildBlankKnowledgeDraft(xpert, this.getKnowledgeSelections())).pipe(
        switchMap((draft) => this.xpertService.saveDraft(xpert.id, draft)),
        map((savedDraft) => ({
          xpert,
          draftSaved: true,
          hasBlockingChecklist: hasBlockingChecklist(savedDraft?.checklist),
          preparationFailed: false
        })),
        catchError((error) => {
          this.#toastr.warning('PAC.Xpert.PreconfigurationNotSaved', {
            Default: 'Expert created, but the preconfiguration could not be saved. You can continue in Studio.'
          })
          console.error(error)
          return of({
            xpert,
            draftSaved: false,
            hasBlockingChecklist: false,
            preparationFailed: true
          } satisfies DraftPreparationResult)
        })
      )
    }

    if (this.isWorkflowType()) {
      return this.getDraftTeam(xpert).pipe(
        switchMap((team) =>
          from(buildBlankWorkflowDraft(team, this.getWorkflowSelections())).pipe(
            switchMap((draft) => this.xpertService.saveDraft(xpert.id, draft)),
            map((savedDraft) => ({
              xpert,
              draftSaved: true,
              hasBlockingChecklist: hasBlockingChecklist(savedDraft?.checklist),
              preparationFailed: false
            }))
          )
        ),
        catchError((error) => {
          this.#toastr.warning('PAC.Xpert.PreconfigurationNotSaved', {
            Default: 'Expert created, but the preconfiguration could not be saved. You can continue in Studio.'
          })
          console.error(error)
          return of({
            xpert,
            draftSaved: false,
            hasBlockingChecklist: false,
            preparationFailed: true
          } satisfies DraftPreparationResult)
        })
      )
    }

    return this.getDraftTeam(xpert).pipe(
      switchMap((team) =>
        from(buildBlankXpertDraft(team, this.getSelections())).pipe(
          switchMap((draft) => this.xpertService.saveDraft(xpert.id, draft)),
          map((savedDraft) => ({
            xpert,
            draftSaved: true,
            hasBlockingChecklist: hasBlockingChecklist(savedDraft?.checklist),
            preparationFailed: false
          }))
        )
      ),
      catchError((error) => {
        this.#toastr.warning('PAC.Xpert.PreconfigurationNotSaved', {
          Default: 'Expert created, but the preconfiguration could not be saved. You can continue in Studio.'
        })
        console.error(error)
        return of({
          xpert,
          draftSaved: false,
          hasBlockingChecklist: false,
          preparationFailed: true
        } satisfies DraftPreparationResult)
      })
    )
  }

  private publishCreatedXpert(xpert: IXpert) {
    const workspaceId = xpert.workspaceId ?? this.workspaceId() ?? null
    const defaultEnvironment$ = workspaceId
      ? this.environmentService.getDefaultByWorkspace(workspaceId).pipe(catchError(() => of(null)))
      : of(null)

    return defaultEnvironment$.pipe(
      switchMap((environment) =>
        this.xpertService.publish(xpert.id, false, {
          environmentId: environment?.id ?? null,
          releaseNotes: XPERT_AUTO_PUBLISH_RELEASE_NOTES
        })
      )
    )
  }

  private provisionKnowledgebaseIfNeeded(xpert: IXpert) {
    if (xpert.type !== XpertTypeEnum.Knowledge) {
      return of(xpert)
    }

    if (xpert.knowledgebase?.id) {
      return of(xpert)
    }

    return this.knowledgebaseService
      .create({
        name: xpert.title || xpert.name,
        description: xpert.description,
        avatar: xpert.avatar,
        workspaceId: xpert.workspaceId ?? this.workspaceId() ?? undefined,
        copilotModel: xpert.copilotModel
      })
      .pipe(
        catchError((error) => this.rollbackKnowledgeXpertCreation(xpert.id, error)),
        switchMap((knowledgebase) =>
          this.knowledgebaseService.update(knowledgebase.id, { pipelineId: xpert.id }).pipe(
            map(() => ({
              ...xpert,
              knowledgebase: {
                ...knowledgebase,
                pipelineId: xpert.id
              }
            })),
            catchError((error) => this.rollbackKnowledgePipelineCreation(xpert.id, knowledgebase.id, error))
          )
        )
      )
  }

  private rollbackKnowledgeXpertCreation(xpertId: string, error: unknown) {
    return this.xpertService.delete(xpertId).pipe(
      catchError(() => of(null)),
      switchMap(() => throwError(() => error))
    )
  }

  private rollbackKnowledgePipelineCreation(xpertId: string, knowledgebaseId: string, error: unknown) {
    return this.knowledgebaseService.delete(knowledgebaseId).pipe(
      catchError(() => of(null)),
      switchMap(() => this.rollbackKnowledgeXpertCreation(xpertId, error))
    )
  }

  private getDraftTeam(xpert: IXpert) {
    if (xpert.agent?.key) {
      return of(xpert)
    }

    return this.xpertService.getTeam(xpert.id, { relations: ['agent'] })
  }

  private getSelections() {
    return {
      triggers: this.selectedTriggers(),
      skills: this.selectedSkills(),
      middlewares: this.selectedMiddlewares()
    }
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

  private setAgentSkillSelections(skills: string[]) {
    this.applyAgentSkillSelections(skills, this.selectedMiddlewares())
  }

  private applyAgentSkillSelections(skills: string[], middlewares: string[]) {
    this.selectedSkills.set(skills)
    this.selectedMiddlewares.set(normalizeBlankMiddlewareSelections(middlewares, skills))
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
      repositoryName: skill.skillIndex?.repository?.name ?? null
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
