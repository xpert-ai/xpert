import { CdkMenu, CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectorRef, Component, computed, effect, inject, model, signal, TemplateRef, ViewChild } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { I18nService } from '@cloud/app/@shared/i18n'
import { XpertWorkflowIconComponent } from '@cloud/app/@shared/workflow'
import { TranslateModule } from '@ngx-translate/core'
import { debouncedSignal, NgmI18nPipe } from '@metad/ocap-angular/core'
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
  injectXpertAgentAPI,
  TXpertTeamNode,
  genXpertIteratorKey,
  genXpertStartKey
} from 'apps/cloud/src/app/@core'
import { XpertInlineProfileComponent } from 'apps/cloud/src/app/@shared/xpert'
import { map, Subscription } from 'rxjs'
import {
  genAgentKey,
  genXpertAnswerKey,
  genXpertAssignerKey,
  genXpertClassifierKey,
  genXpertCodeKey,
  genXpertHttpKey,
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
import { FormsModule } from '@angular/forms'
import { toSignal } from '@angular/core/rxjs-interop'
import { NgmCommonModule } from "@metad/ocap-angular/common";


@Component({
  selector: 'xpert-studio-context-menu',
  exportAs: 'menuComponent',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    TranslateModule,
    MatTooltipModule,
    NgmI18nPipe,
    IconComponent,
    XpertStudioKnowledgeMenuComponent,
    XpertStudioToolsetMenuComponent,
    XpertInlineProfileComponent,
    XpertWorkflowIconComponent,
    NgmCommonModule
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
  readonly i18n = new NgmI18nPipe()

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

  // Middlewares
  readonly agentMiddlewares = toSignal(this.agentAPI.agentMiddlewares$)
  readonly searchMiddlewares = model<string>('')
  readonly #searchMiddlewaresTerm = debouncedSignal(this.searchMiddlewares, 300)
  readonly filteredAgentMiddlewares = computed(() => this.agentMiddlewares()?.filter(middleware => {
    const term = this.#searchMiddlewaresTerm()?.toLowerCase().trim()
    return term ? middleware.meta.name.toLowerCase().includes(term)
    || this.i18n.transform(middleware.meta.label).toLowerCase().includes(term) : true
  }) ?? [])

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

  /**
   * Reconnect the connection after inserting a new node
   * Original: A -> B, After: A -> newNode -> B
   * @param newNodeKey The key of the newly created node
   */
  private reconnectAfterInsert(newNodeKey: string): void {
    const connection = this.root.insertConnection
    if (!connection) return

    // Build connection IDs based on connection type
    const sourceId = connection.from + '/' + connection.type
    const targetId = connection.to + (connection.type === 'edge' ? '/edge' : '')

    // Remove original connection: A -> B
    this.apiService.removeConnection(sourceId, targetId)

    // Create new connection: A -> newNode
    this.apiService.createConnection({
      sourceId: sourceId,
      targetId: newNodeKey + (connection.type === 'edge' ? '/edge' : '')
    })

    // Create new connection: newNode -> B
    this.apiService.createConnection({
      sourceId: newNodeKey + (connection.type === 'edge' ? '/edge' : '/' + connection.type),
      targetId: targetId
    })

    // Clear the insert connection state
    this.root.insertConnection = null
  }

  createAgent(menu: CdkMenu, byNode: TXpertTeamNode) {
    menu.menuStack.closeAll()
    const length = this.agents()?.length ?? 0
    const key = genAgentKey()
    this.apiService.createAgent(this.root.contextMenuPosition, {
      key,
      title:
        (this.#translate.instant('PAC.Workflow.Agent', { Default: 'Agent' })) + ' ' + (length ? ` ${length + 1}` : '')
    }, byNode?.key)
    this.reconnectAfterInsert(key)
  }

  public addCollaborator(xpert: IXpert): void {
    if (this.isXpertExists(xpert)) {
      this.#toastr.warning(
        this.#translate.instant('PAC.Xpert.DuplicateExternalExpert', {
          Default: 'Cannot create duplicate external expert'
        })
      )
      return
    }
    // Store connection info before async call
    const insertConnection = this.root.insertConnection
    this.apiService.createCollaborator(this.root.contextMenuPosition, xpert)
    // External expert node uses xpert.id as key
    if (insertConnection) {
      // Delay reconnect to allow node creation to complete
      setTimeout(() => {
        this.root.insertConnection = insertConnection
        this.reconnectAfterInsert(xpert.id)
      }, 100)
    }
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

  async addWorkflowNote(fromNode?: TXpertTeamNode) {
    const key = genXpertNoteKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.NOTE,
      key,
      title: await this.#translate.instant('PAC.Workflow.Note', { Default: 'Note' })
    } as IWorkflowNode, fromNode)
    this.reconnectAfterInsert(key)
  }

  async addWorkflowRouter(fromNode?: TXpertTeamNode) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.IF_ELSE).length ?? 0
    const key = genXpertRouterKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.IF_ELSE,
      key,
      title: await this.#translate.instant('PAC.Workflow.Router', { Default: 'Router' }) + (length ? ` ${length + 1}` : ''),
      cases: [
        {
          caseId: uuid(),
          conditions: []
        }
      ]
    } as IWFNIfElse, fromNode)
    this.reconnectAfterInsert(key)
  }

  addWorkflowIterator(fromNode?: TXpertTeamNode) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.ITERATOR).length ?? 0
    const iteratorKey = genXpertIteratorKey()
    const position = fromNode?.position
      ? { x: fromNode.position.x + 200, y: fromNode.position.y }
      : this.root.contextMenuPosition
    this.apiService.addNode(position, {
      key: iteratorKey,
      type: 'workflow',
      parentId: fromNode?.parentId,
      size: { width: 120, height: 60 },
      entity: {
        id: '',
        type: WorkflowNodeTypeEnum.ITERATOR,
        key: iteratorKey,
        title: this.#translate.instant('PAC.Workflow.Iterator', { Default: 'Iterator' }) + (length ? ` ${length + 1}` : ''),
      }
    })
    if (fromNode) {
      this.apiService.createConnection({
        sourceId: fromNode.key + '/edge',
        targetId: iteratorKey
      })
    }
    const startKey = genXpertStartKey(iteratorKey)
    this.apiService.addNode(position, {
      type: 'workflow',
      key: startKey,
      parentId: iteratorKey,
      size: { width: 46, height: 46 },
      entity: {
        id: startKey,
        type: WorkflowNodeTypeEnum.START,
        key: startKey,
      }
    })
    this.reconnectAfterInsert(iteratorKey)
  }

  addWorkflowAnswer(fromNode?: TXpertTeamNode) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.ANSWER).length ?? 0
    const key = genXpertAnswerKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.ANSWER,
      key,
      title: this.#translate.instant('PAC.Workflow.Answer', { Default: 'Answer' }) + (length ? ` ${length + 1}` : '')
    }, fromNode)
    this.reconnectAfterInsert(key)
  }

  addWorkflowQuestionClassifier(fromNode?: TXpertTeamNode) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.CLASSIFIER).length ?? 0
    const key = genXpertClassifierKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.CLASSIFIER,
      key,
      title: this.#translate.instant('PAC.Workflow.QuestionClassifier', { Default: 'Question Classifier' }) + ` ${length + 1}`,
      inputVariables: ['human.input'],
      classes: [
        {
          description: '',
        },
        {
          description: '',
        },
      ]
    } as IWFNClassifier, fromNode)
    this.reconnectAfterInsert(key)
  }

  addWorkflowKnowledgeRetrieval(fromNode?: TXpertTeamNode) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.KNOWLEDGE).length ?? 0
    const key = genXpertKnowledgeKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.KNOWLEDGE,
      key,
      title: this.#translate.instant('PAC.Workflow.KnowledgeRetrieval', { Default: 'Knowledge Retrieval' }) + (length ? ` ${length + 1}` : ''),
      queryVariable: `input`,
      knowledgebases: []
    } as IWFNKnowledgeRetrieval, fromNode)
    this.reconnectAfterInsert(key)
  }

  addWorkflowCode(fromNode?: TXpertTeamNode) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.CODE).length ?? 0
    const key = genXpertCodeKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.CODE,
      key,
      title: this.#translate.instant('PAC.Workflow.CodeExecution', { Default: 'Code Execution' }) + ` ${length + 1}`,
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
    } as IWFNCode, fromNode)
    this.reconnectAfterInsert(key)
  }

  addWorkflowTemplate(fromNode?: TXpertTeamNode) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.TEMPLATE).length ?? 0
    const key = genXpertTemplateKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.TEMPLATE,
      key,
      title: this.#translate.instant('PAC.Workflow.TemplateTransform', { Default: 'Template Transform' }) + (length ? ` ${length + 1}` : ''),
      code: `{{arg1}}`,
      inputParams: [
        {
          name: 'arg1',
          variable: ''
        }
      ]
    } as IWFNTemplate, fromNode)
    this.reconnectAfterInsert(key)
  }

  addWorkflowJSONStringify(fromNode: TXpertTeamNode) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.JSON_STRINGIFY).length ?? 0
    const key = genJSONStringifyKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
        type: WorkflowNodeTypeEnum.JSON_STRINGIFY,
        key,
        title: this.#translate.instant('PAC.Workflow.JSONStringify', { Default: 'JSON Stringify' }) + (length ? ` ${length + 1}` : ''),
      } as IWorkflowNode,
      fromNode
    )
    this.reconnectAfterInsert(key)
  }

  addWorkflowJSONParse(fromNode: TXpertTeamNode) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.JSON_PARSE).length ?? 0
    const key = genJSONParseKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
        type: WorkflowNodeTypeEnum.JSON_PARSE,
        key,
        title: this.#translate.instant('PAC.Workflow.JSONParse', { Default: 'JSON Parse' }) + (length ? ` ${length + 1}` : ''),
      } as IWorkflowNode,
      fromNode
    )
    this.reconnectAfterInsert(key)
  }

  addWorkflowVariableAssigner(fromNode?: TXpertTeamNode) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.ASSIGNER).length ?? 0
    const key = genXpertAssignerKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.ASSIGNER,
      key,
      title: this.#translate.instant('PAC.Workflow.VariableAssigner', { Default: 'Variable Assigner' }) + ` ${length + 1}`,
      assigners: [
        {
          value: '',
          variableSelector: '',
          inputType: 'variable'
        }
      ]
    } as IWFNAssigner, fromNode)
    this.reconnectAfterInsert(key)
  }

  async addWorkflowHttp(fromNode?: TXpertTeamNode) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.HTTP).length ?? 0
    const key = genXpertHttpKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.HTTP,
      key,
      method: 'get',
      title: await this.#translate.instant('PAC.Workflow.HTTPRequest', { Default: 'HTTP Request' }) + (length ? ` ${length + 1}` : '')
    } as IWFNHttp, fromNode)
    this.reconnectAfterInsert(key)
  }

  async addWorkflowTool(fromNode?: TXpertTeamNode) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.TOOL).length ?? 0
    const key = genXpertToolKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.TOOL,
      key,
      title: await this.#translate.instant('PAC.Workflow.Tool', { Default: 'Tool' }) + (length ? ` ${length + 1}` : '')
    } as IWFNTool, fromNode)
    this.reconnectAfterInsert(key)
  }

  async addWorkflowSubflow(fromNode?: TXpertTeamNode) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.SUBFLOW).length ?? 0
    const key = genXpertSubflowKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.SUBFLOW,
      key,
      title: await this.#translate.instant('PAC.Workflow.Subflow', { Default: 'Subflow' }) + (length ? ` ${length + 1}` : '')
    } as IWFNSubflow, fromNode)
    this.reconnectAfterInsert(key)
  }

  addWorkflowListOperator(fromNode?: TXpertTeamNode) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.LIST_OPERATOR).length ?? 0
    const key = genListOperatorKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.LIST_OPERATOR,
      key,
      title: this.#translate.instant('PAC.Workflow.ListOperator', { Default: 'List Operator' }) + (length ? ` ${length + 1}` : '')
    } as IWFNListOperator, fromNode)
    this.reconnectAfterInsert(key)
  }

  addWorkflowVariableAggregator(fromNode?: TXpertTeamNode) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.VARIABLE_AGGREGATOR).length ?? 0
    const key = genVariableAggregatorKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.VARIABLE_AGGREGATOR,
      key,
      title: this.#translate.instant('PAC.Workflow.VariableAggregator', { Default: 'Variable Aggregator' }) + (length ? ` ${length + 1}` : '')
    } as IWFNVariableAggregator, fromNode)
    this.reconnectAfterInsert(key)
  }

  addWorkflowAgentTool(fromNode?: TXpertTeamNode) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.AGENT_TOOL).length ?? 0
    const key = genXpertAgentToolKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.AGENT_TOOL,
      key,
      title: this.#translate.instant('PAC.Workflow.AgentTool', { Default: 'Agent Tool' }) + (length ? ` ${length + 1}` : '')
    } as IWFNAgentTool, fromNode)
    this.reconnectAfterInsert(key)
  }

  addWorkflowTask(fromNode?: TXpertTeamNode) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.TASK).length ?? 0
    const key = genXpertTaskKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.TASK,
      key,
      title: this.#translate.instant('PAC.Workflow.TaskHandover', { Default: 'Task Handover' }) + (length ? ` ${length + 1}` : ''),
      descriptionPrefix: TASK_DESCRIPTION_PREFIX,
      descriptionSuffix: TASK_DESCRIPTION_SUFFIX
    } as IWFNTask, fromNode)
    this.reconnectAfterInsert(key)
  }

  addWorkflowTrigger(from: string | TWorkflowTriggerMeta) {
    // Only one chat trigger node is allowed for an expert.
    const hasTrigger = from === 'chat' && this.nodes()?.some(
      (n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.TRIGGER && (<IWFNTrigger>n.entity).from === 'chat'
    )
    if (hasTrigger) {
      this.#toastr.danger(this.#translate.instant('PAC.Workflow.OnlyOneTrigger', { Default: 'An expert can only have one chat trigger.' }))
      return
    }

    const key = genXpertTriggerKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.TRIGGER,
      key,
      title: this.#translate.instant('PAC.Workflow.Trigger', { Default: 'Trigger' }),
      from: typeof from === 'string' ? from : from.name
    } as IWFNTrigger)
    this.reconnectAfterInsert(key)
  }

  onSelectToolset({toolset, provider}: {toolset?: IXpertToolset; provider?: IToolProvider}) {
    let key: string | undefined
    if (toolset) {
      key = toolset.key ?? toolset.id
      this.apiService.createToolset(this.root.contextMenuPosition, toolset)
    }
    if (provider) {
      key = uuid()
      this.apiService.createToolset(this.root.contextMenuPosition, {
            key,
            category: XpertToolsetCategoryEnum.BUILTIN,
            type: provider.name,
            name: provider.name
          })
    }
    if (key) {
      this.reconnectAfterInsert(key)
    }
  }

  // Knowledge Pipelines
  addPipelineSource(provider: IDocumentSourceProvider) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.SOURCE).length ?? 0
    const key = genPipelineSourceKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.SOURCE,
      key,
      title: this.#translate.instant('PAC.Xpert.Source', { Default: 'Source' }) + (length ? ` ${length + 1}` : ''),
      provider: provider.name,
    } as IWFNSource)
    this.reconnectAfterInsert(key)
  }

  addPipelineProcessor(provider: IDocumentProcessorProvider) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.PROCESSOR).length ?? 0
    const key = genPipelineProcessorKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.PROCESSOR,
      key,
      title: this.#translate.instant('PAC.Xpert.Processor', { Default: 'Processor' }) + (length ? ` ${length + 1}` : ''),
      provider: provider.name,
    } as IWFNProcessor)
    this.reconnectAfterInsert(key)
  }

  addPipelineChunker(provider: IDocumentChunkerProvider) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.CHUNKER).length ?? 0
    const key = genPipelineChunkerKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.CHUNKER,
      key,
      title: this.#translate.instant('PAC.Xpert.Chunker', { Default: 'Chunker' }) + (length ? ` ${length + 1}` : ''),
      provider: provider.name,
    } as IWFNChunker)
    this.reconnectAfterInsert(key)
  }

  addPipelineUnderstanding(provider: IDocumentUnderstandingProvider) {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.UNDERSTANDING).length ?? 0
    const key = genPipelineUnderstandingKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.UNDERSTANDING,
      key,
      title: this.#translate.instant('PAC.Pipeline.Understanding', { Default: 'Understanding' }) + (length ? ` ${length + 1}` : ''),
      provider: provider.name,
    } as IWFNUnderstanding)
    this.reconnectAfterInsert(key)
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
    this.reconnectAfterInsert(key)
  }

  // Pro
  addSkill() {
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.SKILL).length ?? 0
    const key = genXpertSkillKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.SKILL,
      key,
      title: this.#translate.instant('PAC.Workflow.Skill', { Default: 'Skill' }) + (length ? ` ${length + 1}` : ''),
    } as IWFNSkill)
    this.reconnectAfterInsert(key)
  }

  addMiddleware(provider: string) {
    if (!provider) return
    const length = this.nodes()?.filter((n) => n.type === 'workflow' && n.entity?.type === WorkflowNodeTypeEnum.MIDDLEWARE).length ?? 0
    const key = genXpertMiddlewareKey()
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.MIDDLEWARE,
      key,
      title: this.#translate.instant('PAC.KEY_WORDS.Middleware', { Default: 'Middleware' }) + (length ? ` ${length + 1}` : ''),
      provider,
    } as IWFNMiddleware)
    this.reconnectAfterInsert(key)
  }
}
