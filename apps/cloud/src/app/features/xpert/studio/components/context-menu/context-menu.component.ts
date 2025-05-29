import { CdkMenu, CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectorRef, Component, computed, inject, TemplateRef, ViewChild } from '@angular/core'
import { MatTabsModule } from '@angular/material/tabs'
import { TranslateModule } from '@ngx-translate/core'
import {
  IWFNCode,
  IWFNHttp,
  IWFNIfElse,
  IWFNKnowledgeRetrieval,
  IWFNSubflow,
  IWFNTemplate,
  IWorkflowNode,
  IXpert,
  ToastrService,
  uuid,
  WorkflowNodeTypeEnum,
  XpertParameterTypeEnum
} from 'apps/cloud/src/app/@core'
import { XpertInlineProfileComponent } from 'apps/cloud/src/app/@shared/xpert'
import { Subscription } from 'rxjs'
import {
  genXpertAnswerKey,
  genXpertCodeKey,
  genXpertHttpKey,
  genXpertIteratingKey,
  genXpertKnowledgeKey,
  genXpertNoteKey,
  genXpertRouterKey,
  genXpertSubflowKey,
  genXpertTemplateKey
} from '../../../utils'
import { XpertStudioApiService } from '../../domain'
import { SelectionService } from '../../domain/selection.service'
import { XpertStudioComponent } from '../../studio.component'
import { XpertStudioKnowledgeMenuComponent } from '../knowledge-menu/knowledge.component'
import { XpertStudioToolsetMenuComponent } from '../toolset-menu/toolset.component'
import { I18nService } from '@cloud/app/@shared/i18n'
import { XpertWorkflowIconComponent } from '@cloud/app/@shared/workflow'

@Component({
  selector: 'xpert-studio-context-menu',
  exportAs: 'menuComponent',
  standalone: true,
  imports: [
    CommonModule,
    CdkMenuModule,
    TranslateModule,
    MatTabsModule,
    XpertStudioKnowledgeMenuComponent,
    XpertStudioToolsetMenuComponent,
    XpertInlineProfileComponent,
    XpertWorkflowIconComponent
  ],
  templateUrl: './context-menu.component.html',
  styleUrl: './context-menu.component.scss'
})
export class XpertStudioContextMenuComponent {
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly apiService = inject(XpertStudioApiService)
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
  readonly agents = computed(() => this.root.viewModel()?.nodes?.filter((n) => n.type === 'agent'))

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
    this.apiService.createAgent(this.root.contextMenuPosition, {
      title: (await this.#translate.instant('PAC.Workflow.Agent', { Default: 'Agent' })) + ' ' + (this.agents()?.length ?? 1)
    })
  }

  public addCollaborator(xpert: IXpert): void {
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
    } catch(err) {
      console.error(err)
      this.#toastr.error(this.#translate.instant('PAC.Xpert.UnableParseContent', { Default: 'Unable to parse content' }))
    }
  }

  async addWorkflowNote() {
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.NOTE,
      key: genXpertNoteKey(),
      title: await this.#translate.instant('PAC.Workflow.Note', { Default: 'Note' }),
    } as IWorkflowNode)
  }

  async addWorkflowRouter() {
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.IF_ELSE,
      key: genXpertRouterKey(),
      title: await this.#translate.instant('PAC.Workflow.Router', { Default: 'Router' }),
      cases: [
        {
          caseId: uuid(),
          conditions: []
        }
      ]
    } as IWFNIfElse)
  }

  async addWorkflowIterating() {
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.ITERATING,
      key: genXpertIteratingKey(),
      title: await this.#translate.instant('PAC.Workflow.Iterating', { Default: 'Iterating' })
    })
  }

  async addWorkflowAnswer() {
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.ANSWER,
      key: genXpertAnswerKey(),
      title: await this.#translate.instant('PAC.Workflow.Answer', { Default: 'Answer' })
    })
  }

  async addWorkflowKnowledgeRetrieval() {
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.KNOWLEDGE,
      key: genXpertKnowledgeKey(),
      title: await this.#translate.instant('PAC.Workflow.KnowledgeRetrieval', { Default: 'Knowledge Retrieval' }),
      queryVariable: `input`,
      knowledgebases: []
    } as IWFNKnowledgeRetrieval)
  }

  async addWorkflowCode() {
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.CODE,
      key: genXpertCodeKey(),
      title: await this.#translate.instant('PAC.Workflow.CodeExecution', { Default: 'Code Execution' }),
      language: 'javascript',
      code: `return {result: arg1 + arg2};`,
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
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.TEMPLATE,
      key: genXpertTemplateKey(),
      title: await this.#translate.instant('PAC.Workflow.Template', { Default: 'Template' }),
      code: `{{arg1}}`,
      inputParams: [
        {
          name: 'arg1',
          variable: ''
        }
      ]
    } as IWFNTemplate)
  }

  async addWorkflowHttp() {
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.HTTP,
      key: genXpertHttpKey(),
      method: 'get',
      title: await this.#translate.instant('PAC.Workflow.HTTPRequest', { Default: 'HTTP Request' })
    } as IWFNHttp)
  }

  async addWorkflowSubflow() {
    this.apiService.addBlock(this.root.contextMenuPosition, {
      type: WorkflowNodeTypeEnum.SUBFLOW,
      key: genXpertSubflowKey(),
      title: await this.#translate.instant('PAC.Workflow.Subflow', { Default: 'Subflow' })
    } as IWFNSubflow)
  }

  public dispose(): void {
    // this.selectionService.reset()
  }
}
