import { animate, state, style, transition, trigger } from '@angular/animations'
import { SelectionModel } from '@angular/cdk/collections'
import { CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu'
import { afterNextRender, Component, computed, effect, inject, model, signal } from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { Dialog } from '@angular/cdk/dialog'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { I18nService } from '@cloud/app/@shared/i18n'
import { injectConfirmDelete, injectConfirmUnique, NgmCommonModule } from '@xpert-ai/ocap-angular/common'
import { debouncedSignal, linkedModel, NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
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
import { KnowledgebaseComponent } from '../knowledgebase.component'
import { ZardSwitchComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'

const REFRESH_DEBOUNCE_TIME = 5000

@Component({
  standalone: true,
  selector: 'xp-knowledgebase-documents',
  templateUrl: './documents.component.html',
  styleUrls: ['./documents.component.scss'],
  imports: [
    RouterModule,
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    ...ZardTooltipImports,
    ZardSwitchComponent,
    NgmCommonModule,
    KnowledgeDocIdComponent,
    NgmI18nPipe
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
  readonly delayRefresh$ = new Subject<boolean>()

  columnsToDisplay = [
    {
      name: 'type',
      caption: 'Type'
    },
    {
      name: 'createdAtRelative',
      caption: 'Created At'
    },
    {
      name: 'disabled',
      caption: 'Enabled'
    },
    {
      name: 'processMsg',
      caption: 'Message'
    }
  ]
  columnsToDisplayWithExpand = [...this.columnsToDisplay.map(({ name }) => name), 'progress', 'expand']
  expandedElement: any | null

  readonly isLoading = signal(false)
  readonly downloadingOriginalFileIds = signal<Set<string>>(new Set())
  readonly downloadingSelectedOriginalFiles = signal(false)
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
  readonly notFolderItems = computed(() =>
    this.#data().filter((item) => item.sourceType !== KDocumentSourceType.FOLDER)
  )
  readonly filteredData = computed(() => {
    const filterValue = this.searchTerm()?.toLowerCase() ?? ''
    return this.#data().filter((item) => item.name?.toLowerCase().includes(filterValue))
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
          this.#data.set(
            data.map(
              (item) =>
                ({
                  ...item,
                  createdAtRelative: formatRelative(new Date(item.updatedAt), new Date(), {
                    locale: getDateLocale(this.#translate.currentLanguage)
                  }),
                  parserConfig: item.parserConfig ?? {}
                }) as IKnowledgeDocument
            )
          )
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
        this.delayRefresh$.next(true)
      }
    })

    effect(() => {
      if (this.knowledgebase()?.graphStatus === KnowledgeGraphStatus.INDEXING) {
        this.delayRefresh$.next(true)
      }
    })

    effect(() => {
      if (this.vectorMutationLocked()) {
        this.delayRefresh$.next(true)
      }
    })

    this.delayRefresh$.pipe(takeUntilDestroyed(), debounceTime(REFRESH_DEBOUNCE_TIME)).subscribe(() => {
      this.knowledgebaseComponent.refresh()
      this.refresh()
    })
  }

  getValue(row: any, name: string) {
    return get(row, name)
  }

  refresh() {
    this.refresh$.next(true)
    this.refreshGraphJobs()
  }

  canDownloadOriginalFile(doc: IKnowledgeDocument) {
    return doc.sourceType !== KDocumentSourceType.FOLDER && !isSystemManagedDocument(doc) && !!doc.filePath
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
        this.#translate.instant('PAC.Knowledgebase.NoOriginalFilesToDownload', {
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
        title: this.#translate.instant('PAC.Knowledgebase.NewFolder', { Default: 'New Folder' })
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
        title: this.#translate.instant('PAC.ACTIONS.Rename', { Default: 'Rename' }),
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
        type: 'string'
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

  saveMetadataSchema(ref: CdkMenuTrigger) {
    this.isLoading.set(true)
    this.knowledgebaseComponent.knowledgebaseAPI
      .update(this.knowledgebase().id, {
        metadataSchema: this.metadataSchema()
      })
      .subscribe({
        next: () => {
          this.isLoading.set(false)
          this._toastrService.success(
            this.#translate.instant('PAC.Knowledgebase.MetadataSchemaSaved', {
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
