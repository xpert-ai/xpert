import { Component, effect, HostListener, inject, model, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { effectAction } from '@metad/ocap-angular/core'
import { nonBlank } from '@metad/ocap-core'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule } from '@ngx-translate/core'
import { KnowledgeChunkComponent, KnowledgeDocIdComponent } from 'apps/cloud/src/app/@shared/knowledge'
import { NgModelChangeDebouncedDirective } from 'apps/cloud/src/app/@theme/directives'
import { get } from 'lodash-es'
import { injectParams } from 'ngxtension/inject-params'
import { BehaviorSubject, distinctUntilChanged, filter, switchMap, tap } from 'rxjs'
import {
  getErrorMessage,
  IDocumentChunk,
  IKnowledgeDocument,
  injectToastr,
  KnowledgeDocumentService
} from '../../../../../../@core'
import { KnowledgebaseComponent } from '../../knowledgebase.component'
import { injectQueryParams } from 'ngxtension/inject-query-params'

@Component({
  standalone: true,
  selector: 'xpert-knowledge-document-chunk',
  templateUrl: './chunk.component.html',
  styleUrls: ['./chunk.component.scss'],
  imports: [
    FormsModule,
    TranslateModule,
    MatButtonModule,
    MatTooltipModule,
    MatIconModule,
    WaIntersectionObserver,
    NgmCommonModule,
    NgModelChangeDebouncedDirective,
    KnowledgeDocIdComponent,
    KnowledgeChunkComponent
  ]
})
export class KnowledgeDocumentChunkComponent {
  readonly knowledgeDocumentService = inject(KnowledgeDocumentService)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly #toastr = injectToastr()
  readonly paramId = injectParams('id')
  readonly parentId = injectQueryParams('parentId')

  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase

  readonly documentId = this.paramId
  readonly documentId$ = toObservable(this.paramId)
  readonly document = toSignal(
    this.documentId$.pipe(
      filter(nonBlank),
      switchMap((id) => this.knowledgeDocumentService.getById(id))
    )
  )
  readonly refresh$ = new BehaviorSubject<boolean>(true)
  readonly chunks = signal<IDocumentChunk[]>([])
  readonly docEnabled = model(false)

  readonly loading = signal(false)
  readonly currentPage = signal(0)
  readonly done = signal(false)
  readonly pageSize = 20
  readonly total = signal(0)

  // Side
  readonly sideExpand = model(false)
  readonly editChunk = signal<IDocumentChunk>(null)

  // Search
  readonly search = model<string>()

  constructor() {
    effect(
      () => {
        if (this.document()) {
          this.docEnabled.set(!this.document().disabled)
        }
      },
      { allowSignalWrites: true }
    )
  }

  getValue(row: any, name: string) {
    return get(row, name)
  }

  refresh() {
    this.refresh$.next(true)
  }

  close() {
    this.#router.navigate(['..'], { relativeTo: this.#route, queryParams: { parentId: this.parentId() } })
  }

  deleteChunk(chunk: IDocumentChunk) {
    this.knowledgeDocumentService.deleteChunk(chunk.metadata.knowledgeId, chunk.id).subscribe({
      next: () => {
        this.chunks.update((items) => items.filter((item) => item.id !== chunk.id))
      },
      error: (error) => {
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  onSearch(value: string) {
    this.search.set(value)
    this.reset()
    this.onIntersection()
  }

  reset() {
    this.currentPage.set(0)
    this.done.set(false)
    this.chunks.set([])
  }

  loadMore = effectAction((origin$) => {
    return origin$.pipe(
      switchMap(() => this.documentId$.pipe(distinctUntilChanged(), filter(nonBlank))),
      switchMap((id) => {
        this.loading.set(true)
        return this.knowledgeDocumentService.getChunks(id, {
          take: this.pageSize,
          skip: this.currentPage() * this.pageSize,
          search: this.search()?.trim()
        })
      }),
      tap({
        next: ({ items, total }) => {
          this.total.set(total)
          this.chunks.update((chunks) => [...chunks, ...items])
          this.currentPage.update((state) => ++state)
          if (items.length < this.pageSize || this.currentPage() * this.pageSize >= total) {
            this.done.set(true)
          }
          this.loading.set(false)
        },
        error: (err) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
    )
  })

  onIntersection() {
    if (!this.loading() && !this.done()) {
      this.loadMore()
    }
  }

  updateChunk(event: string) {
    this.editChunk.update((state) => {
      return {
        ...state,
        pageContent: event
      } as IDocumentChunk
    })
  }

  cancelEdit() {
    this.editChunk.set(null)
  }

  saveEdit() {
    this.loading.set(true)
    if (this.editChunk().id) {
      this.knowledgeDocumentService
        .updateChunk(this.documentId(), this.editChunk().id, {
          metadata: this.editChunk().metadata,
          pageContent: this.editChunk().pageContent
        })
        .subscribe({
          next: () => {
            this.loading.set(false)
            this.chunks.update((chunks) => {
              return chunks.map((_) => {
                if (_.id === this.editChunk().id) {
                  return {
                    ..._,
                    ...this.editChunk()
                  }
                }
                return _
              })
            })
            this.cancelEdit()
          },
          error: (error) => {
            this.loading.set(false)
            this.#toastr.error(getErrorMessage(error))
          }
        })
    } else {
      this.knowledgeDocumentService.createChunk(this.documentId(), this.editChunk()).subscribe({
        next: () => {
          this.loading.set(false)
          this.reset()
          this.onIntersection()
          this.cancelEdit()
        },
        error: (error) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
      })
    }
  }

  enableChunk(chunk: IDocumentChunk, event: boolean) {
    this.loading.set(true)
    this.knowledgeDocumentService.updateChunk(this.documentId(), chunk.id, { metadata: { enabled: event } }).subscribe({
      next: () => {
        this.loading.set(false)
        this.chunks.update((chunks) => {
          return chunks.map((_) => {
            if (_.id === chunk.id) {
              return {
                ..._,
                metadata: {
                  ..._.metadata,
                  enabled: event
                }
              }
            }
            return _
          })
        })
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  addChunk() {
    this.editChunk.set({} as IDocumentChunk)
  }

  updateDoc(entity: Partial<IKnowledgeDocument>) {
    this.loading.set(true)
    this.knowledgeDocumentService.update(this.document().id, entity).subscribe({
      next: () => {
        this.loading.set(false)
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.cancelEdit()
    } else if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault()
      this.saveEdit()
    }
  }
}
