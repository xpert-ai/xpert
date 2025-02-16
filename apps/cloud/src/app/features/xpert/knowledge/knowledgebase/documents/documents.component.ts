import { animate, state, style, transition, trigger } from '@angular/animations'
import { afterNextRender, Component, effect, inject, model, signal, viewChild } from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator'
import { MatSort, MatSortModule } from '@angular/material/sort'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import {
  injectConfirmDelete,
  NgmCommonModule,
  NgmCountdownConfirmationComponent
} from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
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
  injectToastr,
  IStorageFile,
  KnowledgeDocumentService,
  OrderTypeEnum,
  Store,
  ToastrService
} from '../../../../../@core'
import { KnowledgebaseComponent } from '../knowledgebase.component'
import { formatRelative } from 'date-fns/formatRelative'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'

@Component({
  standalone: true,
  selector: 'xpert-knowledgebase-documents',
  templateUrl: './documents.component.html',
  styleUrls: ['./documents.component.scss'],
  imports: [
    RouterModule,
    FormsModule,
    TranslateModule,
    MaterialModule,
    MatSortModule,
    MatPaginatorModule,
    NgmCommonModule
  ],
  animations: [
    trigger('detailExpand', [
      state('collapsed,void', style({ height: '0px', minHeight: '0' })),
      state('expanded', style({ height: '*' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)'))
    ])
  ]
})
export class KnowledgeDocumentsComponent extends TranslationBaseComponent {
  readonly knowledgeDocumentService = inject(KnowledgeDocumentService)
  readonly _toastrService = inject(ToastrService)
  readonly #store = inject(Store)
  readonly #dialog = inject(MatDialog)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly confirmDelete = injectConfirmDelete()
  readonly #toastr = injectToastr()

  readonly paginator = viewChild(MatPaginator)
  readonly sort = viewChild(MatSort)

  readonly pageSize = model(10)
  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase
  readonly knowledgebase$ = toObservable(this.knowledgebase)

  readonly refresh$ = new BehaviorSubject<boolean>(true)
  readonly delayRefresh$ = new Subject<boolean>()

  columnsToDisplay = [
    {
      name: 'name',
      caption: 'Name'
    },
    {
      name: 'type',
      caption: 'Type'
    },
    {
      name: 'createdAtRelative',
      caption: 'Created At'
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
  readonly data = signal<IKnowledgeDocument[]>([])
  readonly total = signal<number>(0)

  constructor() {
    super()

    afterNextRender(() => {
      // If the user changes the sort order, reset back to the first page.
      this.sort().sortChange.subscribe(() => (this.paginator().pageIndex = 0))

      merge(this.sort().sortChange, this.paginator().page, this.knowledgebase$, this.refresh$)
        .pipe(
          startWith({}),
          debounceTime(100),
          filter(() => !!this.knowledgebase()),
          switchMap(() => {
            this.isLoading.set(true)
            const order = this.sort().active
              ? { [this.sort().active]: this.sort().direction.toUpperCase() }
              : { createdAt: OrderTypeEnum.DESC }
            return this.knowledgeDocumentService!.getAll({
              where: {
                knowledgebaseId: this.knowledgebase().id
              },
              take: this.pageSize(),
              skip: this.paginator().pageIndex,
              relations: ['storageFile', 'pages'],
              order
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
          this.data.set(data.map((item) => ({
            ...item,
            createdAtRelative: formatRelative(new Date(item.updatedAt), new Date(), {
              locale: getDateLocale(this.translateService.currentLang)
            }),
            parserConfig: item.parserConfig ?? {}
          }) as IKnowledgeDocument))
        )
    })

    effect(() => {
      if (this.data()?.some((item) => item.status === 'running')) {
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

  uploadDocuments() {
    this.#router.navigate(['create'], { relativeTo: this.#route })
  }

  deleteDocument(id: string, storageFile: IStorageFile) {
    this.confirmDelete({
      value: id,
      information: storageFile ? `${storageFile.originalName}` : ''
    }, this.knowledgeDocumentService.delete(id))
    .subscribe({
      next: () => {
        this.refresh()
      },
      error: (err) => {
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  updateParserConfig(document: IKnowledgeDocument, config: Partial<IKnowledgeDocument['parserConfig']>) {
    this.knowledgeDocumentService
      .update(document.id, {
        parserConfig: { ...(document.parserConfig ?? {}), ...config } as IKnowledgeDocument['parserConfig']
      })
      .subscribe({
        next: () => {},
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  startParsing(row: IKnowledgeDocument) {
    row.status = 'running'
    this.knowledgeDocumentService.startParsing(row.id).subscribe({
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
      .pipe(switchMap((confirm) => (confirm ? this.knowledgeDocumentService.startParsing(id) : EMPTY)))
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
      .pipe(switchMap((confirm) => (confirm ? this.knowledgeDocumentService.stopParsing(id) : EMPTY)))
      .subscribe({
        next: () => {
          this.refresh()
        },
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }
}
