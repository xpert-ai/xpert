import { SelectionModel } from '@angular/cdk/collections'
import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { afterNextRender, computed, DestroyRef, Directive, effect, inject, model, signal } from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router } from '@angular/router'
import { I18nService } from '@cloud/app/@shared/i18n'
import { debouncedSignal, injectConfirmDelete, injectConfirmUnique, linkedModel } from '@xpert-ai/headless-ui'
import { formatRelative } from 'date-fns/formatRelative'
import { get } from 'lodash-es'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import {
  BehaviorSubject,
  catchError,
  debounceTime,
  filter,
  map,
  merge,
  of as observableOf,
  startWith,
  Subject,
  switchMap
} from 'rxjs'
import {
  getDateLocale,
  IKnowledgeDocument,
  injectHelpWebsite,
  injectToastr,
  KBDocumentStatusEnum,
  KDocumentSourceType,
  KnowledgebaseService,
  KnowledgebaseStatusEnum,
  KnowledgebaseTypeEnum,
  KnowledgeDocumentService,
  KnowledgeGraphStatus,
  MetadataFieldType,
  OrderTypeEnum,
  STANDARD_METADATA_FIELDS,
  ToastrService
} from '../../../../../@core'
import { injectDocumentTags } from '../../tags/document-tags-refresh'
import { KnowledgebaseComponent } from '../knowledgebase.component'
import { injectDocumentGraphProgress } from './document-graph-status'
import { documentParserLabel } from './document-parser-label'
import { DocumentProgressColumnWidth } from './document-progress-column'
import {
  ACTIONS_COLUMN_WIDTH,
  ActiveDocumentTableSortState,
  buildFolderBrowserTree,
  compareDocumentSortValues,
  createDefaultDocumentColumns,
  DOCUMENT_INSPECTOR_DEFAULT_WIDTH,
  DOCUMENT_INSPECTOR_MAX_WIDTH,
  DOCUMENT_INSPECTOR_MIN_WIDTH,
  DOCUMENT_PROCESS_STAGE_DEFAULT_LABELS,
  DOCUMENT_PROCESS_STAGES,
  DocumentProcessStage,
  DocumentProcessStageState,
  documentStatusDefaultLabel,
  DocumentStatusFilter,
  documentStatusSuffix,
  DocumentTableColumn,
  DocumentTableColumnKey,
  DocumentTableSortDirection,
  DocumentTableSortState,
  FolderChildCount,
  formatDocumentSize,
  formatDocumentTimestamp,
  isDocumentProcessing,
  isSystemManagedDocument,
  loadDocumentColumns,
  MoveFolderOption,
  normalizeColumnWidth,
  normalizeDocumentInspectorWidth,
  REFRESH_DEBOUNCE_TIME,
  resolveProcessStageState,
  saveDocumentColumns,
  SELECT_COLUMN_WIDTH
} from './document-view-model'
import { injectDocumentWikiProgress } from './document-wiki-status'
import { KnowledgeDocumentDialogService } from './import/document-dialog.service'

@Directive()
export abstract class DocumentViewState {
  readonly isSystemManagedDocument = isSystemManagedDocument

  eKDocumentSourceType = KDocumentSourceType

  eKBDocumentStatusEnum = KBDocumentStatusEnum

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

  readonly documentDialogs = inject(KnowledgeDocumentDialogService)

  readonly _router = inject(Router)

  readonly _route = inject(ActivatedRoute)

  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)

  readonly confirmDelete = injectConfirmDelete()

  readonly confirmUnique = injectConfirmUnique()

  readonly _toastr = injectToastr()

  readonly _translate = inject(I18nService)

  readonly parentId = injectQueryParams('parentId')

  readonly helpUrl = injectHelpWebsite('/docs/ai/knowledge/knowledgebase')

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

  readonly destroyRef = inject(DestroyRef)

  readonly documentDelayRefresh$ = new Subject<void>()

  readonly knowledgebaseDelayRefresh$ = new Subject<void>()

  readonly selectColumnWidth = SELECT_COLUMN_WIDTH

  readonly actionsColumnWidth = ACTIONS_COLUMN_WIDTH

  readonly documentInspectorMinWidth = DOCUMENT_INSPECTOR_MIN_WIDTH

  readonly tableColumns = signal<DocumentTableColumn[]>(createDefaultDocumentColumns())

  readonly progressColumnWidth = new DocumentProgressColumnWidth()

  readonly visibleDocumentColumns = computed(() =>
    this.progressColumnWidth.fit(this.tableColumns().filter((column) => column.visible))
  )

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

  _moveDialogRef: DialogRef<unknown, unknown> | null = null

  isRateLimitReached = false

  readonly _data = signal<IKnowledgeDocument[]>([])

  readonly total = signal<number>(0)

  readonly selectionModel = new SelectionModel<string>(true, [])

  readonly search = model<string>()

  readonly searchTerm = debouncedSignal(this.search, 300)

  readonly statusFilter = signal<DocumentStatusFilter>('all')

  readonly selectedDocumentId = signal<string | null>(null)

  readonly documentInspectorDismissed = signal(false)

  readonly documentInspectorWidth = signal(DOCUMENT_INSPECTOR_DEFAULT_WIDTH)

  readonly folderBrowserSelectedDocument = signal<IKnowledgeDocument | null>(null)

  readonly selectedDocument = computed(() => {
    if (this.documentInspectorDismissed()) {
      return null
    }
    const selectedDocumentId = this.selectedDocumentId()
    const browserDocument = this.folderBrowserSelectedDocument()
    return (
      this._data().find((document) => document.id === selectedDocumentId) ??
      (browserDocument?.id === selectedDocumentId ? browserDocument : null)
    )
  })

  readonly liveDocumentTags = injectDocumentTags(this.knowledgebase, this._data)

  readonly wikiDocumentProgress = injectDocumentWikiProgress(this.knowledgebase, this._data, this.selectedDocument)

  readonly selectedPdfPreviewSource = computed(() => {
    const document = this.selectedDocument()
    return document && this.canInlinePreview(document)
      ? this.knowledgeDocumentAPI.originalFilePreviewSource(document.id)
      : null
  })

  readonly notFolderItems = computed(() =>
    this._data().filter((item) => item.sourceType !== KDocumentSourceType.FOLDER)
  )

  readonly selectableDocuments = computed(() => this.notFolderItems().filter((doc) => !isSystemManagedDocument(doc)))

  readonly errorCount = computed(
    () => this.notFolderItems().filter((document) => document.status === KBDocumentStatusEnum.ERROR).length
  )

  readonly processingCount = computed(
    () => this.notFolderItems().filter((document) => isDocumentProcessing(document.status)).length
  )

  readonly filteredData = computed(() => {
    const filterValue = this.searchTerm()?.toLowerCase() ?? ''
    const statusFilter = this.statusFilter()
    const rows = this._data().filter(
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

  readonly graphProgressRefresh = signal(0)

  readonly graphDocumentProgress = injectDocumentGraphProgress(
    this.knowledgebase,
    this.filteredData,
    this.selectedDocument,
    this.graphProgressRefresh
  )

  readonly parentFolder = toSignal(
    this.parentId$.pipe(
      switchMap((parentId) =>
        parentId ? this.knowledgeDocumentAPI.getById(parentId, { relations: ['parent'] }) : observableOf(null)
      )
    )
  )

  readonly grandParent = computed(() => this.parentFolder()?.parent ?? null)

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
        this._router.navigate(['../test'], { relativeTo: this._route })
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
                relations: ['storageFile', 'tagAssignments', 'tagAssignments.tag'],
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
                  locale: getDateLocale(this._translate.currentLanguage)
                }),
                parserConfig: item.parserConfig ?? {}
              }) as IKnowledgeDocument
          )
          this._data.set(documents)
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
        })
    })

    effect(() => {
      if (
        this._data()?.some((item) =>
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

  startDocumentInspectorResize(event: PointerEvent) {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = this.documentInspectorWidth()
    const resizeHandle = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
    resizeHandle?.setPointerCapture(event.pointerId)

    const onPointerMove = (moveEvent: PointerEvent) => {
      this.documentInspectorWidth.set(
        normalizeDocumentInspectorWidth(startWidth + startX - moveEvent.clientX, this.documentInspectorMaxWidth())
      )
    }
    const finishResize = (endEvent: PointerEvent) => {
      if (resizeHandle?.hasPointerCapture(endEvent.pointerId)) {
        resizeHandle.releasePointerCapture(endEvent.pointerId)
      }
      resizeHandle?.removeEventListener('pointermove', onPointerMove)
      resizeHandle?.removeEventListener('pointerup', finishResize)
      resizeHandle?.removeEventListener('pointercancel', finishResize)
    }

    resizeHandle?.addEventListener('pointermove', onPointerMove)
    resizeHandle?.addEventListener('pointerup', finishResize)
    resizeHandle?.addEventListener('pointercancel', finishResize)
  }

  resizeDocumentInspectorFromKeyboard(event: KeyboardEvent) {
    const resizeDelta = event.shiftKey ? 40 : 16
    const direction = event.key === 'ArrowLeft' ? 1 : event.key === 'ArrowRight' ? -1 : 0
    if (!direction) {
      return
    }

    event.preventDefault()
    this.documentInspectorWidth.update((width) =>
      normalizeDocumentInspectorWidth(width + direction * resizeDelta, this.documentInspectorMaxWidth())
    )
  }

  documentInspectorMaxWidth() {
    if (typeof window === 'undefined') {
      return DOCUMENT_INSPECTOR_MAX_WIDTH
    }
    return Math.max(
      DOCUMENT_INSPECTOR_MIN_WIDTH,
      Math.min(DOCUMENT_INSPECTOR_MAX_WIDTH, Math.floor(window.innerWidth * 0.55))
    )
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
    return documentParserLabel(
      document,
      this._translate.language(),
      this._translate.translate('XP.Knowledgebase.WorkspaceConfiguration.Implemented.BuiltinParser'),
      this._translate.translate('XP.Knowledgebase.ParserNotRecorded')
    )
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
      locale: getDateLocale(this._translate.currentLanguage)
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
      return this._translate.translate('XP.Knowledgebase.PageRangeQuotaExceeded', {
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
        return this._translate.translate('XP.Knowledgebase.SourceUserUpload', { Default: 'User upload' })
      case 'file-system':
        return this._translate.translate('XP.Knowledgebase.SourceFileSystem', { Default: 'File system' })
      case 'online-document':
        return this._translate.translate('XP.Knowledgebase.SourceOnlineDocument', { Default: 'Online document' })
      case 'web-crawl':
        return this._translate.translate('XP.Knowledgebase.SourceWebCrawl', { Default: 'Web crawl' })
      default:
        return this._translate.translate('XP.Knowledgebase.SourceSystem', { Default: 'System' })
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
    this._router.navigate(['./', document.id], {
      relativeTo: this._route,
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
  abstract loadFolderBrowser(folder: IKnowledgeDocument): Promise<void>
  abstract resetFolderBrowser(): void
  abstract refreshFolderChildCounts(documents: IKnowledgeDocument[]): void
  abstract refresh(): void
  abstract canViewOriginalFile(doc: IKnowledgeDocument): boolean
}
