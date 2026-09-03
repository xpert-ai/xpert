import { Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { OverlayModule } from '@angular/cdk/overlay'
import { RouterModule } from '@angular/router'
import {
  KnowledgeChunkComponent,
  KnowledgeRetrievalSettingsComponent,
  XpertKnowledgeFilterFormComponent
} from '@cloud/app/@shared/knowledge'
import { DocumentInterface } from '@langchain/core/documents'
import { XpCommonModule } from '@xpert-ai/headless-ui'
import { myRxResource } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  DateRelativePipe,
  DocumentTypeEnum,
  DocumentMetadata,
  GraphRagRetrievalMode,
  IKnowledgeRetrievalLog,
  KBMetadataFieldDef,
  KnowledgeFilterDiagnostics,
  KnowledgeFilterNode,
  KnowledgeDocumentService,
  KnowledgebaseService,
  OrderTypeEnum,
  TKBRetrievalSettings,
  ToastrService,
  getErrorMessage,
  injectHelpWebsite,
  routeAnimations
} from '../../../../../@core'
import { KnowledgebaseComponent } from '../knowledgebase.component'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'xp-knowledgebase-test',
  templateUrl: './test.component.html',
  styleUrls: ['./test.component.scss'],
  imports: [
    RouterModule,
    FormsModule,
    TranslateModule,
    OverlayModule,
    ...ZardTooltipImports,
    XpCommonModule,
    DateRelativePipe,
    KnowledgeChunkComponent,
    KnowledgeRetrievalSettingsComponent,
    XpertKnowledgeFilterFormComponent
  ],
  animations: [routeAnimations]
})
export class KnowledgeTestComponent {
  eAiModelTypeEnum = AiModelTypeEnum

  readonly knowledgebaseAPI = inject(KnowledgebaseService)
  readonly knowledgeDocumentAPI = inject(KnowledgeDocumentService)
  readonly _toastrService = inject(ToastrService)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly helpUrl = injectHelpWebsite('/docs/ai/knowledge/retrieval')

  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase

  readonly recall = computed(() => this.knowledgebase()?.recall)
  readonly score = computed(() => this.recall()?.score)
  readonly topK = computed(() => this.recall()?.topK)
  readonly retrievalModes: GraphRagRetrievalMode[] = ['vector', 'graph', 'hybrid']
  readonly retrievalMode = model<GraphRagRetrievalMode>('vector')
  readonly retrievalSettingsOpen = signal(false)
  readonly retrievalSettings = computed<TKBRetrievalSettings>(() => {
    const graphRag = this.knowledgebase()?.graphRag
    return {
      mode: this.retrievalMode(),
      entityTopK: graphRag?.entityTopK,
      neighborHops: graphRag?.neighborHops,
      graphWeight: graphRag?.graphWeight,
      communityTopK: graphRag?.communityTopK
    }
  })

  readonly query = model<string>('')
  readonly requestFilter = model<KnowledgeFilterNode>()
  readonly filterFields = computed<KBMetadataFieldDef[]>(() => [
    ...SYSTEM_KNOWLEDGE_FILTER_FIELDS,
    ...(this.knowledgebase()?.metadataSchema ?? []).map((field) => ({
      ...field,
      scope: field.scope ?? 'document',
      key: `${field.scope === 'chunk' ? 'chunk.metadata' : 'metadata'}.${field.key}`
    }))
  ])
  readonly results = signal<DocumentInterface<DocumentMetadata>[]>(null)
  readonly diagnostics = signal<KnowledgeFilterDiagnostics[]>([])
  readonly diagnosticsText = computed(() => JSON.stringify(this.diagnostics(), null, 2))
  readonly error = signal<string>(null)

  readonly #folders = myRxResource({
    request: () => ({ knowledgebaseId: this.knowledgebase()?.id }),
    loader: ({ request }) =>
      request.knowledgebaseId
        ? this.knowledgeDocumentAPI.getAll({
            select: ['id', 'name', 'folder', 'sourceType'],
            where: {
              knowledgebaseId: request.knowledgebaseId,
              sourceType: DocumentTypeEnum.FOLDER
            },
            take: 1000
          })
        : null
  })
  readonly folderOptions = computed(() =>
    (this.#folders.value()?.items ?? [])
      .map((folder) => [folder.folder, folder.name].filter(Boolean).join('/'))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right))
      .map((folder) => ({ label: folder, value: folder }))
  )

  readonly #loading = signal<boolean>(false)

  readonly #logs = myRxResource({
    request: () => ({
      id: this.knowledgebase()?.id,
      params: {
        order: {
          createdAt: OrderTypeEnum.DESC
        },
        skip: 0,
        take: 20
      }
    }),
    loader: ({ request }) => {
      return request.id ? this.knowledgebaseAPI.getLogs(request.id, request.params) : null
    }
  })
  readonly logs = computed(() => this.#logs.value()?.items)

  readonly loading = computed(() => this.#loading() || this.#logs.status() === 'loading')

  test() {
    this.#loading.set(true)
    this.error.set(null)
    this.knowledgebaseAPI
      .test(this.knowledgebase().id, {
        query: this.query(),
        k: this.topK() ?? 10,
        score: this.score(),
        filters: this.requestFilter() ? { request: this.requestFilter() } : undefined,
        retrieval: this.retrievalSettings()
      })
      .subscribe({
        next: (result) => {
          this.results.set(result.documents)
          this.diagnostics.set(result.diagnostics)
          this.#loading.set(false)
        },
        error: (err) => {
          this.results.set(null)
          this.error.set(getErrorMessage(err))
          this.#loading.set(false)
        },
        complete: () => {
          this.#logs.reload()
        }
      })
  }

  selectLog(log: IKnowledgeRetrievalLog) {
    this.query.set(log.query)
    this.results.set(null)
  }

  toggleRetrievalSettings() {
    this.retrievalSettingsOpen.update((open) => !open)
  }

  onRetrievalSettingsOverlayKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      this.onClose(false)
    }
  }

  onClose(reload?: boolean | void) {
    this.retrievalSettingsOpen.set(false)
    if (reload) {
      this.knowledgebaseComponent.refresh()
    }
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
