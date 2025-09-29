import { animate, state, style, transition, trigger } from '@angular/animations'
import { CdkMenuModule } from '@angular/cdk/menu'
import { afterNextRender, Component, computed, effect, inject, model, signal } from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatDialog } from '@angular/material/dialog'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { I18nService } from '@cloud/app/@shared/i18n'
import { XpertInlineProfileComponent } from '@cloud/app/@shared/xpert'
import { injectConfirmDelete, injectConfirmUnique, NgmCommonModule, NgmCountdownConfirmationComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { formatRelative } from 'date-fns/formatRelative'
import { get } from 'lodash-es'
import {
  BehaviorSubject,
  catchError,
  debounceTime,
  EMPTY,
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
  getErrorMessage,
  IKnowledgeDocument,
  IKnowledgeDocumentPage,
  injectToastr,
  IXpert,
  KBDocumentStatusEnum,
  KDocumentSourceType,
  KnowledgebaseTypeEnum,
  KnowledgeDocumentService,
  ToastrService
} from '../../../../../@core'
import { KnowledgeDocIdComponent } from '../../../../../@shared/knowledge'
import { KnowledgebaseComponent } from '../knowledgebase.component'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { SelectionModel } from '@angular/cdk/collections'
import { debouncedSignal } from '@metad/ocap-angular/core'

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
    MatButtonModule,
    MatTooltipModule,
    NgmCommonModule,
    KnowledgeDocIdComponent,
    XpertInlineProfileComponent
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

  readonly knowledgeDocumentAPI = inject(KnowledgeDocumentService)
  readonly _toastrService = inject(ToastrService)
  readonly #dialog = inject(MatDialog)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly confirmDelete = injectConfirmDelete()
  readonly confirmUnique = injectConfirmUnique()
  readonly #toastr = injectToastr()
  readonly #translate = inject(I18nService)
  readonly parentId = injectQueryParams('parentId')

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
  readonly parentFolder = toSignal(this.parentId$.pipe(switchMap((parentId) => (parentId ? this.knowledgeDocumentAPI.getOneById(parentId, { relations: ['parent']}) : observableOf(null)))))
  readonly grandParent = computed(() => this.parentFolder()?.parent ?? null)

  constructor() {
    effect(() => {
      if (this.knowledgebase()?.type === KnowledgebaseTypeEnum.External) {
        this.#router.navigate(['../test'], { relativeTo: this.#route })
      }
    }, { allowSignalWrites: true })

    afterNextRender(() => {
      // If the user changes the sort order, reset back to the first page.
      // this.sort().sortChange.subscribe(() => (this.paginator().pageIndex = 0))

      merge(
        // this.sort().sortChange, this.paginator().page, 
        this.knowledgebase$, this.parentId$, this.refresh$)
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
              parent: this.parentId() ? { id: this.parentId() } as IKnowledgeDocument : { $isNull: true }
            }
            return this.knowledgeDocumentAPI.getAll({
              where,
              take: this.pageSize(),
              // skip: this.paginator().pageIndex,
              relations: ['storageFile', 'pages'],
              // order
            }).pipe(catchError(() => observableOf(null)))
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
      if (this.#data()?.some((item) => item.status === 'running')) {
        this.delayRefresh$.next(true)
      }
    })

    this.delayRefresh$.pipe(takeUntilDestroyed(), debounceTime(5000)).subscribe(() => this.refresh())
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
    this.confirmUnique({
      title: this.#translate.instant('PAC.Knowledgebase.NewFolder', { Default: 'New Folder' }),
    }, (name: string) => {
      return name ? this.knowledgeDocumentAPI.create({
        sourceType: KDocumentSourceType.FOLDER,
        name: name,
        knowledgebaseId: this.knowledgebase().id,
        parent: this.parentId() ? { id: this.parentId() } as IKnowledgeDocument : null
      }) : EMPTY
    })
    .subscribe({
      next: (doc) => {
        this.refresh()
      },
      error: (err) => {
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  createFromPipeline() {
    this.#router.navigate(['create-from-pipeline'], { relativeTo: this.#route, queryParams: { parentId: this.parentId() } })
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

  restartParsing(id: string) {
    this.#dialog
      .open(NgmCountdownConfirmationComponent, {
        data: {
          recordType: 'Restart parsing job?'
        }
      })
      .afterClosed()
      .pipe(switchMap((confirm) => (confirm ? this.knowledgeDocumentAPI.startParsing(id) : EMPTY)))
      .subscribe({
        next: () => {
          this.refresh()
        },
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  stopParsing(id: string) {
    this.#dialog
      .open(NgmCountdownConfirmationComponent, {
        data: {
          recordType: 'Stop the parsing job?'
        }
      })
      .afterClosed()
      .pipe(switchMap((confirm) => (confirm ? this.knowledgeDocumentAPI.stopParsing(id) : EMPTY)))
      .subscribe({
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
    this.knowledgeDocumentAPI.updateBulk(this.selectionModel.selected.map((id) => ({ id, disabled: false }))).subscribe({
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
    this.confirmUnique({
      title: this.#translate.instant('PAC.ACTIONS.Rename', { Default: 'Rename' }),
      value: doc.name
    }, (name: string) => {
      return name ? this.knowledgeDocumentAPI.update(doc.id, { name }) : EMPTY
    })
    .subscribe({
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
}
