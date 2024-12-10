import { Component, inject, signal } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { ActivatedRoute, Router } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { effectAction } from '@metad/ocap-angular/core'
import { nonBlank } from '@metad/ocap-core'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule } from '@ngx-translate/core'
import { get } from 'lodash-es'
import { injectParams } from 'ngxtension/inject-params'
import { BehaviorSubject, distinctUntilChanged, filter, switchMap, tap } from 'rxjs'
import {
  getErrorMessage,
  IDocumentChunk,
  KnowledgeDocumentService,
  Store,
  ToastrService
} from '../../../../../../@core'
import { KnowledgebaseComponent } from '../../knowledgebase.component'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'

@Component({
  standalone: true,
  selector: 'pac-settings-knowledgebase-document-chunk',
  templateUrl: './chunk.component.html',
  styleUrls: ['./chunk.component.scss'],
  imports: [FormsModule, TranslateModule, MaterialModule, WaIntersectionObserver, NgmCommonModule]
})
export class KnowledgeDocumentChunkComponent extends TranslationBaseComponent {
  readonly knowledgeDocumentService = inject(KnowledgeDocumentService)
  readonly _toastrService = inject(ToastrService)
  readonly #store = inject(Store)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly #dialog = inject(MatDialog)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly paramId = injectParams('id')

  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase

  readonly documentId$ = toObservable(this.paramId)
  readonly refresh$ = new BehaviorSubject<boolean>(true)
  readonly chunks = signal<IDocumentChunk[]>([])

  readonly loading = signal(false)
  readonly currentPage = signal(0)
  readonly done = signal(false)
  readonly pageSize = 20
  readonly total = signal(0)

  // constructor() {
  //   super()
  //   toObservable(this.paramId)
  //     .pipe(
  //       distinctUntilChanged(),
  //       filter(nonBlank),
  //       switchMap((id) => (id ? this.knowledgeDocumentService.getChunks(id, ) : of(null))),
  //       takeUntilDestroyed()
  //     )
  //     .subscribe((chunks) => this.chunks.set(chunks))
  // }

  getValue(row: any, name: string) {
    return get(row, name)
  }

  refresh() {
    this.refresh$.next(true)
  }

  close() {
    this.#router.navigate(['..'], { relativeTo: this.#route })
  }

  deleteChunk(chunk: IDocumentChunk) {
    this.knowledgeDocumentService.deleteChunk(chunk.metadata.knowledgeId, chunk.id).subscribe({
      next: () => {
        this.chunks.update((items) => items.filter((item) => item.id !== chunk.id))
      },
      error: (error) => {
        this._toastrService.error(getErrorMessage(error))
      }
    })
  }

  loadMore = effectAction((origin$) => {
    return origin$.pipe(
      switchMap(() => this.documentId$.pipe(distinctUntilChanged(), filter(nonBlank))),
      switchMap((id) => {
        this.loading.set(true)
        return this.knowledgeDocumentService.getChunks(id, {
          take: this.pageSize,
          skip: this.currentPage() * this.pageSize
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
        }
      })
    )
  })

  onIntersection() {
    if (!this.loading() && !this.done()) {
      this.loadMore()
    }
  }
}
