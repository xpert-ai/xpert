import { animate, state, style, transition, trigger } from '@angular/animations'
import { SelectionModel } from '@angular/cdk/collections'
import { CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu'
import { afterNextRender, Component, computed, effect, inject, model, signal } from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Dialog } from '@angular/cdk/dialog'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { I18nService } from '@cloud/app/@shared/i18n'
import {
  injectConfirmDelete,
  injectConfirmUnique,
  NgmCommonModule,
} from '@metad/ocap-angular/common'
import { debouncedSignal, linkedModel, NgmI18nPipe } from '@metad/ocap-angular/core'
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
  map,
  merge,
  Observable,
  of as observableOf,
  startWith,
  Subject,
  switchMap
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
  KnowledgebaseTypeEnum,
  KnowledgeDocumentService,
  OrderTypeEnum,
  STANDARD_METADATA_FIELDS,
  ToastrService
} from '../../../../../@core'
import { KnowledgeDocIdComponent, KnowledgeTaskComponent } from '../../../../../@shared/knowledge'
import { KnowledgebaseComponent } from '../knowledgebase.component'


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
    MatTooltipModule,
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
  isRateLimitReached = false
  readonly #data = signal<IKnowledgeDocument[]>([])
  readonly total = signal<number>(0)
  readonly selectionModel = new SelectionModel<string>(true, [])
  readonly search = model<string>()
  readonly searchTerm = debouncedSignal(this.search, 300)
  readonly notFolderItems = computed(() => this.#data().filter((item) => item.sourceType !== KDocumentSourceType.FOLDER))
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
    effect(
      () => {
        if (this.knowledgebase()?.type === KnowledgebaseTypeEnum.External) {
          this.#router.navigate(['../test'], { relativeTo: this.#route })
        }
      },
      { allowSignalWrites: true }
    )

    afterNextRender(() => {
      merge(
        this.knowledgebase$,
        this.parentId$,
        this.refresh$
      )
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
                select: ['id', 'name', 'status', 'disabled', 'sourceType', 'type', 'category', 'createdAt', 'updatedAt', 'processMsg', 'progress', 'sourceConfig', 'folder'],
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
        .subscribe((data) =>
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
        )
    })

    effect(() => {
      if (
        this.#data()?.some(
          (item) => [
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

    this.delayRefresh$.pipe(takeUntilDestroyed(), debounceTime(REFRESH_DEBOUNCE_TIME)).subscribe(() => this.refresh())
  }

  getValue(row: any, name: string) {
    return get(row, name)
  }

  refresh() {
    this.refresh$.next(true)
  }

  backHome() {
    this.#router.navigate(['.'], { relativeTo: this.#route, queryParams: { parentId: null } })
  }

  createFolder() {
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
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  createFromPipeline() {
    this.#router.navigate(['create-from-pipeline'], {
      relativeTo: this.#route,
      queryParams: { parentId: this.parentId() }
    })
  }

  uploadDocuments() {
    this.#router.navigate(['create'], { relativeTo: this.#route, queryParams: { parentId: this.parentId() } })
  }

  deleteDocument(doc: IKnowledgeDocument) {
    this.confirmDelete(
      {
        value: doc.id,
        information: doc.name
      },
      this.knowledgeDocumentAPI.delete(doc.id)
    ).subscribe({
      next: () => {
        this.knowledgebaseComponent.documentNum.update((num) => num - 1)
        this.refresh()
      },
      error: (err) => {
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  updateParserConfig(document: IKnowledgeDocument, config: Partial<IKnowledgeDocument['parserConfig']>) {
    this.knowledgeDocumentAPI
      .update(document.id, {
        parserConfig: { ...(document.parserConfig ?? {}), ...config } as IKnowledgeDocument['parserConfig']
      })
      .subscribe({
        next: () => {
          //
        },
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  startParsing(row: IKnowledgeDocument) {
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

  updateDocument(id: string, changes: Partial<IKnowledgeDocument>) {
    this.isLoading.set(true)
    this.knowledgeDocumentAPI.update(id, changes).subscribe({
      next: () => {
        this.isLoading.set(false)
        this.refresh()
      },
      error: (err) => {
        this.isLoading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  deleteSelected() {
    this.isLoading.set(true)
    this.knowledgeDocumentAPI.deleteBulk(this.selectionModel.selected).subscribe({
      next: () => {
        this.isLoading.set(false)
        this.knowledgebaseComponent.documentNum.update((num) => num - this.selectionModel.selected.length)
        this.selectionModel.clear()
        this.refresh()
      },
      error: (err) => {
        this.isLoading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  enableSelected() {
    this.isLoading.set(true)
    this.knowledgeDocumentAPI
      .updateBulk(this.selectionModel.selected.map((id) => ({ id, disabled: false })))
      .subscribe({
        next: () => {
          this.isLoading.set(false)
          this.selectionModel.clear()
          this.refresh()
        },
        error: (err) => {
          this.isLoading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  disableSelected() {
    this.isLoading.set(true)
    this.knowledgeDocumentAPI.updateBulk(this.selectionModel.selected.map((id) => ({ id, disabled: true }))).subscribe({
      next: () => {
        this.isLoading.set(false)
        this.selectionModel.clear()
        this.refresh()
      },
      error: (err) => {
        this.isLoading.set(false)
        this.#toastr.error(getErrorMessage(err))
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
        return name ? this.knowledgeDocumentAPI.update(doc.id, { name }) : EMPTY
      }
    ).subscribe({
      next: () => {
        this.refresh()
      },
      error: (err) => {
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  enableDoc(doc: IKnowledgeDocument) {
    this.isLoading.set(true)
    this.knowledgeDocumentAPI.update(doc.id, { disabled: false }).subscribe({
      next: () => {
        this.isLoading.set(false)
        this.refresh()
      },
      error: (err) => {
        this.isLoading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  disableDoc(doc: IKnowledgeDocument) {
    this.isLoading.set(true)
    this.knowledgeDocumentAPI.update(doc.id, { disabled: true }).subscribe({
      next: () => {
        this.isLoading.set(false)
        this.refresh()
      },
      error: (err) => {
        this.isLoading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  reprocess(docs: string[]) {
    const calls: Observable<any>[] = []
    const documents = docs.map((id) => this.#data().find((doc) => doc.id === id)).filter((doc) => !!doc) as IKnowledgeDocument[]
    const standDocs = documents.filter((doc) => !doc.sourceConfig)
    if (standDocs.length) {
      calls.push(this.knowledgeDocumentAPI.startParsing(standDocs.map((doc) => doc.id)))
    }
    const pipelineDocs = documents.filter((doc) => !!doc.sourceConfig)
    if (pipelineDocs.length) {
      calls.push(
        this.kbAPI
              .createTask(this.knowledgebase().id, {
                taskType: 'document_reprocess',
                status: 'running', // Start processing immediately
                documents: pipelineDocs.map((doc) => ({ id: doc.id } as IKnowledgeDocument))
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
    this.#router.navigate(['./', document.id, 'settings'], { relativeTo: this.#route, queryParams: { parentId: this.parentId() } })
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
    this.knowledgebaseComponent.knowledgebaseAPI.update(this.knowledgebase().id, {
      metadataSchema: this.metadataSchema()
    }).subscribe({
      next: () => {
        this.isLoading.set(false)
        this._toastrService.success(this.#translate.instant('PAC.Knowledgebase.MetadataSchemaSaved', { Default: 'Metadata schema saved successfully' }))
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
