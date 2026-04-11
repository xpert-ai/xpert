import { animate, state, style, transition, trigger } from '@angular/animations'
import { afterNextRender, Component, effect, inject, model, signal, viewChild } from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { ZardDialogService, ZardPaginatorComponent, ZardProgressCircleComponent, type ZardTableSortDirection } from '@xpert-ai/headless-ui'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import {
  NgmCommonModule,
  NgmConfirmDeleteService,
  NgmCountdownConfirmationComponent
} from '@xpert-ai/ocap-angular/common'
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
  IKnowledgeDocument,
  IStorageFile,
  KnowledgeDocumentService,
  OrderTypeEnum,
  Store,
  ToastrService
} from '../../../../../@core'
import { KnowledgebaseComponent } from '../knowledgebase.component'
import { formatRelative } from 'date-fns/formatRelative'
import { FilesUploadDialogComponent } from 'apps/cloud/src/app/@shared/files'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { SharedUiModule } from 'apps/cloud/src/app/@shared/ui.module'

/**
 * @deprecated use xpert's Knowledges
 */
@Component({
  standalone: true,
  selector: 'pac-settings-knowledgebase-documents',
  templateUrl: './documents.component.html',
  styleUrls: ['./documents.component.scss'],
  imports: [
    RouterModule,
    FormsModule,
    TranslateModule,
    SharedUiModule,
    ZardPaginatorComponent,
    ZardProgressCircleComponent,
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
  readonly #dialog = inject(ZardDialogService)
  readonly #confirmDelete = inject(NgmConfirmDeleteService)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)

  readonly paginator = viewChild(ZardPaginatorComponent)

  readonly pageSize = model(10)
  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase
  readonly knowledgebase$ = toObservable(this.knowledgebase)
  readonly sortState = signal<{ active: string; direction: ZardTableSortDirection }>({
    active: 'createdAt',
    direction: 'desc'
  })

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
      merge(toObservable(this.sortState), this.paginator().page, this.knowledgebase$, this.refresh$)
        .pipe(
          startWith({}),
          debounceTime(100),
          filter(() => !!this.knowledgebase()),
          switchMap(() => {
            this.isLoading.set(true)
            const sortState = this.sortState()
            const order = sortState.active
              ? { [sortState.active]: sortState.direction.toUpperCase() }
              : { createdAt: OrderTypeEnum.DESC }
            return this.knowledgeDocumentService!.getAll({
              where: {
                knowledgebaseId: this.knowledgebase().id
              },
              take: this.pageSize(),
              skip: this.paginator().pageIndex * this.pageSize(),
              relations: ['storageFile'],
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

  onSortChange(columnName: string, direction: ZardTableSortDirection) {
    const nextDirection = direction || 'desc'
    this.sortState.set({
      active: columnName === 'createdAtRelative' ? 'createdAt' : columnName,
      direction: nextDirection
    })
    this.paginator().pageIndex = 0
  }

  sortDirection(columnName: string): ZardTableSortDirection {
    const targetColumn = columnName === 'createdAtRelative' ? 'createdAt' : columnName
    return this.sortState().active === targetColumn ? this.sortState().direction : ''
  }

  uploadDocuments() {
    this.#dialog
      .open(FilesUploadDialogComponent, {
        panelClass: 'medium',
        data: {}
      })
      .afterClosed()
      .pipe(
        switchMap((files: IStorageFile[]) =>
          files
            ? this.knowledgeDocumentService.createBulk(
                files.map((file) => ({
                  knowledgebaseId: this.knowledgebase().id,
                  storageFileId: file.id
                }))
              )
            : EMPTY
        )
      )
      .subscribe({
        next: (files: IKnowledgeDocument[]) => {
          this.refresh()
        },
        error: (err) => {}
      })
  }

  deleteDocument(id: string, storageFile: IStorageFile) {
    this.#confirmDelete
      .confirm({
        value: id,
        information: `${storageFile.originalName}`
      })
      .pipe(switchMap((confirm) => (confirm ? this.knowledgeDocumentService.delete(id) : EMPTY)))
      .subscribe({
        next: () => {
          this.refresh()
        },
        error: (err) => {}
      })
  }

  updateParserConfig(document: IKnowledgeDocument, config: Partial<IKnowledgeDocument['parserConfig']>) {
    this.knowledgeDocumentService
      .update(document.id, {
        parserConfig: { ...(document.parserConfig ?? {}), ...config } as IKnowledgeDocument['parserConfig']
      })
      .subscribe({
        next: () => {},
        error: (err) => {}
      })
  }

  startParsing(row: IKnowledgeDocument) {
    row.status = 'running'
    this.knowledgeDocumentService.startParsing(row.id).subscribe({
      next: () => {
        this.refresh()
      },
      error: (err) => {}
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
        error: (err) => {}
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
        error: (err) => {}
      })
  }
}
