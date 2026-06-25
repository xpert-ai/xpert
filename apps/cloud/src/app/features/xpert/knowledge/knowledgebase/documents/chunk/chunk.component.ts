import { Component, computed, effect, HostListener, inject, model, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'

import { ActivatedRoute, Router } from '@angular/router'
import { injectConfirmDelete, NgmCommonModule } from '@xpert-ai/ocap-angular/common'
import { effectAction, linkedModel, NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { nonBlank } from '@xpert-ai/ocap-core'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule } from '@ngx-translate/core'
import { KnowledgeChunkComponent, KnowledgeDocIdComponent } from '@cloud/app/@shared/knowledge'
import { NgModelChangeDebouncedDirective } from '@cloud/app/@theme/directives'
import { get } from 'lodash-es'
import { injectParams } from 'ngxtension/inject-params'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { BehaviorSubject, distinctUntilChanged, filter, switchMap, tap } from 'rxjs'
import {
  buildChunkTree,
  getErrorMessage,
  IDocChunkMetadata,
  IKnowledgeDocument,
  IKnowledgeDocumentChunk,
  injectToastr,
  KnowledgeDocumentService,
  STANDARD_METADATA_FIELDS
} from '../../../../../../@core'
import { KnowledgebaseComponent } from '../../knowledgebase.component'
import { CdkMenuModule } from '@angular/cdk/menu'
import { ZardButtonComponent, ZardIconComponent, ZardSwitchComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { CopyComponent } from '@cloud/app/@shared/common'
@Component({
  standalone: true,
  selector: 'xp-knowledge-document-chunk',
  templateUrl: './chunk.component.html',
  styleUrls: ['./chunk.component.scss'],
  imports: [
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    ZardButtonComponent,
    ZardSwitchComponent,
    ...ZardTooltipImports,
    ZardIconComponent,
    WaIntersectionObserver,
    NgmCommonModule,
    NgmI18nPipe,
    NgModelChangeDebouncedDirective,
    KnowledgeDocIdComponent,
    KnowledgeChunkComponent,
    CopyComponent
  ]
})
export class KnowledgeDocumentChunkComponent {
  STANDARD_METADATA_FIELDS = STANDARD_METADATA_FIELDS

  readonly knowledgeDocumentService = inject(KnowledgeDocumentService)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly #toastr = injectToastr()
  readonly paramId = injectParams('id')
  readonly parentId = injectQueryParams('parentId')
  readonly confirmDelete = injectConfirmDelete()

  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase

  readonly documentId = this.paramId
  readonly documentId$ = toObservable(this.paramId)
  readonly refresh$ = new BehaviorSubject<boolean>(true)
  readonly document = toSignal(
    this.refresh$.pipe(
      switchMap(() =>
    this.documentId$.pipe(
      filter(nonBlank),
      switchMap((id) => this.knowledgeDocumentService.getById(id))
    )
  )
    )
  )
  readonly #chunks = signal<IKnowledgeDocumentChunk[]>([])
  readonly chunks = computed(() => buildChunkTree(this.#chunks() ?? []))
  readonly docEnabled = model(false)

  readonly loading = signal(false)
  readonly currentPage = signal(0)
  readonly done = signal(false)
  readonly pageSize = 20
  readonly total = signal(0)

  // Side
  readonly sideExpand = model(false)
  readonly editChunk = signal<IKnowledgeDocumentChunk>(null)
  readonly metadataChunk = signal<IKnowledgeDocumentChunk | null>(null)
  readonly preview = signal(false)

  // Search
  readonly search = model<string>()

  // Metadata schema
  readonly metadataSchema = computed(() => this.knowledgebase()?.metadataSchema || [])
  readonly showMetadata = signal(false)
  readonly editMetadata = signal(false)
  readonly metadata = linkedModel({
    initialValue: null,
    compute: () => this.document()?.metadata || {},
    update: () => {
      //
    }
  })
  readonly lastIncrementalSyncView = computed(() => {
    const sync = this.document()?.metadata?.lastIncrementalSync
    return sync
      ? {
          ...sync,
          processedAtText: this.formatProcessedAt(sync.processedAt)
        }
      : null
  })
  readonly chunkMetadataEntries = computed(() => this.toMetadataEntries(this.metadataChunk()?.metadata))
  readonly chunkMetadataJson = computed(() => this.toJsonText(this.metadataChunk()?.metadata ?? {}))

  constructor() {
    effect(() => {
      if (this.document()) {
        this.docEnabled.set(!this.document().disabled)
      }
    })

    // effect(() => {
    //   console.log(this.editChunk())
    // })
  }

  getValue(row: object | null | undefined, name: string) {
    return row ? get(row, name) : undefined
  }

  refresh() {
    this.refresh$.next(true)
  }

  private handleMutationError(error: { status?: number }) {
    this.#toastr.error(getErrorMessage(error))
    if (error?.status === 409) {
      this.reset()
      this.onIntersection()
      this.refresh()
    }
  }

  close() {
    this.#router.navigate(['..'], { relativeTo: this.#route, queryParams: { parentId: this.parentId() } })
  }

  toggleAllPreview() {
    this.preview.update((state) => !state)
  }

  onSearch(value: string) {
    this.search.set(value)
    this.reset()
    this.onIntersection()
  }

  reset() {
    this.currentPage.set(0)
    this.done.set(false)
    this.#chunks.set([])
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
          this.#chunks.update((chunks) => [...chunks, ...items])
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
      } as IKnowledgeDocumentChunk
    })
  }

  cancelEdit() {
    this.editChunk.set(null)
  }

  openChunkMetadata(chunk: IKnowledgeDocumentChunk) {
    this.editChunk.set(null)
    this.showMetadata.set(false)
    this.metadataChunk.set(chunk)
  }

  closeChunkMetadata() {
    this.metadataChunk.set(null)
  }

  saveEdit() {
    this.loading.set(true)
    if (this.editChunk().id) {
      this.knowledgeDocumentService
        .updateChunk(this.documentId(), this.editChunk().id, {
          metadata: this.editChunk().metadata,
          pageContent: this.editChunk().pageContent,
          version: this.editChunk().version
        })
        .subscribe({
          next: () => {
            this.loading.set(false)
            this.reset()
            this.onIntersection()
            this.refresh()
            this.cancelEdit()
          },
          error: (error) => {
            this.loading.set(false)
            this.handleMutationError(error)
          }
        })
    } else {
      this.knowledgeDocumentService.createChunk(this.documentId(), this.editChunk()).subscribe({
        next: () => {
          this.loading.set(false)
          this.reset()
          this.onIntersection()
          this.cancelEdit()
          this.refresh()
        },
        error: (error) => {
          this.loading.set(false)
          this.handleMutationError(error)
        }
      })
    }
  }

  enableChunk(chunk: IKnowledgeDocumentChunk, event: boolean) {
    this.loading.set(true)
    this.knowledgeDocumentService
      .updateChunk(this.documentId(), chunk.id, {
        metadata: { enabled: event } as IDocChunkMetadata,
        version: chunk.version
      })
      .subscribe({
        next: () => {
          this.loading.set(false)
          this.reset()
          this.onIntersection()
          this.refresh()
        },
        error: (error) => {
          this.loading.set(false)
          this.handleMutationError(error)
        }
      })
  }

  addChunk() {
    this.editChunk.set({} as IKnowledgeDocumentChunk)
  }

  deleteChunk(chunk: IKnowledgeDocumentChunk) {
    this.confirmDelete(
      {
        value: chunk.id,
        information: chunk.pageContent.substring(0, 100)
      },
      this.knowledgeDocumentService.deleteChunk(this.documentId(), chunk.id, chunk.version)
    ).subscribe({
      next: () => {
        this.#chunks.update((items) => items.filter((item) => item.id !== chunk.id))
        this.total.update((total) => total - 1)
        this.refresh()
      },
      error: (error) => {
        this.handleMutationError(error)
      }
    })
  }

  updateDoc(entity: Partial<IKnowledgeDocument>) {
    this.loading.set(true)
    this.knowledgeDocumentService
      .update(this.document().id, { ...entity, version: entity.version ?? this.document().version })
      .subscribe({
      next: () => {
        this.loading.set(false)
          this.refresh()
      },
      error: (error) => {
        this.loading.set(false)
          this.handleMutationError(error)
      }
    })
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.cancelEdit()
      this.closeChunkMetadata()
    } else if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault()
      this.saveEdit()
    }
  }

  // Metadata options
  toggleShowMetadata() {
    this.closeChunkMetadata()
    this.showMetadata.update((state) => !state)
  }

  toggleEditMetadata() {
    this.editMetadata.update((state) => !state)
  }

  updateMetadata(name: string, value: string) {
    this.metadata.update((meta) => ({
      ...meta,
      [name]: value
    }))
  }

  saveMetadata() {
    this.loading.set(true)
    this.knowledgeDocumentService
      .update(this.document().id, {
        metadata: this.metadata(),
        version: this.document().version
      })
      .subscribe({
        next: () => {
          this.loading.set(false)
          this.editMetadata.set(false)
          this.refresh()
        },
        error: (error) => {
          this.loading.set(false)
          this.handleMutationError(error)
        }
      })
  }

  private toMetadataEntries(metadata: IKnowledgeDocumentChunk['metadata'] | null | undefined) {
    return Object.entries(metadata ?? {})
      .filter(([, value]) => value !== undefined)
      .sort(
        ([left], [right]) => this.metadataFieldRank(left) - this.metadataFieldRank(right) || left.localeCompare(right)
      )
      .map(([key, value]) => ({
        key,
        value: this.formatMetadataValue(value)
      }))
  }

  private metadataFieldRank(key: string) {
    const order = [
      'chunkId',
      'parentId',
      'documentId',
      'knowledgeId',
      'enabled',
      'mediaType',
      'isVector',
      'tokens',
      'score',
      'relevanceScore',
      'writeKey',
      'title',
      'source',
      'documentType'
    ]
    const index = order.indexOf(key)
    return index === -1 ? order.length : index
  }

  private formatMetadataValue(value: unknown) {
    if (value === null) {
      return 'null'
    }
    if (typeof value === 'string') {
      return value
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value)
    }
    return this.toJsonText(value)
  }

  private formatProcessedAt(value: string | null | undefined) {
    if (!value) {
      return '-'
    }

    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
  }

  private toJsonText(value: unknown) {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
}
