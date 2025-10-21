import { animate, state, style, transition, trigger } from '@angular/animations'
import { SelectionModel } from '@angular/cdk/collections'
import { CdkMenuModule } from '@angular/cdk/menu'
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
import { debouncedSignal } from '@metad/ocap-angular/core'
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
  IKnowledgeDocumentPage,
  injectHelpWebsite,
  injectToastr,
  IXpert,
  KBDocumentStatusEnum,
  KDocumentSourceType,
  KnowledgebaseService,
  KnowledgebaseTypeEnum,
  KnowledgeDocumentService,
  OrderTypeEnum,
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

  readonly pageSize = model(20)
  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase
  readonly knowledgebase$ = toObservable(this.knowledgebase)
  readonly xperts = computed(() => this.knowledgebase()?.xperts)
  readonly parentId$ = toObservable(this.parentId)

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
      // If the user changes the sort order, reset back to the first page.
      // this.sort().sortChange.subscribe(() => (this.paginator().pageIndex = 0))

      merge(
        // this.sort().sortChange, this.paginator().page,
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
                select: ['id', 'name', 'status', 'disabled', 'sourceType', 'createdAt', 'updatedAt', 'processMsg', 'sourceConfig'],
                where,
                take: this.pageSize(),
                // skip: this.paginator().pageIndex,
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
          (item) => item.status === KBDocumentStatusEnum.WAITING || item.status === KBDocumentStatusEnum.RUNNING
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

  removePage(doc: IKnowledgeDocument, page: IKnowledgeDocumentPage) {
    this.knowledgeDocumentAPI.removePage(doc, page).subscribe({
      next: () => {
        this.#data.update((docs) => {
          return docs.map((doc) => {
            if (doc.pages?.some((_) => _.id === page.id)) {
              return {
                ...doc,
                pages: doc.pages.filter((_) => _.id !== page.id)
              }
            }
            return doc
          })
        })
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
    const numRows = this.#data().length
    return numRows > 0 && numSelected === numRows
  }
  isPartialSelected() {
    return this.selectionModel.selected.length > 0 && this.selectionModel.selected.length < this.#data().length
  }
  selectAll(checked: boolean) {
    if (checked) {
      this.selectionModel.select(...this.#data().map((row) => row.id))
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
}
