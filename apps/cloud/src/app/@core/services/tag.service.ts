import { inject, Injectable } from '@angular/core'
import { ITag, OrganizationBaseCrudService, TagTarget } from '@cloud/app/@core/state'
import { BehaviorSubject, combineLatest, Observable, of } from 'rxjs'
import { getTagTargets, ITagDirectoryItem } from '@xpert-ai/contracts'
import { catchError, distinctUntilChanged, map, shareReplay, startWith, switchMap } from 'rxjs/operators'
import { API_TAG } from '../constants/app.constants'
import { toSignal } from '@angular/core/rxjs-interop'
import { getErrorMessage } from '../types'

export interface TagCatalogState {
  tags: ITag[]
  loading: boolean
  error: string | null
}

const loadingCatalog: TagCatalogState = { tags: [], loading: true, error: null }

@Injectable({ providedIn: 'root' })
export class TagService extends OrganizationBaseCrudService<ITag> {
  readonly refresh$ = new BehaviorSubject<void>(undefined)
  // Catch each request so refresh and scope changes remain subscribed after a failure.
  readonly #catalog$ = combineLatest([
    this.refresh$,
    this.store.selectActiveScope().pipe(distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)))
  ]).pipe(
    switchMap(() =>
      this.getAll().pipe(
        map(({ items }): TagCatalogState => ({ tags: items, loading: false, error: null })),
        catchError((error: unknown) =>
          of<TagCatalogState>({ tags: [], loading: false, error: getErrorMessage(error) || 'Unable to load tags.' })
        ),
        startWith(loadingCatalog)
      )
    ),
    shareReplay({ bufferSize: 1, refCount: true })
  )

  constructor() {
    super(API_TAG)
  }

  refresh() {
    this.refresh$.next()
  }

  getCatalogState(): Observable<TagCatalogState> {
    return this.#catalog$
  }

  getAllCategories() {
    return this.#catalog$.pipe(
      map(({ tags }) => [...new Set(tags.map((tag) => tag.category).filter(Boolean))].map((category) => ({ category })))
    )
  }

  getAllByCategory(category?: TagTarget) {
    return this.getCatalogByCategory(category).pipe(map((tags) => tags.filter((tag) => tag.isActive !== false)))
  }

  /** Include inactive definitions so existing selections can display their current status. */
  getCatalogByCategory(category?: TagTarget): Observable<ITag[]> {
    return this.#catalog$.pipe(
      map(({ tags }) => tags.filter((tag) => !category || getTagTargets(tag).includes(category)))
    )
  }

  getDirectory() {
    return this.httpClient.get<ITagDirectoryItem[]>(this.apiBaseUrl + '/directory')
  }
}

export function injectTags(category: TagTarget) {
  return toSignal(inject(TagService).getAllByCategory(category), { initialValue: [] })
}
