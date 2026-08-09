import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { StateVariableSelectComponent } from '@cloud/app/@shared/agent'
import {
  KnowledgeRecallParamsComponent,
  KnowledgeSelectReferenceComponent,
  XpertKnowledgeFilterFormComponent
} from '@cloud/app/@shared/knowledge'
import { TranslateModule } from '@ngx-translate/core'
import {
  injectToastr,
  IWFNKnowledgeRetrieval,
  IWorkflowNode,
  KBMetadataFieldDef,
  KnowledgeFilterNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertAPIService
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'
import { attrModel, linkedModel, ZardCheckboxComponent } from '@xpert-ai/headless-ui'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'

@Component({
  selector: 'xpert-workflow-knowledge',
  templateUrl: './knowledge.component.html',
  styleUrls: ['./knowledge.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ...ZardTooltipImports,
    TranslateModule,
    CdkMenuModule,
    ZardCheckboxComponent,
    StateVariableSelectComponent,
    KnowledgeRecallParamsComponent,
    XpertKnowledgeFilterFormComponent
  ],
  host: {
    tabindex: '-1'
  }
})
export class XpertWorkflowKnowledgeComponent extends XpertWorkflowBaseComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly xpertService = inject(XpertAPIService)
  readonly #dialog = inject(Dialog)
  readonly #toastr = injectToastr()

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly knowledgeRetrieval = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNKnowledgeRetrieval,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })

  readonly queryVariable = attrModel(this.knowledgeRetrieval, 'queryVariable')
  readonly knowledgebases = attrModel(this.knowledgeRetrieval, 'knowledgebases')
  readonly recall = attrModel(this.knowledgeRetrieval, 'recall')
  readonly retrieval = attrModel(this.knowledgeRetrieval, 'retrieval')
  readonly retrievalMode = attrModel(this.retrieval, 'mode', 'vector')
  readonly filtering = attrModel(this.retrieval, 'filtering')
  readonly fixedFilter = attrModel(this.filtering, 'fixed')
  readonly agentFiltering = attrModel(this.filtering, 'agent')
  readonly agentFilteringEnabled = attrModel(this.agentFiltering, 'enabled', false)

  readonly knowledgebaseList = toSignal(this.studioService.knowledgebases$)
  readonly selectedKnowledgebases = computed(() => {
    return (
      this.knowledgebases()?.map((id) => ({
        id,
        kb: this.knowledgebaseList()?.find((_) => _.id === id)
      })) ?? []
    )
  })

  readonly filterFields = computed<KBMetadataFieldDef[]>(() => {
    const schemas: KBMetadataFieldDef[][] = this.selectedKnowledgebases()
      .map(({ kb }) => kb)
      .map((knowledgebase) => knowledgebase?.metadataSchema || [])
    // 找出 schemas 之间的交集
    const schema: KBMetadataFieldDef[] = []
    if (schemas.length > 0) {
      const firstSchema = schemas[0]
      firstSchema.forEach((field) => {
        if (schemas.every((schemaFields) => schemaFields.some((candidate) => sameMetadataField(field, candidate)))) {
          schema.push(field)
        }
      })
    }
    return [
      ...SYSTEM_KNOWLEDGE_FILTER_FIELDS,
      ...schema.map((field) => ({
        ...field,
        scope: field.scope ?? 'document',
        key: `${field.scope === 'chunk' ? 'chunk.metadata' : 'metadata'}.${field.key}`
      }))
    ]
  })
  readonly fixedConditionCount = computed(() => countFilterConditions(this.fixedFilter()))

  filterFieldOperators(field: KBMetadataFieldDef) {
    return filterFieldOperators(field)
  }

  readonly showOutput = signal<boolean>(true)

  constructor() {
    super()
    effect(() => {
      if (this.key() && !this.retrieval()) {
        this.retrieval.set({ mode: 'vector', filtering: { agent: { enabled: false } } })
      }
    })
  }

  onFocus(event: Event) {}

  select() {
    this.#dialog
      .open<string[]>(KnowledgeSelectReferenceComponent, {
        data: {
          knowledgebases: this.knowledgebaseList(),
          selected: this.knowledgebases()
        }
      })
      .closed.subscribe((value) => {
        if (value) {
          this.knowledgebases.set(value)
        }
      })
  }

  remove(index: number) {
    this.knowledgebases.update((ids) => {
      ids.splice(index, 1)
      return [...ids]
    })
  }

  edit(id: string) {}

  toggleShowOutput() {
    this.showOutput.update((state) => !state)
  }
}

const SYSTEM_KNOWLEDGE_FILTER_FIELDS: KBMetadataFieldDef[] = [
  { key: 'document.fileName', type: 'string', scope: 'document', description: 'Document file name' },
  { key: 'document.folderPath', type: 'string', scope: 'document', description: 'Logical folder path' },
  { key: 'document.fileExtension', type: 'string', scope: 'document', description: 'Normalized extension' },
  { key: 'document.mimeType', type: 'string', scope: 'document', description: 'MIME type' },
  {
    key: 'document.category',
    type: 'enum',
    scope: 'document',
    enumValues: ['text', 'image', 'audio', 'video', 'sheet', 'other'],
    description: 'Document category'
  },
  {
    key: 'document.sourceType',
    type: 'enum',
    scope: 'document',
    enumValues: ['local-file', 'file-system', 'online-document', 'web-crawl', 'database', 'folder', 'file'],
    description: 'Document source type'
  },
  { key: 'document.createdAt', type: 'datetime', scope: 'document', description: 'Creation time in UTC' },
  { key: 'document.updatedAt', type: 'datetime', scope: 'document', description: 'Last update time in UTC' }
]

function countFilterConditions(node?: KnowledgeFilterNode): number {
  if (!node) return 0
  if (node.kind === 'condition') return 1
  return node.children.reduce((count, child) => count + countFilterConditions(child), 0)
}

function filterFieldOperators(field: KBMetadataFieldDef) {
  if (field.key === 'document.folderPath') return 'eq, neq, in, notIn, contains, startsWith, endsWith, under, exists'
  if (field.type === 'number' || field.type === 'datetime') return 'eq, neq, in, gt, gte, lt, lte, between, exists'
  if (field.type === 'boolean') return 'eq, neq, exists'
  if (field.type === 'string[]' || field.type === 'number[]')
    return 'contains, containsAny, containsAll, isEmpty, exists'
  if (field.type === 'object') return 'jsonContains, exists'
  if (field.type === 'enum') return 'eq, neq, in, notIn, exists'
  return 'eq, neq, in, notIn, contains, notContains, startsWith, endsWith, exists'
}

function sameMetadataField(left: KBMetadataFieldDef, right: KBMetadataFieldDef) {
  return (
    left.key === right.key &&
    left.type === right.type &&
    (left.scope ?? 'document') === (right.scope ?? 'document') &&
    JSON.stringify(left.enumValues ?? []) === JSON.stringify(right.enumValues ?? [])
  )
}
