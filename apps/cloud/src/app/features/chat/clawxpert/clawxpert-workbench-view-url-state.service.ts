import { Injectable, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router, UrlTree } from '@angular/router'
import { filter } from 'rxjs'

export const CLAWXPERT_WORKBENCH_VIEW_QUERY_PARAM = 'view'

@Injectable({ providedIn: 'root' })
export class ClawXpertWorkbenchViewUrlState {
  readonly #router = inject(Router)
  readonly #viewKey = signal(readWorkbenchViewKey(this.#router, this.#router.url))
  #pendingViewKey: string | null | undefined
  #navigationVersion = 0

  readonly viewKey = this.#viewKey.asReadonly()

  constructor() {
    this.#router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => {
        this.#pendingViewKey = undefined
        this.#viewKey.set(readWorkbenchViewKey(this.#router, this.#router.url))
      })
  }

  setViewKey(viewKey: string | null, options: { replaceUrl?: boolean } = {}) {
    const normalizedViewKey = normalizeWorkbenchViewKey(viewKey)
    const currentTree = this.#router.parseUrl(this.#router.url)
    const currentViewKey = normalizeQueryParamValue(currentTree.queryParams[CLAWXPERT_WORKBENCH_VIEW_QUERY_PARAM])

    if (
      this.#viewKey() === normalizedViewKey &&
      (currentViewKey === normalizedViewKey || this.#pendingViewKey === normalizedViewKey)
    ) {
      return Promise.resolve(true)
    }

    const queryParams = { ...currentTree.queryParams }
    if (normalizedViewKey) {
      queryParams[CLAWXPERT_WORKBENCH_VIEW_QUERY_PARAM] = normalizedViewKey
    } else {
      delete queryParams[CLAWXPERT_WORKBENCH_VIEW_QUERY_PARAM]
    }

    const navigationVersion = ++this.#navigationVersion
    this.#pendingViewKey = normalizedViewKey
    this.#viewKey.set(normalizedViewKey)

    return this.#router
      .navigateByUrl(new UrlTree(currentTree.root, queryParams, currentTree.fragment), {
        replaceUrl: options.replaceUrl ?? false
      })
      .finally(() => {
        if (navigationVersion !== this.#navigationVersion) {
          return
        }

        this.#pendingViewKey = undefined
        this.#viewKey.set(readWorkbenchViewKey(this.#router, this.#router.url))
      })
  }
}

function readWorkbenchViewKey(router: Router, url: string) {
  return normalizeQueryParamValue(router.parseUrl(url).queryParams[CLAWXPERT_WORKBENCH_VIEW_QUERY_PARAM])
}

function normalizeQueryParamValue(value: unknown) {
  return normalizeWorkbenchViewKey(Array.isArray(value) ? value[0] : typeof value === 'string' ? value : null)
}

function normalizeWorkbenchViewKey(value: string | null | undefined) {
  return value?.trim() || null
}
