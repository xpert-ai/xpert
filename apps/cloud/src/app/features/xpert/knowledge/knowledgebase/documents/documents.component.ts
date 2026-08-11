import { animate, state, style, transition, trigger } from '@angular/animations'
import { SelectionModel } from '@angular/cdk/collections'
import { CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu'
import { NgTemplateOutlet } from '@angular/common'
import { afterNextRender, Component, computed, effect, inject, model, signal, TemplateRef } from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { I18nService } from '@cloud/app/@shared/i18n'
import {
  debouncedSignal,
  injectConfirmDelete,
  injectConfirmUnique,
  linkedModel,
  XpCommonModule,
  XpI18nPipe,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardIconComponent,
  ZardInputDirective,
  ZardInputGroupComponent,
  ZardSwitchComponent,
  ZardStepperImports,
  ZardTableImports,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { format } from 'date-fns/format'
import { formatRelative } from 'date-fns/formatRelative'
import { get } from 'lodash-es'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  debounceTime,
  EMPTY,
  filter,
  finalize,
  firstValueFrom,
  forkJoin,
  map,
  merge,
  Observable,
  of as observableOf,
  startWith,
  Subject,
  switchMap,
  take
} from 'rxjs'
import {
  getDateLocale,
  getErrorMessage,
  IKnowledgeDocument,
  injectHelpWebsite,
  injectToastr,
  IXpert,
  KBDocumentStatusEnum,
  KBMetadataFieldDef,
  MetadataFieldType,
  KDocumentSourceType,
  KnowledgebaseService,
  KnowledgeGraphIndexJobStatus,
  KnowledgeGraphStatus,
  KnowledgeGraphStatusResponse,
  KnowledgebaseStatusEnum,
  KnowledgebaseTypeEnum,
  KnowledgeDocumentService,
  OrderTypeEnum,
  STANDARD_METADATA_FIELDS,
  ToastrService
} from '../../../../../@core'
import { KnowledgeDocIdComponent, KnowledgeTaskComponent } from '../../../../../@shared/knowledge'
import { openWorkbenchFilePreviewDialog } from '../../../../assistant/workbench-file-preview-dialog.component'
import { KnowledgebaseComponent } from '../knowledgebase.component'
import { KnowledgeDocumentCoverPreviewComponent } from './document-cover-preview.component'
import { validateOriginalFileResponse } from './original-file-preview'

const REFRESH_DEBOUNCE_TIME = 5000
const SELECT_COLUMN_WIDTH = 48
const ACTIONS_COLUMN_WIDTH = 88
// Bump the layout version when changing defaults so previously saved layouts receive
// the product default while users can still opt back into the Type column.
const DOCUMENT_COLUMNS_STORAGE_KEY = 'xpert.knowledge.documents.table.columns.v3'

type DocumentTableColumnKey =
  | 'name'
  | 'type'
  | 'contents'
  | 'createdAtRelative'
  | 'disabled'
  | 'processMsg'
  | 'progress'
type DocumentTableSortDirection = 'asc' | 'desc' | ''
type DocumentStatusFilter = 'all' | 'errors' | 'processing'
type DocumentProcessStage = 'transform' | 'split' | 'index'
type DocumentProcessStageState = 'complete' | 'active' | 'error' | 'pending'
const DOCUMENT_PROCESS_STAGES: DocumentProcessStage[] = ['transform', 'split', 'index']
const DOCUMENT_PROCESS_STAGE_DEFAULT_LABELS: Record<DocumentProcessStageState, string> = {
  complete: 'Complete',
  active: 'Processing',
  error: 'Failed',
  pending: 'Pending'
}
type ActiveDocumentTableSortState = DocumentTableSortState & {
  active: DocumentTableColumnKey
  direction: Exclude<DocumentTableSortDirection, ''>
}

interface DocumentTableColumn {
  key: DocumentTableColumnKey
  labelKey: string
  defaultLabel: string
  width: number
  minWidth: number
  maxWidth?: number
  visible: boolean
  hideable: boolean
  sortable: boolean
  resizable: boolean
}

interface DocumentTableSortState {
  active: DocumentTableColumnKey | null
  direction: DocumentTableSortDirection
}

interface FolderChildCount {
  documentCount: number
  folderCount: number
}

interface FolderBrowserNode {
  document: IKnowledgeDocument
  children: FolderBrowserNode[]
}

interface MoveFolderOption {
  id: string
  name: string
  path: string
  depth: number
}

const DEFAULT_DOCUMENT_COLUMNS: DocumentTableColumn[] = [
  {
    key: 'name',
    labelKey: 'XP.KEY_WORDS.Name',
    defaultLabel: 'Name',
    width: 300,
    minWidth: 180,
    visible: true,
    hideable: false,
    sortable: true,
    resizable: true
  },
  {
    key: 'type',
    labelKey: 'XP.KEY_WORDS.Type',
    defaultLabel: 'Type',
    width: 96,
    minWidth: 80,
    visible: false,
    hideable: true,
    sortable: true,
    resizable: true
  },
  {
    key: 'contents',
    labelKey: 'XP.Knowledgebase.FolderContents',
    defaultLabel: 'Contents',
    width: 164,
    minWidth: 148,
    visible: true,
    hideable: true,
    sortable: false,
    resizable: true
  },
  {
    key: 'createdAtRelative',
    labelKey: 'XP.KEY_WORDS.Created At',
    defaultLabel: 'Created At',
    width: 148,
    minWidth: 128,
    visible: true,
    hideable: true,
    sortable: true,
    resizable: true
  },
  {
    key: 'disabled',
    labelKey: 'XP.KEY_WORDS.Enabled',
    defaultLabel: 'Enabled',
    width: 88,
    minWidth: 76,
    visible: false,
    hideable: true,
    sortable: true,
    resizable: true
  },
  {
    key: 'processMsg',
    labelKey: 'XP.KEY_WORDS.Message',
    defaultLabel: 'Message',
    width: 220,
    minWidth: 160,
    visible: false,
    hideable: true,
    sortable: true,
    resizable: true
  },
  {
    key: 'progress',
    labelKey: 'XP.Knowledgebase.ParsingProgress',
    defaultLabel: 'Parsing Progress',
    width: 116,
    minWidth: 104,
    visible: true,
    hideable: true,
    sortable: true,
    resizable: true
  }
]

const SORT_VALUE_BY_COLUMN: Record<DocumentTableColumnKey, (document: IKnowledgeDocument) => unknown> = {
  name: (document) => document.name,
  type: (document) => document.type,
  contents: () => '',
  createdAtRelative: (document) => document.updatedAt ?? document.createdAt,
  disabled: (document) => (document.disabled ? 0 : 1),
  processMsg: (document) => document.processMsg,
  progress: (document) => document.progress
}

@Component({
  standalone: true,
  selector: 'xp-knowledgebase-documents',
  templateUrl: './documents.component.html',
  styleUrls: ['./documents.component.scss'],
  imports: [
    RouterModule,
    FormsModule,
    NgTemplateOutlet,
    TranslateModule,
    CdkMenuModule,
    ...ZardTooltipImports,
    ...ZardTableImports,
    ...ZardStepperImports,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardIconComponent,
    ZardInputDirective,
    ZardInputGroupComponent,
    ZardSwitchComponent,
    XpCommonModule,
    KnowledgeDocIdComponent,
    XpI18nPipe,
    KnowledgeDocumentCoverPreviewComponent
  ],
  animations: [
    trigger('detailExpand', [
      state('collapsed,void', style({ height: '0px', minHeight: '0' })),
      state('expanded', style({ height: '*' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)'))
    ])
  ]
})
export class KnowledgeDocumentsComponent {
  eKDocumentSourceType = KDocumentSourceType
  eKBDocumentStatusEnum = KBDocumentStatusEnum
  eKnowledgeGraphIndexJobStatus = KnowledgeGraphIndexJobStatus
  eKnowledgeGraphStatus = KnowledgeGraphStatus
  eKnowledgebaseStatusEnum = KnowledgebaseStatusEnum
  STANDARD_METADATA_FIELDS = STANDARD_METADATA_FIELDS
  readonly METADATA_FIELD_TYPES: MetadataFieldType[] = [
    'string',
    'number',
    'boolean',
    'enum',
    'datetime',
    'string[]',
    'number[]',
    'object'
  ]

  readonly kbAPI = inject(KnowledgebaseService)
  readonly knowledgeDocumentAPI = inject(KnowledgeDocumentService)
  readonly _toastrService = inject(ToastrService)
  readonly _dialog = inject(Dialog)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly confirmDelete = injectConfirmDelete()
  readonly confirmUnique = injectConfirmUnique()
  readonly #toastr = injectToastr()
  readonly #translate = inject(I18nService)
  readonly parentId = injectQueryParams('parentId')
  readonly helpUrl = injectHelpWebsite('/docs/ai/knowledge/knowledgebase')

  // readonly pageSize = model(20)
  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase
  readonly knowledgebase$ = toObservable(this.knowledgebase)
  readonly vectorRebuildStatus = computed(() => this.knowledgebase()?.status)
  readonly vectorMutationLocked = computed(() => this.vectorRebuildStatus() === KnowledgebaseStatusEnum.REBUILDING)
  readonly xperts = computed(() => this.knowledgebase()?.xperts)
  readonly parentId$ = toObservable(this.parentId)
  readonly pipelineId = computed(() => this.knowledgebase()?.pipelineId)
  readonly pipeline = this.knowledgebaseComponent.pipeline
  readonly hasPipeline = computed(() => !!this.pipeline()?.publishAt)

  readonly refresh$ = new BehaviorSubject<boolean>(true)
  readonly documentDelayRefresh$ = new Subject<void>()
  readonly knowledgebaseDelayRefresh$ = new Subject<void>()

  readonly selectColumnWidth = SELECT_COLUMN_WIDTH
  readonly actionsColumnWidth = ACTIONS_COLUMN_WIDTH
  // One table-column model drives width, visibility, order, and sort affordances.
  readonly tableColumns = signal<DocumentTableColumn[]>(createDefaultDocumentColumns())
  readonly visibleDocumentColumns = computed(() => this.tableColumns().filter((column) => column.visible))
  readonly sortState = signal<DocumentTableSortState>({ active: null, direction: '' })
  readonly tableMinWidth = computed(
    () =>
      SELECT_COLUMN_WIDTH +
      ACTIONS_COLUMN_WIDTH +
      this.visibleDocumentColumns().reduce((width, column) => width + column.width, 0)
  )
  expandedElement: any | null

  readonly isLoading = signal(false)
  readonly viewingOriginalFileIds = signal<Set<string>>(new Set())
  readonly downloadingOriginalFileIds = signal<Set<string>>(new Set())
  readonly downloadingSelectedOriginalFiles = signal(false)
  readonly movingSelectedDocuments = signal(false)
  readonly moveFolderLoading = signal(false)
  readonly moveFolderSearch = signal('')
  readonly moveTargetFolderId = signal<string | null>(null)
  readonly moveFolderOptions = signal<MoveFolderOption[]>([])
  readonly filteredMoveFolderOptions = computed(() => {
    const search = this.moveFolderSearch().trim().toLocaleLowerCase()
    return search
      ? this.moveFolderOptions().filter((folder) => folder.path.toLocaleLowerCase().includes(search))
      : this.moveFolderOptions()
  })
  readonly moveDestinationChanged = computed(() => (this.moveTargetFolderId() ?? null) !== (this.parentId() ?? null))
  readonly folderChildCounts = signal<Record<string, FolderChildCount>>({})
  readonly folderBrowserRootId = signal<string | null>(null)
  readonly folderBrowserItems = signal<IKnowledgeDocument[]>([])
  readonly folderBrowserLoading = signal(false)
  readonly folderBrowserExpandedIds = signal<Set<string>>(new Set())
  readonly folderBrowserLoadedIds = signal<Set<string>>(new Set())
  readonly folderBrowserLoadingIds = signal<Set<string>>(new Set())
  readonly folderBrowserNodes = computed(() =>
    buildFolderBrowserTree(this.folderBrowserItems(), this.folderBrowserRootId())
  )
  #moveDialogRef: DialogRef<unknown, unknown> | null = null
  isRateLimitReached = false
  readonly #data = signal<IKnowledgeDocument[]>([])
  readonly graphJobs = signal<KnowledgeGraphStatusResponse['jobs']>([])
  readonly graphJobByDocumentId = computed(() => {
    const byDocumentId = new Map<string, NonNullable<KnowledgeGraphStatusResponse['jobs']>[number]>()
    for (const job of this.graphJobs() ?? []) {
      if (typeof job.documentId === 'string' && job.documentId) {
        byDocumentId.set(job.documentId, job)
      }
    }
    return byDocumentId
  })
  readonly total = signal<number>(0)
  readonly selectionModel = new SelectionModel<string>(true, [])
  readonly search = model<string>()
  readonly searchTerm = debouncedSignal(this.search, 300)
  readonly statusFilter = signal<DocumentStatusFilter>('all')
  readonly selectedDocumentId = signal<string | null>(null)
  readonly documentInspectorDismissed = signal(false)
  readonly folderBrowserSelectedDocument = signal<IKnowledgeDocument | null>(null)
  readonly selectedDocument = computed(() => {
    if (this.documentInspectorDismissed()) {
      return null
    }
    const selectedDocumentId = this.selectedDocumentId()
    const browserDocument = this.folderBrowserSelectedDocument()
    return (
      this.#data().find((document) => document.id === selectedDocumentId) ??
      (browserDocument?.id === selectedDocumentId ? browserDocument : null)
    )
  })
  /** Reuses the protected range-enabled endpoint so the inspector renders page one without downloading a whole PDF. */
  readonly selectedPdfPreviewSource = computed(() => {
    const document = this.selectedDocument()
    return document && this.canInlinePreview(document)
      ? this.knowledgeDocumentAPI.originalFilePreviewSource(document.id)
      : null
  })
  readonly notFolderItems = computed(() =>
    this.#data().filter((item) => item.sourceType !== KDocumentSourceType.FOLDER)
  )
  readonly errorCount = computed(
    () => this.notFolderItems().filter((document) => document.status === KBDocumentStatusEnum.ERROR).length
  )
  readonly processingCount = computed(
    () => this.notFolderItems().filter((document) => isDocumentProcessing(document.status)).length
  )
  readonly filteredData = computed(() => {
    const filterValue = this.searchTerm()?.toLowerCase() ?? ''
    const statusFilter = this.statusFilter()
    const rows = this.#data().filter(
      (item) =>
        item.name?.toLowerCase().includes(filterValue) &&
        (statusFilter === 'all' ||
          (statusFilter === 'errors' && item.status === KBDocumentStatusEnum.ERROR) ||
          (statusFilter === 'processing' && isDocumentProcessing(item.status)))
    )
    const sortState = this.sortState()
    if (!sortState.active || !sortState.direction) {
      return rows
    }

    return [...rows].sort((a, b) => compareDocumentSortValues(a, b, sortState as ActiveDocumentTableSortState))
  })

  // Folders
  readonly parentFolder = toSignal(
    this.parentId$.pipe(
      switchMap((parentId) =>
        parentId ? this.knowledgeDocumentAPI.getById(parentId, { relations: ['parent'] }) : observableOf(null)
      )
    )
  )
  readonly grandParent = computed(() => this.parentFolder()?.parent ?? null)

  // Metadata
  readonly metadataSchema = linkedModel({
    initialValue: null,
    compute: () => this.knowledgebaseComponent.knowledgebase()?.metadataSchema,
    update: () => {
      //
    }
  })

  constructor() {
    this.tableColumns.set(loadDocumentColumns())
    effect(() => saveDocumentColumns(this.tableColumns()))

    effect(() => {
      if (this.knowledgebase()?.type === KnowledgebaseTypeEnum.External) {
        this.#router.navigate(['../test'], { relativeTo: this.#route })
      }
    })

    afterNextRender(() => {
      merge(this.knowledgebase$, this.parentId$, this.refresh$)
        .pipe(
          startWith({}),
          debounceTime(100),
          filter(() => !!this.knowledgebase()),
          switchMap(() => {
            this.isLoading.set(true)
            // const order = this.sort().active
            //   ? { [this.sort().active]: this.sort().direction.toUpperCase() }
            //   : { createdAt: OrderTypeEnum.DESC }
            const where = {
              knowledgebaseId: this.knowledgebase().id,
              parent: this.parentId() ? ({ id: this.parentId() } as IKnowledgeDocument) : { $isNull: true }
            }
            return this.knowledgeDocumentAPI
              .getAll({
                select: [
                  'id',
                  'name',
                  'status',
                  'disabled',
                  'sourceType',
                  'type',
                  'category',
                  'filePath',
                  'createdAt',
                  'updatedAt',
                  'processMsg',
                  'progress',
                  'size',
                  'mimeType',
                  'tokenNum',
                  'chunkNum',
                  'processBeginAt',
                  'processDuation',
                  'processDuration',
                  'sourceConfig',
                  'folder',
                  'version',
                  'metadata'
                ],
                where,
                relations: ['storageFile'],
                order: {
                  updatedAt: OrderTypeEnum.DESC
                }
              })
              .pipe(catchError(() => observableOf(null)))
          }),
          map((data) => {
            // Flip flag to show that loading has finished.
            this.isLoading.set(false)
            this.isRateLimitReached = data === null

            if (data === null) {
              return []
            }

            // Only refresh the result length if there is new data. In case of rate
            // limit errors, we do not want to reset the paginator to zero, as that
            // would prevent users from re-triggering requests.
            this.total.set(data.total)
            return data.items
          })
        )
        .subscribe((data) => {
          const documents = data.map(
            (item) =>
              ({
                ...item,
                createdAtRelative: formatRelative(new Date(item.updatedAt), new Date(), {
                  locale: getDateLocale(this.#translate.currentLanguage)
                }),
                parserConfig: item.parserConfig ?? {}
              }) as IKnowledgeDocument
          )
          this.#data.set(documents)
          this.refreshFolderChildCounts(documents)
          if (
            !this.documentInspectorDismissed() &&
            !documents.some((document) => document.id === this.selectedDocumentId()) &&
            this.folderBrowserSelectedDocument()?.id !== this.selectedDocumentId()
          ) {
            this.selectedDocumentId.set(
              documents.find((document) => document.status === KBDocumentStatusEnum.ERROR)?.id ??
                documents[0]?.id ??
                null
            )
          }
          const selectedDocument = documents.find((document) => document.id === this.selectedDocumentId())
          if (selectedDocument?.sourceType === KDocumentSourceType.FOLDER) {
            void this.loadFolderBrowser(selectedDocument)
          } else {
            this.resetFolderBrowser()
          }
          this.refreshGraphJobs()
        })
    })

    effect(() => {
      if (
        this.#data()?.some((item) =>
          [
            KBDocumentStatusEnum.WAITING,
            KBDocumentStatusEnum.RUNNING,
            KBDocumentStatusEnum.TRANSFORMED,
            KBDocumentStatusEnum.SPLITTED,
            KBDocumentStatusEnum.UNDERSTOOD,
            KBDocumentStatusEnum.EMBEDDING
          ].includes(item.status)
        )
      ) {
        this.documentDelayRefresh$.next()
      }
    })

    effect(() => {
      if (this.knowledgebase()?.graphStatus === KnowledgeGraphStatus.INDEXING) {
        this.knowledgebaseDelayRefresh$.next()
      }
    })

    effect(() => {
      if (this.vectorMutationLocked()) {
        this.knowledgebaseDelayRefresh$.next()
      }
    })

    this.documentDelayRefresh$.pipe(takeUntilDestroyed(), debounceTime(REFRESH_DEBOUNCE_TIME)).subscribe(() => {
      this.refresh()
    })

    this.knowledgebaseDelayRefresh$.pipe(takeUntilDestroyed(), debounceTime(REFRESH_DEBOUNCE_TIME)).subscribe(() => {
      // Knowledgebase-level polling is only needed for aggregate states such as GraphRAG indexing
      // and vector rebuild locks; normal document parsing can refresh the document list alone.
      this.knowledgebaseComponent.refresh()
      this.refreshGraphJobs()
    })
  }

  selectDocument(document: IKnowledgeDocument) {
    this.documentInspectorDismissed.set(false)
    this.folderBrowserSelectedDocument.set(null)
    this.selectedDocumentId.set(document.id)
    if (document.sourceType === KDocumentSourceType.FOLDER) {
      void this.loadFolderBrowser(document)
    } else {
      this.resetFolderBrowser()
    }
  }

  closeDocumentInspector() {
    this.documentInspectorDismissed.set(true)
    this.folderBrowserSelectedDocument.set(null)
    this.selectedDocumentId.set(null)
    this.resetFolderBrowser()
  }

  setStatusFilter(filter: DocumentStatusFilter) {
    this.statusFilter.set(filter)
  }

  isStatusFilterActive(filter: DocumentStatusFilter) {
    return this.statusFilter() === filter
  }

  folderChildCount(documentId: string) {
    return this.folderChildCounts()[documentId] ?? { documentCount: 0, folderCount: 0 }
  }

  folderBrowserPath(document: IKnowledgeDocument) {
    return normalizeMoveFolderPath([document.folder, document.name].filter(Boolean).join('/')) || document.name
  }

  isFolderBrowserExpanded(documentId: string) {
    return this.folderBrowserExpandedIds().has(documentId)
  }

  isFolderBrowserNodeLoading(documentId: string) {
    return this.folderBrowserLoadingIds().has(documentId)
  }

  async toggleFolderBrowserNode(document: IKnowledgeDocument) {
    if (document.sourceType !== KDocumentSourceType.FOLDER) {
      await this.selectFolderBrowserDocument(document)
      return
    }

    if (this.folderBrowserExpandedIds().has(document.id)) {
      this.folderBrowserExpandedIds.update((ids) => withoutSetValue(ids, document.id))
      return
    }

    this.folderBrowserExpandedIds.update((ids) => withSetValue(ids, document.id))
    if (this.folderBrowserLoadedIds().has(document.id)) {
      return
    }

    this.folderBrowserLoadingIds.update((ids) => withSetValue(ids, document.id))
    try {
      const children = await this.getFolderBrowserChildren(document.id)
      if (!this.folderBrowserRootId()) {
        return
      }
      this.folderBrowserItems.update((items) => mergeFolderBrowserItems(items, children))
      this.folderBrowserLoadedIds.update((ids) => withSetValue(ids, document.id))
    } catch (err) {
      this.#toastr.error(getErrorMessage(err))
      this.folderBrowserExpandedIds.update((ids) => withoutSetValue(ids, document.id))
    } finally {
      this.folderBrowserLoadingIds.update((ids) => withoutSetValue(ids, document.id))
    }
  }

  openFolder(document: IKnowledgeDocument) {
    this.#router.navigate(['.'], { relativeTo: this.#route, queryParams: { parentId: document.id } })
  }

  uploadIntoFolder(document: IKnowledgeDocument) {
    if (this.vectorMutationLocked()) {
      return
    }
    this.#router.navigate(['create'], { relativeTo: this.#route, queryParams: { parentId: document.id } })
  }

  private async selectFolderBrowserDocument(document: IKnowledgeDocument) {
    this.documentInspectorDismissed.set(false)
    this.folderBrowserSelectedDocument.set(document)
    this.selectedDocumentId.set(document.id)
    try {
      const completeDocument = await firstValueFrom(
        this.knowledgeDocumentAPI.getById(document.id, { relations: ['parent', 'storageFile'] }).pipe(take(1))
      )
      if (this.selectedDocumentId() === document.id) {
        this.folderBrowserSelectedDocument.set(completeDocument)
      }
    } catch (err) {
      this.#toastr.error(getErrorMessage(err))
    }
  }

  private async loadFolderBrowser(folder: IKnowledgeDocument) {
    const rootId = folder.id
    this.folderBrowserRootId.set(rootId)
    this.folderBrowserItems.set([])
    this.folderBrowserExpandedIds.set(new Set())
    this.folderBrowserLoadedIds.set(new Set([rootId]))
    this.folderBrowserLoadingIds.set(new Set())
    this.folderBrowserLoading.set(true)
    try {
      const children = await this.getFolderBrowserChildren(rootId)
      if (this.folderBrowserRootId() === rootId) {
        this.folderBrowserItems.set(children)
      }
    } catch (err) {
      if (this.folderBrowserRootId() === rootId) {
        this.folderBrowserItems.set([])
        this.#toastr.error(getErrorMessage(err))
      }
    } finally {
      if (this.folderBrowserRootId() === rootId) {
        this.folderBrowserLoading.set(false)
      }
    }
  }

  private async getFolderBrowserChildren(parentId: string) {
    const knowledgebaseId = this.knowledgebase()?.id
    if (!knowledgebaseId) {
      return []
    }

    const { items } = await firstValueFrom(
      this.knowledgeDocumentAPI
        .getAll({
          select: ['id', 'name', 'sourceType', 'type', 'status', 'folder', 'updatedAt', 'version'],
          where: {
            knowledgebaseId,
            parent: { id: parentId } as IKnowledgeDocument
          },
          relations: ['parent'],
          order: { name: OrderTypeEnum.ASC }
        })
        .pipe(take(1))
    )
    return items
  }

  private resetFolderBrowser() {
    this.folderBrowserRootId.set(null)
    this.folderBrowserItems.set([])
    this.folderBrowserLoading.set(false)
    this.folderBrowserExpandedIds.set(new Set())
    this.folderBrowserLoadedIds.set(new Set())
    this.folderBrowserLoadingIds.set(new Set())
  }

  private refreshFolderChildCounts(documents: IKnowledgeDocument[]) {
    const knowledgebaseId = this.knowledgebase()?.id
    const folderIds = documents
      .filter((document) => document.sourceType === KDocumentSourceType.FOLDER)
      .map((document) => document.id)
    this.folderChildCounts.set({})
    if (!knowledgebaseId || !folderIds.length) {
      return
    }

    const requestedFolderIds = new Set(folderIds)
    this.knowledgeDocumentAPI
      .getFolderChildCounts(knowledgebaseId, folderIds)
      .pipe(take(1))
      .subscribe({
        next: (counts) => {
          // Ignore a response from a folder that is no longer visible after navigation or refresh.
          const currentFolderIds = new Set(
            this.#data()
              .filter((document) => document.sourceType === KDocumentSourceType.FOLDER)
              .map((document) => document.id)
          )
          if (
            requestedFolderIds.size !== currentFolderIds.size ||
            [...requestedFolderIds].some((folderId) => !currentFolderIds.has(folderId))
          ) {
            return
          }
          this.folderChildCounts.set(
            Object.fromEntries(
              counts.map((count) => [
                count.folderId,
                { documentCount: count.documentCount, folderCount: count.folderCount }
              ])
            )
          )
        },
        error: () => this.folderChildCounts.set({})
      })
  }

  documentStatusLabelKey(status?: KBDocumentStatusEnum) {
    return `XP.Knowledgebase.Status_${documentStatusSuffix(status)}`
  }

  documentStatusDefaultLabel(status?: KBDocumentStatusEnum) {
    return documentStatusDefaultLabel(status)
  }

  isProcessing(status?: KBDocumentStatusEnum) {
    return isDocumentProcessing(status)
  }

  selectedDocumentProvider(document: IKnowledgeDocument) {
    const metadata = document.metadata
    const analysis = metadata?.documentAnalysis
    const snapshot = metadata?.analysisSnapshot
    const transformer = metadata?.transformSnapshot?.transformer
    const provider = [
      analysis?.provider ?? snapshot?.provider ?? transformer?.provider,
      analysis?.engine ?? snapshot?.engine
    ]
      .filter(Boolean)
      .join(' · ')

    if (provider) {
      return provider
    }

    if (document.processMsg?.includes('PaddleOCR')) {
      return 'Baidu Cloud · PaddleOCR-VL'
    }
    if (document.processMsg?.includes('Unlimited-OCR')) {
      return 'Baidu Cloud · Unlimited-OCR'
    }
    return ''
  }

  selectedDocumentSize(document: IKnowledgeDocument) {
    const size = document.storageFile?.size ?? document.size ?? document.metadata?.originalFileSize
    return formatDocumentSize(size)
  }

  selectedDocumentMimeType(document: IKnowledgeDocument) {
    return document.storageFile?.mimetype || document.mimeType || '-'
  }

  selectedDocumentPageCount(document: IKnowledgeDocument) {
    return document.metadata?.analysisSnapshot?.pageCount ?? document.metadata?.documentAnalysis?.pageCount ?? null
  }

  selectedDocumentChunkCount(document: IKnowledgeDocument) {
    return document.chunkNum ?? document.metadata?.segmentCount ?? null
  }

  selectedDocumentTokenCount(document: IKnowledgeDocument) {
    return document.tokenNum ?? document.metadata?.tokens ?? null
  }

  selectedDocumentProcessDuration(document: IKnowledgeDocument) {
    const duration = document.processDuration ?? document.processDuation
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) {
      return '-'
    }

    if (duration < 1000) {
      return `${Math.round(duration)} ms`
    }
    if (duration < 60_000) {
      return `${(duration / 1000).toFixed(1)} s`
    }
    return `${Math.floor(duration / 60_000)}m ${Math.round((duration % 60_000) / 1000)}s`
  }

  selectedDocumentCreatedAt(document: IKnowledgeDocument) {
    if (!document.createdAt) {
      return '-'
    }

    return formatRelative(new Date(document.createdAt), new Date(), {
      locale: getDateLocale(this.#translate.currentLanguage)
    })
  }

  selectedDocumentCreatedTimestamp(document: IKnowledgeDocument) {
    return formatDocumentTimestamp(document.createdAt)
  }

  selectedDocumentLastRun(document: IKnowledgeDocument) {
    return formatDocumentTimestamp(document.processBeginAt ?? document.updatedAt)
  }

  selectedDocumentFailureReason(document: IKnowledgeDocument) {
    const message = document.processMsg?.trim()
    if (!message) {
      return '-'
    }

    const pageRange = message.match(/source pages\s+(\d+)\s*[-–]\s*(\d+)/i)
    if (pageRange && /quota exceed/i.test(message)) {
      return this.#translate.translate('XP.Knowledgebase.PageRangeQuotaExceeded', {
        Default: `Pages ${pageRange[1]}–${pageRange[2]}: quota exceeded`,
        start: pageRange[1],
        end: pageRange[2]
      })
    }

    return message
  }

  selectedDocumentLanguage(document: IKnowledgeDocument) {
    const metadata = document.metadata as Record<string, any> | undefined
    const language = metadata?.['language'] ?? metadata?.['documentAnalysis']?.language
    if (Array.isArray(language)) {
      return language.filter(Boolean).join(', ') || '-'
    }
    return typeof language === 'string' && language.trim() ? language : '-'
  }

  selectedDocumentSource(document: IKnowledgeDocument) {
    switch (document.sourceType) {
      case 'local-file':
      case 'file':
        return this.#translate.translate('XP.Knowledgebase.SourceUserUpload', { Default: 'User upload' })
      case 'file-system':
        return this.#translate.translate('XP.Knowledgebase.SourceFileSystem', { Default: 'File system' })
      case 'online-document':
        return this.#translate.translate('XP.Knowledgebase.SourceOnlineDocument', { Default: 'Online document' })
      case 'web-crawl':
        return this.#translate.translate('XP.Knowledgebase.SourceWebCrawl', { Default: 'Web crawl' })
      default:
        return this.#translate.translate('XP.Knowledgebase.SourceSystem', { Default: 'System' })
    }
  }

  canInlinePreview(document: IKnowledgeDocument) {
    return this.canViewOriginalFile(document) && document.type?.toLowerCase() === 'pdf'
  }

  hasAnalysisPreview(document: IKnowledgeDocument) {
    return !!document.metadata?.analysisSnapshot
  }

  processStageState(document: IKnowledgeDocument, stage: DocumentProcessStage): DocumentProcessStageState {
    return resolveProcessStageState(document.status, stage)
  }

  processStageIndex(document: IKnowledgeDocument) {
    const activeIndex = DOCUMENT_PROCESS_STAGES.findIndex((stage) => {
      const state = this.processStageState(document, stage)
      return state === 'active' || state === 'error'
    })
    if (activeIndex >= 0) {
      return activeIndex
    }
    return document.status === KBDocumentStatusEnum.FINISH ? 2 : 0
  }

  processStageStatusLabelKey(state: DocumentProcessStageState) {
    return `XP.Knowledgebase.StageStatus_${state}`
  }

  processStageStatusDefaultLabel(state: DocumentProcessStageState) {
    return DOCUMENT_PROCESS_STAGE_DEFAULT_LABELS[state]
  }

  processStageTimestamp(document: IKnowledgeDocument, stage: DocumentProcessStage) {
    if (stage === 'transform' && document.processBeginAt) {
      return formatDocumentTimestamp(document.processBeginAt)
    }

    if (DOCUMENT_PROCESS_STAGES[this.processStageIndex(document)] === stage) {
      return formatDocumentTimestamp(document.updatedAt ?? document.processBeginAt)
    }

    return null
  }

  openDocument(document: IKnowledgeDocument, view?: 'analysis' | 'chunks') {
    this.#router.navigate(['./', document.id], {
      relativeTo: this.#route,
      queryParams: { parentId: this.parentId(), ...(view ? { view } : {}) }
    })
  }

  getValue(row: any, name: string) {
    return get(row, name)
  }

  setColumnWidth(columnKey: DocumentTableColumnKey, width: number) {
    if (!Number.isFinite(width)) {
      return
    }

    this.tableColumns.update((columns) =>
      columns.map((column) =>
        column.key === columnKey ? { ...column, width: normalizeColumnWidth(width, column) } : column
      )
    )
  }

  commitColumnWidth(columnKey: DocumentTableColumnKey, event: Event) {
    const input = event.target
    if (!(input instanceof HTMLInputElement)) {
      return
    }

    const column = this.tableColumns().find((item) => item.key === columnKey)
    if (!column) {
      return
    }
    if (!Number.isFinite(input.valueAsNumber)) {
      input.value = `${column.width}`
      return
    }

    this.setColumnWidth(columnKey, input.valueAsNumber)
    input.value = `${this.tableColumns().find((item) => item.key === columnKey)?.width ?? column.width}`
  }

  restoreColumnWidth(columnKey: DocumentTableColumnKey, event: Event) {
    const input = event.target
    const column = this.tableColumns().find((item) => item.key === columnKey)
    if (!(input instanceof HTMLInputElement) || !column) {
      return
    }
    input.value = `${column.width}`
    input.blur()
  }

  startColumnResize(event: MouseEvent, column: DocumentTableColumn) {
    if (!column.resizable || event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const headerCell = (event.currentTarget as HTMLElement | null)?.parentElement
    const startWidth = headerCell?.getBoundingClientRect().width || column.width

    // Keep listening on the document so the drag does not stop when the pointer leaves the header cell.
    const onMouseMove = (moveEvent: MouseEvent) => {
      this.setColumnWidth(column.key, startWidth + moveEvent.clientX - startX)
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  toggleColumnVisibility(columnKey: DocumentTableColumnKey, visible: boolean) {
    this.tableColumns.update((columns) =>
      columns.map((column) => (column.key === columnKey && column.hideable ? { ...column, visible } : column))
    )

    if (!visible && this.sortState().active === columnKey) {
      this.sortState.set({ active: null, direction: '' })
    }
  }

  moveColumn(columnKey: DocumentTableColumnKey, offset: -1 | 1) {
    this.tableColumns.update((columns) => {
      const nextColumns = [...columns]
      const index = nextColumns.findIndex((column) => column.key === columnKey)
      const targetIndex = index + offset
      if (index < 0 || targetIndex < 0 || targetIndex >= nextColumns.length) {
        return columns
      }

      const [column] = nextColumns.splice(index, 1)
      nextColumns.splice(targetIndex, 0, column)
      return nextColumns
    })
  }

  resetColumns() {
    this.tableColumns.set(createDefaultDocumentColumns())
    this.sortState.set({ active: null, direction: '' })
  }

  toggleSort(column: DocumentTableColumn) {
    if (!column.sortable) {
      return
    }

    const sortState = this.sortState()
    const direction: DocumentTableSortDirection =
      sortState.active !== column.key
        ? 'asc'
        : sortState.direction === 'asc'
          ? 'desc'
          : sortState.direction === 'desc'
            ? ''
            : 'asc'
    this.sortState.set({
      active: direction ? column.key : null,
      direction
    })
  }

  sortDirection(column: DocumentTableColumn): DocumentTableSortDirection {
    const sortState = this.sortState()
    return sortState.active === column.key ? sortState.direction : ''
  }

  refresh() {
    this.refresh$.next(true)
    this.refreshGraphJobs()
  }

  canDownloadOriginalFile(doc: IKnowledgeDocument) {
    return doc.sourceType !== KDocumentSourceType.FOLDER && !isSystemManagedDocument(doc) && !!doc.filePath
  }

  canViewOriginalFile(doc: IKnowledgeDocument) {
    return this.canDownloadOriginalFile(doc)
  }

  isOriginalFileViewing(id: string) {
    return this.viewingOriginalFileIds().has(id)
  }

  viewOriginalFile(doc: IKnowledgeDocument, event?: MouseEvent) {
    event?.stopPropagation()
    if (!this.canViewOriginalFile(doc) || this.isOriginalFileViewing(doc.id)) {
      return
    }

    this.markOriginalFileViewing(doc.id, true)
    this.knowledgeDocumentAPI
      .downloadOriginalFile(doc.id)
      .pipe(
        switchMap((blob) => validateOriginalFileResponse(blob, doc)),
        finalize(() => this.markOriginalFileViewing(doc.id, false))
      )
      .subscribe({
        next: (blob) => {
          const objectUrl = URL.createObjectURL(blob)
          try {
            const dialogRef = openWorkbenchFilePreviewDialog(this._dialog, {
              id: doc.id,
              name: getOriginalFileName(doc),
              mimeType: blob.type || doc.storageFile?.mimetype,
              url: objectUrl,
              previewUrl: objectUrl
            })
            dialogRef.closed.pipe(take(1)).subscribe(() => URL.revokeObjectURL(objectUrl))
          } catch (err) {
            URL.revokeObjectURL(objectUrl)
            this.#toastr.error(getErrorMessage(err))
          }
        },
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  isOriginalFileDownloading(id: string) {
    return this.downloadingOriginalFileIds().has(id)
  }

  selectedDownloadableOriginalFileDocuments() {
    return this.#data().filter((doc) => this.selectionModel.isSelected(doc.id) && this.canDownloadOriginalFile(doc))
  }

  hasSelectedDownloadableOriginalFiles() {
    return this.selectedDownloadableOriginalFileDocuments().length > 0
  }

  downloadOriginalFile(doc: IKnowledgeDocument, event?: MouseEvent) {
    event?.stopPropagation()
    if (!this.canDownloadOriginalFile(doc) || this.isOriginalFileDownloading(doc.id)) {
      return
    }

    this.markOriginalFileDownloading(doc.id, true)
    this.knowledgeDocumentAPI
      .downloadOriginalFile(doc.id)
      .pipe(finalize(() => this.markOriginalFileDownloading(doc.id, false)))
      .subscribe({
        next: (blob) => {
          triggerOriginalFileDownload(blob, getOriginalFileName(doc))
        },
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  downloadSelectedOriginalFiles() {
    const docs = this.selectedDownloadableOriginalFileDocuments()
    if (!docs.length || this.downloadingSelectedOriginalFiles()) {
      this.#toastr.warning(
        this.#translate.instant('XP.Knowledgebase.NoOriginalFilesToDownload', {
          Default: 'No downloadable original files are available.'
        })
      )
      return
    }

    this.downloadingSelectedOriginalFiles.set(true)
    this.knowledgeDocumentAPI
      .downloadOriginalFiles(docs.map((doc) => doc.id))
      .pipe(finalize(() => this.downloadingSelectedOriginalFiles.set(false)))
      .subscribe({
        next: (blob) => {
          triggerOriginalFileDownload(blob, getOriginalFilesZipName(this.knowledgebase()?.name))
        },
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  private markOriginalFileDownloading(id: string, downloading: boolean) {
    this.downloadingOriginalFileIds.update((ids) => {
      const next = new Set(ids)
      if (downloading) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  private markOriginalFileViewing(id: string, viewing: boolean) {
    this.viewingOriginalFileIds.update((ids) => {
      const next = new Set(ids)
      if (viewing) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  refreshGraphJobs() {
    const knowledgebase = this.knowledgebase()
    if (!knowledgebase?.id || !knowledgebase.graphRag?.enabled) {
      this.graphJobs.set([])
      return
    }

    this.kbAPI
      .getGraphStatus(knowledgebase.id)
      .pipe(take(1))
      .subscribe({
        next: (status) => {
          this.graphJobs.set(status.jobs ?? [])
        },
        error: () => {
          this.graphJobs.set([])
        }
      })
  }

  graphJobStatus(documentId: string) {
    return this.graphJobByDocumentId().get(documentId)
  }

  backHome() {
    this.#router.navigate(['.'], { relativeTo: this.#route, queryParams: { parentId: null } })
  }

  createFolder() {
    if (this.vectorMutationLocked()) {
      return
    }
    this.confirmUnique<IKnowledgeDocument>(
      {
        title: this.#translate.instant('XP.Knowledgebase.NewFolder', { Default: 'New Folder' })
      },
      (name: string) => {
        return name
          ? this.knowledgeDocumentAPI.create({
              sourceType: KDocumentSourceType.FOLDER,
              name: name,
              knowledgebaseId: this.knowledgebase().id,
              parent: this.parentId() ? ({ id: this.parentId() } as IKnowledgeDocument) : null
            })
          : EMPTY
      }
    ).subscribe({
      next: (doc) => {
        this.refresh()
      },
      error: (err) => {
        this.handleMutationError(err)
      }
    })
  }

  createFromPipeline() {
    if (this.vectorMutationLocked()) {
      return
    }
    this.#router.navigate(['create-from-pipeline'], {
      relativeTo: this.#route,
      queryParams: { parentId: this.parentId() }
    })
  }

  uploadDocuments() {
    if (this.vectorMutationLocked()) {
      return
    }
    this.#router.navigate(['create'], { relativeTo: this.#route, queryParams: { parentId: this.parentId() } })
  }

  deleteDocument(doc: IKnowledgeDocument) {
    if (this.vectorMutationLocked()) {
      return
    }
    this.confirmDelete(
      {
        value: doc.id,
        information: doc.name
      },
      this.knowledgeDocumentAPI.delete(doc.id, doc.version)
    ).subscribe({
      next: () => {
        this.knowledgebaseComponent.documentNum.update((num) => num - 1)
        this.refresh()
      },
      error: (err) => {
        this.handleMutationError(err)
      }
    })
  }

  updateParserConfig(document: IKnowledgeDocument, config: Partial<IKnowledgeDocument['parserConfig']>) {
    this.knowledgeDocumentAPI
      .update(document.id, {
        version: document.version,
        parserConfig: { ...(document.parserConfig ?? {}), ...config } as IKnowledgeDocument['parserConfig']
      })
      .subscribe({
        next: () => {
          this.refresh()
        },
        error: (err) => {
          this.handleMutationError(err)
        }
      })
  }

  startParsing(row: IKnowledgeDocument) {
    if (this.vectorMutationLocked()) {
      return
    }
    row.status = KBDocumentStatusEnum.RUNNING
    this.knowledgeDocumentAPI.startParsing(row.id).subscribe({
      next: () => {
        this.refresh()
      },
      error: (err) => {
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  openXpert(xpert: IXpert) {
    window.open(['/xpert/x', xpert.id, 'agents'].join('/'), '_blank')
  }

  isAllSelected() {
    const numSelected = this.selectionModel.selected.length
    const numRows = this.notFolderItems().length
    return numRows > 0 && numSelected === numRows
  }
  isPartialSelected() {
    return this.selectionModel.selected.length > 0 && this.selectionModel.selected.length < this.notFolderItems().length
  }
  selectAll(checked: boolean) {
    if (checked) {
      this.selectionModel.select(...this.notFolderItems().map((row) => row.id))
    } else {
      this.selectionModel.clear()
    }
  }

  selectedDocuments() {
    return this.selectionModel.selected
      .map((id) => this.#data().find((document) => document.id === id))
      .filter((document): document is IKnowledgeDocument => !!document)
  }

  openMoveSelectedDialog(template: TemplateRef<unknown>) {
    const knowledgebaseId = this.knowledgebase()?.id
    if (!knowledgebaseId || !this.selectionModel.hasValue() || this.vectorMutationLocked()) {
      return
    }

    this.moveTargetFolderId.set(this.parentId() ?? null)
    this.moveFolderSearch.set('')
    this.moveFolderOptions.set([])
    this.moveFolderLoading.set(true)
    this.#moveDialogRef = this._dialog.open(template, {
      width: '32rem',
      maxWidth: 'calc(100vw - 2rem)',
      disableClose: true,
      backdropClass: 'xp-overlay-share-sheet',
      panelClass: 'xp-overlay-pane-card'
    })
    this.#moveDialogRef.closed.pipe(take(1)).subscribe(() => {
      this.#moveDialogRef = null
      this.moveFolderSearch.set('')
    })

    this.knowledgeDocumentAPI
      .getAll({
        select: ['id', 'name', 'sourceType', 'folder'],
        where: {
          knowledgebaseId,
          sourceType: KDocumentSourceType.FOLDER
        },
        order: { folder: OrderTypeEnum.ASC, name: OrderTypeEnum.ASC }
      })
      .pipe(
        take(1),
        finalize(() => this.moveFolderLoading.set(false))
      )
      .subscribe({
        next: ({ items }) => {
          this.moveFolderOptions.set(
            items
              .map((folder) => {
                const parentPath = normalizeMoveFolderPath(folder.folder)
                const path = normalizeMoveFolderPath([parentPath, folder.name].filter(Boolean).join('/'))
                return {
                  id: folder.id,
                  name: folder.name,
                  path,
                  depth: parentPath ? parentPath.split('/').length : 0
                }
              })
              .sort((left, right) => left.path.localeCompare(right.path, this.#translate.currentLanguage))
          )
        },
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
          this.closeMoveSelectedDialog()
        }
      })
  }

  closeMoveSelectedDialog() {
    this.#moveDialogRef?.close()
    this.#moveDialogRef = null
  }

  moveSelectedDocuments() {
    const knowledgebaseId = this.knowledgebase()?.id
    const documents = this.selectedDocuments()
    if (
      !knowledgebaseId ||
      !documents.length ||
      !this.moveDestinationChanged() ||
      this.movingSelectedDocuments() ||
      this.vectorMutationLocked()
    ) {
      return
    }

    this.movingSelectedDocuments.set(true)
    forkJoin(
      documents.map((document) =>
        this.knowledgeDocumentAPI.move(document.id, {
          knowledgebaseId,
          parentId: this.moveTargetFolderId(),
          version: document.version
        })
      )
    )
      .pipe(finalize(() => this.movingSelectedDocuments.set(false)))
      .subscribe({
        next: () => {
          const movedCount = documents.length
          this.selectionModel.clear()
          this.closeMoveSelectedDialog()
          this.refresh()
          this.#toastr.success(
            this.#translate.instant('XP.Knowledgebase.DocumentsMoved', {
              Default: `${movedCount} document(s) moved`,
              count: movedCount
            })
          )
        },
        error: (err) => {
          this.handleMutationError(err)
          // A concurrent batch can partially succeed before one item returns a conflict.
          // Refresh so the list always reflects the server's actual folder membership.
          this.refresh()
        }
      })
  }

  private handleMutationError(err: { status?: number }) {
    this.#toastr.error(getErrorMessage(err))
    if (err?.status === 409) {
      this.refresh()
    }
  }

  updateDocument(id: string, changes: Partial<IKnowledgeDocument>) {
    const document = this.#data().find((item) => item.id === id)
    this.isLoading.set(true)
    this.knowledgeDocumentAPI.update(id, { ...changes, version: changes.version ?? document?.version }).subscribe({
      next: () => {
        this.isLoading.set(false)
        this.refresh()
      },
      error: (err) => {
        this.isLoading.set(false)
        this.handleMutationError(err)
      }
    })
  }

  deleteSelected() {
    if (this.vectorMutationLocked()) {
      return
    }
    this.isLoading.set(true)
    this.knowledgeDocumentAPI.deleteBulk(this.selectedDocuments()).subscribe({
      next: () => {
        this.isLoading.set(false)
        this.knowledgebaseComponent.documentNum.update((num) => num - this.selectionModel.selected.length)
        this.selectionModel.clear()
        this.refresh()
      },
      error: (err) => {
        this.isLoading.set(false)
        this.handleMutationError(err)
      }
    })
  }

  enableSelected() {
    this.isLoading.set(true)
    this.knowledgeDocumentAPI
      .updateBulk(
        this.selectedDocuments().map((document) => ({ id: document.id, disabled: false, version: document.version }))
      )
      .subscribe({
        next: () => {
          this.isLoading.set(false)
          this.selectionModel.clear()
          this.refresh()
        },
        error: (err) => {
          this.isLoading.set(false)
          this.handleMutationError(err)
        }
      })
  }

  disableSelected() {
    this.isLoading.set(true)
    this.knowledgeDocumentAPI
      .updateBulk(
        this.selectedDocuments().map((document) => ({ id: document.id, disabled: true, version: document.version }))
      )
      .subscribe({
        next: () => {
          this.isLoading.set(false)
          this.selectionModel.clear()
          this.refresh()
        },
        error: (err) => {
          this.isLoading.set(false)
          this.handleMutationError(err)
        }
      })
  }

  renameDoc(doc: IKnowledgeDocument) {
    this.confirmUnique(
      {
        title: this.#translate.instant('XP.ACTIONS.Rename', { Default: 'Rename' }),
        value: doc.name
      },
      (name: string) => {
        return name ? this.knowledgeDocumentAPI.update(doc.id, { name, version: doc.version }) : EMPTY
      }
    ).subscribe({
      next: () => {
        this.refresh()
      },
      error: (err) => {
        this.handleMutationError(err)
      }
    })
  }

  enableDoc(doc: IKnowledgeDocument) {
    this.isLoading.set(true)
    this.knowledgeDocumentAPI.update(doc.id, { disabled: false, version: doc.version }).subscribe({
      next: () => {
        this.isLoading.set(false)
        this.refresh()
      },
      error: (err) => {
        this.isLoading.set(false)
        this.handleMutationError(err)
      }
    })
  }

  disableDoc(doc: IKnowledgeDocument) {
    this.isLoading.set(true)
    this.knowledgeDocumentAPI.update(doc.id, { disabled: true, version: doc.version }).subscribe({
      next: () => {
        this.isLoading.set(false)
        this.refresh()
      },
      error: (err) => {
        this.isLoading.set(false)
        this.handleMutationError(err)
      }
    })
  }

  reprocess(docs: string[]) {
    if (this.vectorMutationLocked()) {
      return
    }
    const calls: Observable<any>[] = []
    const documents = docs
      .map((id) => this.#data().find((doc) => doc.id === id))
      .filter((doc) => !!doc) as IKnowledgeDocument[]
    const standDocs = documents.filter((doc) => !doc.sourceConfig)
    if (standDocs.length) {
      calls.push(this.knowledgeDocumentAPI.startParsing(standDocs.map((doc) => doc.id)))
    }
    const pipelineDocs = documents.filter((doc) => !!doc.sourceConfig)
    if (pipelineDocs.length) {
      calls.push(
        this.kbAPI.createTask(this.knowledgebase().id, {
          taskType: 'document_reprocess',
          status: 'running', // Start processing immediately
          documents: pipelineDocs.map((doc) => ({ id: doc.id }) as IKnowledgeDocument)
        })
      )
    }
    if (calls.length > 0) {
      combineLatest(calls).subscribe({
        next: (task) => {
          this.refresh()
        },
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
        }
      })
    }
  }

  openTask(doc: IKnowledgeDocument) {
    this._dialog.open(KnowledgeTaskComponent, {
      width: '800px',
      data: {
        knowledgebase: this.knowledgebase(),
        documentId: doc.id
      },
      panelClass: 'xp-overlay-pane-share-sheet'
    })
  }

  openChunkSettings(document: IKnowledgeDocument) {
    if (this.vectorMutationLocked()) {
      return
    }
    this.#router.navigate(['./', document.id, 'settings'], {
      relativeTo: this.#route,
      queryParams: { parentId: this.parentId() }
    })
  }

  // Metadata operations
  addMetadataField() {
    this.metadataSchema.update((schema) => {
      const newField: KBMetadataFieldDef = {
        key: 'new_field_' + (schema?.length ?? 0),
        type: 'string',
        scope: 'document'
      }
      return [...(schema ?? []), newField]
    })
  }

  removeMetadata(index: number) {
    this.metadataSchema.update((schema) => {
      const updatedSchema = [...(schema ?? [])]
      updatedSchema.splice(index, 1)
      return updatedSchema
    })
  }

  updateMetadataField(index: number, key: keyof KBMetadataFieldDef, value: any) {
    this.metadataSchema.update((schema) => {
      const updatedSchema = [...(schema ?? [])]
      updatedSchema[index] = {
        ...updatedSchema[index],
        [key]: value
      }
      return updatedSchema
    })
  }

  updateMetadataType(index: number, type: MetadataFieldType) {
    this.metadataSchema.update((schema) => {
      const updatedSchema = [...(schema ?? [])]
      updatedSchema[index] = {
        ...updatedSchema[index],
        type,
        ...(type === 'enum'
          ? { enumValues: updatedSchema[index].enumValues?.length ? updatedSchema[index].enumValues : ['value'] }
          : { enumValues: undefined })
      }
      return updatedSchema
    })
  }

  updateMetadataEnumValues(index: number, value: string) {
    this.updateMetadataField(
      index,
      'enumValues',
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  }

  saveMetadataSchema(ref: CdkMenuTrigger) {
    this.isLoading.set(true)
    this.knowledgebaseComponent.knowledgebaseAPI
      .update(this.knowledgebase().id, {
        metadataSchema: (this.metadataSchema() ?? []).map((field) => ({
          ...field,
          key: field.key.trim(),
          scope: field.scope ?? 'document'
        }))
      })
      .subscribe({
        next: () => {
          this.isLoading.set(false)
          this._toastrService.success(
            this.#translate.instant('XP.Knowledgebase.MetadataSchemaSaved', {
              Default: 'Metadata schema saved successfully'
            })
          )
          ref.close()
          this.knowledgebaseComponent.refresh()
        },
        error: (err) => {
          this.isLoading.set(false)
          this._toastrService.error(getErrorMessage(err))
        }
      })
  }
}

function getOriginalFileName(doc: IKnowledgeDocument) {
  return doc.name || `${doc.id}.${doc.type || 'download'}`
}

function getOriginalFilesZipName(knowledgebaseName?: string) {
  const baseName = (knowledgebaseName || 'knowledge-documents').replace(/[\\/:*?"<>|]+/g, '_')
  return `${baseName}-original-files.zip`
}

function normalizeMoveFolderPath(value?: string | null) {
  return (value ?? '').replace(/\\/g, '/').split('/').filter(Boolean).join('/')
}

function buildFolderBrowserTree(items: IKnowledgeDocument[], rootId: string | null) {
  if (!rootId) {
    return []
  }

  const nodeById = new Map<string, FolderBrowserNode>(
    items.map((document) => [document.id, { document, children: [] }])
  )
  const roots: FolderBrowserNode[] = []
  for (const node of nodeById.values()) {
    const parentId = node.document.parent?.id
    if (parentId === rootId || !parentId) {
      roots.push(node)
      continue
    }
    const parent = nodeById.get(parentId)
    if (parent) {
      parent.children.push(node)
    }
  }

  const sortNodes = (nodes: FolderBrowserNode[]) => {
    nodes.sort((left, right) => {
      const leftFolder = left.document.sourceType === KDocumentSourceType.FOLDER ? 0 : 1
      const rightFolder = right.document.sourceType === KDocumentSourceType.FOLDER ? 0 : 1
      return leftFolder - rightFolder || left.document.name.localeCompare(right.document.name)
    })
    nodes.forEach((node) => sortNodes(node.children))
  }
  sortNodes(roots)
  return roots
}

function mergeFolderBrowserItems(current: IKnowledgeDocument[], incoming: IKnowledgeDocument[]) {
  const byId = new Map(current.map((document) => [document.id, document]))
  incoming.forEach((document) => byId.set(document.id, document))
  return [...byId.values()]
}

function withSetValue(values: Set<string>, value: string) {
  const next = new Set(values)
  next.add(value)
  return next
}

function withoutSetValue(values: Set<string>, value: string) {
  const next = new Set(values)
  next.delete(value)
  return next
}

function isSystemManagedDocument(doc: IKnowledgeDocument) {
  const metadata = doc.metadata
  return !!metadata && typeof metadata === 'object' && metadata['systemManaged'] === true
}

function triggerOriginalFileDownload(blob: Blob, fileName: string) {
  const anchor = document.createElement('a')
  const objectUrl = URL.createObjectURL(blob)
  anchor.href = objectUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(objectUrl)
}

function createDefaultDocumentColumns() {
  return DEFAULT_DOCUMENT_COLUMNS.map((column) => ({ ...column }))
}

function loadDocumentColumns(): DocumentTableColumn[] {
  if (typeof localStorage === 'undefined') {
    return createDefaultDocumentColumns()
  }

  try {
    const saved = JSON.parse(localStorage.getItem(DOCUMENT_COLUMNS_STORAGE_KEY) ?? '[]') as Array<
      Partial<DocumentTableColumn> & Pick<DocumentTableColumn, 'key'>
    >
    const defaultsByKey = new Map(DEFAULT_DOCUMENT_COLUMNS.map((column) => [column.key, column]))
    const restored = saved
      .map((column) => {
        const defaults = defaultsByKey.get(column.key)
        if (!defaults) {
          return null
        }
        defaultsByKey.delete(column.key)
        return {
          ...defaults,
          visible: defaults.hideable ? (column.visible ?? defaults.visible) : true,
          width: normalizeColumnWidth(Number(column.width ?? defaults.width), defaults)
        }
      })
      .filter((column): column is DocumentTableColumn => !!column)

    return [...restored, ...defaultsByKey.values().map((column) => ({ ...column }))]
  } catch {
    return createDefaultDocumentColumns()
  }
}

function saveDocumentColumns(columns: DocumentTableColumn[]) {
  if (typeof localStorage === 'undefined') {
    return
  }

  try {
    localStorage.setItem(
      DOCUMENT_COLUMNS_STORAGE_KEY,
      JSON.stringify(columns.map(({ key, visible, width }) => ({ key, visible, width })))
    )
  } catch {
    // Column customization is progressive enhancement; storage failures must not block document management.
  }
}

function normalizeColumnWidth(width: number, column: Pick<DocumentTableColumn, 'minWidth' | 'maxWidth'>) {
  const maxWidth = column.maxWidth ?? Number.POSITIVE_INFINITY
  return Math.min(Math.max(Math.round(width), column.minWidth), maxWidth)
}

function compareDocumentSortValues(
  a: IKnowledgeDocument,
  b: IKnowledgeDocument,
  sortState: ActiveDocumentTableSortState
) {
  const getSortValue = SORT_VALUE_BY_COLUMN[sortState.active]
  const direction = sortState.direction === 'desc' ? -1 : 1
  const aValue = normalizeSortValue(getSortValue(a))
  const bValue = normalizeSortValue(getSortValue(b))

  if (aValue < bValue) {
    return -1 * direction
  }

  if (aValue > bValue) {
    return direction
  }

  return 0
}

function normalizeSortValue(value: unknown): number | string {
  if (value instanceof Date) {
    return value.getTime()
  }

  if (typeof value === 'string') {
    const timestamp = Date.parse(value)
    return Number.isNaN(timestamp) ? value.toLocaleLowerCase() : timestamp
  }

  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }

  return ''
}

function isDocumentProcessing(status?: KBDocumentStatusEnum) {
  if (!status) {
    return false
  }

  return [
    KBDocumentStatusEnum.WAITING,
    KBDocumentStatusEnum.VALIDATE,
    KBDocumentStatusEnum.RUNNING,
    KBDocumentStatusEnum.TRANSFORMED,
    KBDocumentStatusEnum.SPLITTED,
    KBDocumentStatusEnum.UNDERSTOOD,
    KBDocumentStatusEnum.EMBEDDING
  ].includes(status)
}

function documentStatusSuffix(status?: KBDocumentStatusEnum) {
  switch (status) {
    case KBDocumentStatusEnum.FINISH:
      return 'Finish'
    case KBDocumentStatusEnum.ERROR:
      return 'Error'
    case KBDocumentStatusEnum.WAITING:
      return 'Waiting'
    case KBDocumentStatusEnum.RUNNING:
    case KBDocumentStatusEnum.VALIDATE:
      return 'Running'
    case KBDocumentStatusEnum.TRANSFORMED:
      return 'Transformed'
    case KBDocumentStatusEnum.SPLITTED:
      return 'Splitted'
    case KBDocumentStatusEnum.UNDERSTOOD:
      return 'Understood'
    case KBDocumentStatusEnum.EMBEDDING:
      return 'Embedding'
    default:
      return 'NotStart'
  }
}

function documentStatusDefaultLabel(status?: KBDocumentStatusEnum) {
  switch (status) {
    case KBDocumentStatusEnum.FINISH:
      return 'Complete'
    case KBDocumentStatusEnum.ERROR:
      return 'Error'
    case KBDocumentStatusEnum.WAITING:
      return 'Queued'
    case KBDocumentStatusEnum.RUNNING:
    case KBDocumentStatusEnum.VALIDATE:
      return 'Processing'
    case KBDocumentStatusEnum.TRANSFORMED:
      return 'Transformed'
    case KBDocumentStatusEnum.SPLITTED:
      return 'Splitting'
    case KBDocumentStatusEnum.UNDERSTOOD:
      return 'Understanding'
    case KBDocumentStatusEnum.EMBEDDING:
      return 'Indexing'
    default:
      return 'Not started'
  }
}

function resolveProcessStageState(
  status: KBDocumentStatusEnum | undefined,
  stage: DocumentProcessStage
): DocumentProcessStageState {
  if (status === KBDocumentStatusEnum.ERROR) {
    return stage === 'transform' ? 'error' : 'pending'
  }

  const order: Record<DocumentProcessStage, number> = { transform: 0, split: 1, index: 2 }
  const activeStage =
    status === KBDocumentStatusEnum.FINISH
      ? 3
      : [KBDocumentStatusEnum.SPLITTED, KBDocumentStatusEnum.UNDERSTOOD, KBDocumentStatusEnum.EMBEDDING].includes(
            status
          )
        ? 2
        : status === KBDocumentStatusEnum.TRANSFORMED
          ? 1
          : 0
  const stageOrder = order[stage]
  return activeStage > stageOrder
    ? 'complete'
    : activeStage === stageOrder && isDocumentProcessing(status)
      ? 'active'
      : 'pending'
}

function formatDocumentSize(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) {
      return value
    }
    value = numeric
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return '-'
  }

  if (value < 1024) {
    return `${value} B`
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function formatDocumentTimestamp(value: Date | string | null | undefined) {
  if (!value) {
    return '-'
  }

  const timestamp = new Date(value)
  return Number.isNaN(timestamp.getTime()) ? '-' : format(timestamp, 'yyyy-MM-dd HH:mm:ss')
}
