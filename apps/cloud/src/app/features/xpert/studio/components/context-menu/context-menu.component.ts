import { CdkMenu, CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectorRef, Component, computed, effect, inject, signal, TemplateRef, ViewChild } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { I18nService } from '@cloud/app/@shared/i18n'
import { XpertWorkflowIconComponent } from '@cloud/app/@shared/workflow'
import { TranslateModule } from '@ngx-translate/core'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { IconComponent } from '@cloud/app/@shared/avatar'
import {
  IWFNClassifier,
  IWFNCode,
  IWFNHttp,
  IWFNIfElse,
  IWFNKnowledgeRetrieval,
  IWFNTool,
  IWFNSubflow,
  IWFNTemplate,
  IWorkflowNode,
  IXpert,
  ToastrService,
  uuid,
  WorkflowNodeTypeEnum,
  XpertParameterTypeEnum,
  IXpertToolset,
  IToolProvider,
  XpertToolsetCategoryEnum,
  IWFNAssigner,
  IWFNTask,
  IWFNAgentTool,
  TASK_DESCRIPTION_PREFIX,
  TASK_DESCRIPTION_SUFFIX,
  IWFNTrigger,
  TWorkflowTriggerMeta,
  XpertTypeEnum,
  KnowledgebaseService,
  IDocumentSourceProvider,
  IWFNSource,
  IWFNProcessor,
  IDocumentProcessorProvider,
  IDocumentChunkerProvider,
  IDocumentUnderstandingProvider,
  IWFNChunker,
  IWFNUnderstanding,
  genPipelineSourceKey,
  genPipelineProcessorKey,
  genPipelineChunkerKey,
  genPipelineUnderstandingKey,
  IWFNListOperator,
  genListOperatorKey,
  IWFNVariableAggregator,
  genVariableAggregatorKey,
  genXpertTriggerKey,
  genXpertDBInsertKey,
  genXpertDBUpdateKey,
  genXpertDBQueryKey,
  genXpertDBDeleteKey,
  genXpertDBSqlKey,
  IWorkflowNodeDBOperation,
  genJSONStringifyKey,
  genJSONParseKey,
  IWFNSkill,
  genXpertSkillKey,
  IWFNMiddleware,
  genXpertMiddlewareKey,
  injectXpertAgentAPI
} from 'apps/cloud/src/app/@core'
import { XpertInlineProfileComponent } from 'apps/cloud/src/app/@shared/xpert'
import { map, Subscription } from 'rxjs'
import {
  genXpertAnswerKey,
  genXpertAssignerKey,
  genXpertClassifierKey,
  genXpertCodeKey,
  genXpertHttpKey,
  genXpertIteratingKey,
  genXpertKnowledgeKey,
  genXpertNoteKey,
  genXpertRouterKey,
  genXpertSubflowKey,
  genXpertTemplateKey,
  genXpertToolKey,
  genXpertAgentToolKey,
  genXpertTaskKey,
} from '../../../utils'
import { XpertStudioApiService } from '../../domain'
import { SelectionService } from '../../domain/selection.service'
import { XpertStudioComponent } from '../../studio.component'
import { XpertStudioKnowledgeMenuComponent } from '../knowledge-menu/knowledge.component'
import { XpertStudioToolsetMenuComponent } from '../toolset-menu/toolset.component'


@Component({
  selector: 'xpert-studio-context-menu',
  exportAs: 'menuComponent',
  standalone: true,
  imports: [
    CommonModule,
    CdkMenuModule,
    TranslateModule,
    MatTooltipModule,
    NgmI18nPipe,
    IconComponent,
    XpertStudioKnowledgeMenuComponent,
    XpertStudioToolsetMenuComponent,
    XpertInlineProfileComponent,
    XpertWorkflowIconComponent,
  ],
  templateUrl: './context-menu.component.html',
  styleUrl: './context-menu.component.scss'
})
export class XpertStudioContextMenuComponent {
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum
  eXpertTypeEnum = XpertTypeEnum

  readonly knowledgebaseAPI = inject(KnowledgebaseService)
  readonly apiService = inject(XpertStudioApiService)
  readonly agentAPI = injectXpertAgentAPI()
  readonly selectionService = inject(SelectionService)
  private root = inject(XpertStudioComponent)
  readonly #cdr = inject(ChangeDetectorRef)
  readonly #translate = inject(I18nService)
  readonly #toastr = inject(ToastrService)

  @ViewChild(TemplateRef, { static: true })
  public template!: TemplateRef<CdkMenu>

  private subscriptions = new Subscription()

  public node: string | null = null

  readonly collaborators$ = this.apiService.collaborators$
  readonly nodes = computed(() => this.root.viewModel()?.nodes)
  readonly agents = computed(() => this.nodes()?.filter((n) => n.type === 'agent'))
  readonly xpertType = computed(() => this.apiService.team()?.type)

  // Get existing external expert IDs
  readonly existingXpertIds = computed(() => {
    const xpertNodes = this.root.xperts() || []
    return new Set(xpertNodes.map(node => node.entity?.id).filter(Boolean))
  })

  // Check if external expert already exists
  isXpertExists(xpert: IXpert): boolean {
    return this.existingXpertIds().has(xpert.id)
  }

  // Workflow providers
  readonly triggerProviders = this.apiService.triggerProviders

  // Knowledge Pipeline
  readonly pipelineType = signal<'source' | 'processor' | 'chunker' | 'understanding' | 'embedder'>('source')
  readonly dataSources$ = this.knowledgebaseAPI.documentSourceStrategies$
  readonly transformers$ = this.knowledgebaseAPI.documentTransformerStrategies$
  readonly imageUnderstandings$ = this.knowledgebaseAPI.understandingStrategies$.pipe(map((items) => items.map((_) => _.meta)))
  readonly textSplitters$ = this.knowledgebaseAPI.textSplitterStrategies$
  readonly agentMiddlewares$ = this.agentAPI.agentMiddlewares$

  public ngOnInit(): void {
    this.subscriptions.add(this.subscribeToSelectionChanges())
  }

  private subscribeToSelectionChanges(): Subscription {
    return this.selectionService.selection$.subscribe((selection) => {
      if (this.root.fFlowComponent().getSelection().fNodeIds.length === 1) {
        this.node = this.root.fFlowComponent().getSelection().fNodeIds[0]
      } else {
        this.node = null
      }

      this.#cdr.detectChanges()
    })
  }

  async createAgent(menu: CdkMenu) {
    menu.menuStack.closeAll()
    const length = this.agents()?.length ?? 0
    this.apiService.createAgent(this.root.contextMenuPosition, {
      title:
        (await this.#translate.instant('PAC.Workflow.Agent', { Default: 'Agent' })) + ' ' + (length ? ` ${length + 1}` : '')
    })
  }

  public addCollaborator(xpert: IXpert): void {
    if (this.isXpertExists(xpert)) {
      this.#toastr.warning(
        this.#translate.instant('PAC.Xpert.DuplicateExternalExpert', {
          Default: '无法重复创建同个外部专家'
        })
      )
      return
    }
    this.apiService.createCollaborator(this.root.contextMenuPosition, xpert)
  }

  public deleteNode(menu: CdkMenu, node: string): void {
    menu.menuStack.closeAll()
    if (node) {
      this.apiService.removeNode(node)
    }
  }

  async pasteNode() {
    const nodeText = await navigator.clipboard.readText()
    try {
      const node = JSON.parse(nodeText)
      this.apiService.pasteNode({
        ...node,
        position: {
          ...this.root.contextMenuPosition
        }
      })
    } catch (err) {
      console.error(err)
      this.#toastr.error(
        this.#translate.instant('PAC.Xpert.UnableParseContent', { Default: 'Unable to parse content' })
      )
    }
  }

  async addWorkflowNote() {
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.NOTE,
      key: genXpertNoteKey(),
      title: await this.#translate.instant('PAC.Workflow.Note', { Default: 'Note' })
    } as IWorkflowNode)
  }

  async addWorkflowRouter() {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.IF_ELSE).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.IF_ELSE,
      key: genXpertRouterKey(),
      title: await this.#translate.instant('PAC.Workflow.Router', { Default: 'Router' }) + (length ? ` ${length + 1}` : ''),
      cases: [
        {
          caseId: uuid(),
          conditions: []
        }
      ]
    } as IWFNIfElse)
  }

  async addWorkflowIterating() {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.ITERATING).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.ITERATING,
      key: genXpertIteratingKey(),
      title: await this.#translate.instant('PAC.Workflow.Iterating', { Default: 'Iterating' }) + (length ? ` ${length + 1}` : '')
    })
  }

  async addWorkflowAnswer() {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.ANSWER).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.ANSWER,
      key: genXpertAnswerKey(),
      title: await this.#translate.instant('PAC.Workflow.Answer', { Default: 'Answer' }) + (length ? ` ${length + 1}` : '')
    })
  }

  async addWorkflowQuestionClassifier() {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.CLASSIFIER).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.CLASSIFIER,
      key: genXpertClassifierKey(),
      title: (await this.#translate.instant('PAC.Workflow.QuestionClassifier', { Default: 'Question Classifier' })) + ` ${length + 1}`,
      inputVariables: ['human.input'],
      classes: [
        {
          description: '',
        },
        {
          description: '',
        },
      ]
    } as IWFNClassifier)
  }

  async addWorkflowKnowledgeRetrieval() {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.KNOWLEDGE).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.KNOWLEDGE,
      key: genXpertKnowledgeKey(),
      title: await this.#translate.instant('PAC.Workflow.KnowledgeRetrieval', { Default: 'Knowledge Retrieval' }) + (length ? ` ${length + 1}` : ''),
      queryVariable: `input`,
      knowledgebases: []
    } as IWFNKnowledgeRetrieval)
  }

  async addWorkflowCode() {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.CODE).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.CODE,
      key: genXpertCodeKey(),
      title: await this.#translate.instant('PAC.Workflow.CodeExecution', { Default: 'Code Execution' }) + ` ${length + 1}`,
      language: 'javascript',
      code: `return {"result": arg1 + arg2};`,
      inputs: [
        {
          name: 'arg1',
          variable: null
        },
        {
          name: 'arg2',
          variable: null
        }
      ],
      outputs: [
        {
          type: XpertParameterTypeEnum.STRING,
          name: 'result'
        }
      ]
    } as IWFNCode)
  }

  async addWorkflowTemplate() {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.TEMPLATE).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.TEMPLATE,
      key: genXpertTemplateKey(),
      title: await this.#translate.instant('PAC.Workflow.TemplateTransform', { Default: 'Template Transform' }) + (length ? ` ${length + 1}` : ''),
      code: `{{arg1}}`,
      inputParams: [
        {
          name: 'arg1',
          variable: ''
        }
      ]
    } as IWFNTemplate)
  }

  addWorkflowJSONStringify() {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.JSON_STRINGIFY).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.JSON_STRINGIFY,
      key: genJSONStringifyKey(),
      title: this.#translate.instant('PAC.Workflow.JSONStringify', { Default: 'JSON Stringify' }) + (length ? ` ${length + 1}` : ''),
    } as IWorkflowNode)
  }

  addWorkflowJSONParse() {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.JSON_PARSE).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.JSON_PARSE,
      key: genJSONParseKey(),
      title: this.#translate.instant('PAC.Workflow.JSONParse', { Default: 'JSON Parse' }) + (length ? ` ${length + 1}` : ''),
    } as IWorkflowNode)
  }

  addWorkflowVariableAssigner() {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.ASSIGNER).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.ASSIGNER,
      key: genXpertAssignerKey(),
      title: this.#translate.instant('PAC.Workflow.VariableAssigner', { Default: 'Variable Assigner' }) + ` ${length + 1}`,
      assigners: [
        {
          value: '',
          variableSelector: '',
          inputType: 'variable'
        }
      ]
    } as IWFNAssigner)
  }

  async addWorkflowHttp() {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.HTTP).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.HTTP,
      key: genXpertHttpKey(),
      method: 'get',
      title: await this.#translate.instant('PAC.Workflow.HTTPRequest', { Default: 'HTTP Request' }) + (length ? ` ${length + 1}` : '')
    } as IWFNHttp)
  }

  async addWorkflowTool() {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.TOOL).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.TOOL,
      key: genXpertToolKey(),
      title: await this.#translate.instant('PAC.Workflow.Tool', { Default: 'Tool' }) + (length ? ` ${length + 1}` : '')
    } as IWFNTool)
  }

  async addWorkflowSubflow() {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.SUBFLOW).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.SUBFLOW,
      key: genXpertSubflowKey(),
      title: await this.#translate.instant('PAC.Workflow.Subflow', { Default: 'Subflow' }) + (length ? ` ${length + 1}` : '')
    } as IWFNSubflow)
  }

  addWorkflowListOperator() {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.LIST_OPERATOR).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.LIST_OPERATOR,
      key: genListOperatorKey(),
      title: this.#translate.instant('PAC.Workflow.ListOperator', { Default: 'List Operator' }) + (length ? ` ${length + 1}` : '')
    } as IWFNListOperator)
  }

  addWorkflowVariableAggregator() {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.VARIABLE_AGGREGATOR).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.VARIABLE_AGGREGATOR,
      key: genVariableAggregatorKey(),
      title: this.#translate.instant('PAC.Workflow.VariableAggregator', { Default: 'Variable Aggregator' }) + (length ? ` ${length + 1}` : '')
    } as IWFNVariableAggregator)
  }

  addWorkflowAgentTool() {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.AGENT_TOOL).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.AGENT_TOOL,
      key: genXpertAgentToolKey(),
      title: this.#translate.instant('PAC.Workflow.AgentTool', { Default: 'Agent Tool' }) + (length ? ` ${length + 1}` : '')
    } as IWFNAgentTool)
  }

  addWorkflowTask() {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.TASK).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.TASK,
      key: genXpertTaskKey(),
      title: this.#translate.instant('PAC.Workflow.TaskHandover', { Default: 'Task Handover' }) + (length ? ` ${length + 1}` : ''),
      descriptionPrefix: TASK_DESCRIPTION_PREFIX,
      descriptionSuffix: TASK_DESCRIPTION_SUFFIX
    } as IWFNTask)
  }

  addWorkflowTrigger(from: string | TWorkflowTriggerMeta) {
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.TRIGGER,
      key: genXpertTriggerKey(),
      title: this.#translate.instant('PAC.Workflow.Trigger', { Default: 'Trigger' }),
      from: typeof from === 'string' ? from : from.name
    } as IWFNTrigger)
  }

  onSelectToolset({toolset, provider}: {toolset?: IXpertToolset; provider?: IToolProvider}) {
    if (toolset) {
      this.apiService.createToolset(this.root.contextMenuPosition, toolset)
    }
    if (provider) {
      this.apiService.createToolset(this.root.contextMenuPosition, {
            key: uuid(),
            category: XpertToolsetCategoryEnum.BUILTIN,
            type: provider.name,
            name: provider.name
          })
    }
  }

  // Knowledge Pipelines
  addPipelineSource(provider: IDocumentSourceProvider) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.SOURCE).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.SOURCE,
      key: genPipelineSourceKey(),
      title: this.#translate.instant('PAC.Xpert.Source', { Default: 'Source' }) + (length ? ` ${length + 1}` : ''),
      provider: provider.name,
    } as IWFNSource)
  }

  addPipelineProcessor(provider: IDocumentProcessorProvider) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.PROCESSOR).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.PROCESSOR,
      key: genPipelineProcessorKey(),
      title: this.#translate.instant('PAC.Xpert.Processor', { Default: 'Processor' }) + (length ? ` ${length + 1}` : ''),
      provider: provider.name,
    } as IWFNProcessor)
  }

  addPipelineChunker(provider: IDocumentChunkerProvider) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.CHUNKER).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.CHUNKER,
      key: genPipelineChunkerKey(),
      title: this.#translate.instant('PAC.Xpert.Chunker', { Default: 'Chunker' }) + (length ? ` ${length + 1}` : ''),
      provider: provider.name,
    } as IWFNChunker)
  }

  addPipelineUnderstanding(provider: IDocumentUnderstandingProvider) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.UNDERSTANDING).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.UNDERSTANDING,
      key: genPipelineUnderstandingKey(),
      title: this.#translate.instant('PAC.Pipeline.Understanding', { Default: 'Understanding' }) + (length ? ` ${length + 1}` : ''),
      provider: provider.name,
    } as IWFNUnderstanding)
  }

  addWorkflowDatabase(type: WorkflowNodeTypeEnum) {
    let key = ''
    let title = ''
    switch (type) {
      case WorkflowNodeTypeEnum.DB_INSERT:
        key = genXpertDBInsertKey()
        title = this.#translate.instant('PAC.Workflow.NewData', { Default: 'New Data' })
        break
      case WorkflowNodeTypeEnum.DB_UPDATE:
        key = genXpertDBUpdateKey()
        title = this.#translate.instant('PAC.Workflow.UpdateData', { Default: 'Update Data' })
        break
      case WorkflowNodeTypeEnum.DB_QUERY:
        key = genXpertDBQueryKey()
        title = this.#translate.instant('PAC.Workflow.QueryData', { Default: 'Query Data' })
        break
      case WorkflowNodeTypeEnum.DB_DELETE:
        key = genXpertDBDeleteKey()
        title = this.#translate.instant('PAC.Workflow.DeleteData', { Default: 'Delete Data' })
        break
      case WorkflowNodeTypeEnum.DB_SQL:
        key = genXpertDBSqlKey()
        title = this.#translate.instant('PAC.Workflow.SQLCustom', { Default: 'SQL Custom' })
        break
    }
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type,
      key,
      title,
    } as IWorkflowNodeDBOperation)
  }

  // Pro
  addSkill() {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.SKILL).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.SKILL,
      key: genXpertSkillKey(),
      title: this.#translate.instant('PAC.Workflow.Skill', { Default: 'Skill' }) + (length ? ` ${length + 1}` : ''),
    } as IWFNSkill)
  }

  addMiddleware(provider: string) {
    if (!provider) return
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.MIDDLEWARE).length ?? 0
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.MIDDLEWARE,
      key: genXpertMiddlewareKey(),
      title: this.#translate.instant('PAC.KEY_WORDS.Middleware', { Default: 'Middleware' }) + (length ? ` ${length + 1}` : ''),
      provider,
    } as IWFNMiddleware)
  }
}
