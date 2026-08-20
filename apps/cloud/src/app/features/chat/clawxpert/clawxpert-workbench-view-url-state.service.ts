import { Injectable, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router, UrlTree } from '@angular/router'
import type { XpertViewQuery } from '@xpert-ai/contracts'
import { filter } from 'rxjs'

export const CLAWXPERT_WORKBENCH_VIEW_QUERY_PARAM = 'view'
/** Selected business record within the active extension view. */
export const CLAWXPERT_WORKBENCH_VIEW_SELECTION_QUERY_PARAM = 'viewSelection'
/** JSON-encoded, typed extension-view parameters used for refresh recovery. */
export const CLAWXPERT_WORKBENCH_VIEW_PARAMETERS_QUERY_PARAM = 'viewParameters'

@Injectable({ providedIn: 'root' })
export class ClawXpertWorkbenchViewUrlState {
  readonly #router = inject(Router)
  readonly #viewKey = signal(readWorkbenchViewKey(this.#router, this.#router.url))
  readonly #viewQuery = signal(readWorkbenchViewQuery(this.#router, this.#router.url))
  #pendingViewKey: string | null | undefined
  #navigationVersion = 0

  readonly viewKey = this.#viewKey.asReadonly()
  /** Selection and parameters associated with the active extension view. */
  readonly viewQuery = this.#viewQuery.asReadonly()

  constructor() {
    this.#router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => {
        this.#pendingViewKey = undefined
        this.#viewKey.set(readWorkbenchViewKey(this.#router, this.#router.url))
        this.#viewQuery.set(readWorkbenchViewQuery(this.#router, this.#router.url))
      })
  }

  setViewKey(viewKey: string | null, options: { replaceUrl?: boolean } = {}) {
    const normalizedViewKey = normalizeWorkbenchViewKey(viewKey)
    return this.setViewState(
      normalizedViewKey,
      normalizedViewKey && normalizedViewKey === this.#viewKey() ? this.#viewQuery() : null,
      options
    )
  }

  /** Atomically persists the active view and its selection/query state in the URL. */
  setViewState(viewKey: string | null, query: XpertViewQuery | null, options: { replaceUrl?: boolean } = {}) {
    const normalizedViewKey = normalizeWorkbenchViewKey(viewKey)
    const normalizedQuery = normalizedViewKey ? normalizeWorkbenchViewQuery(query) : null
    const currentTree = this.#router.parseUrl(this.#router.url)
    const currentViewKey = normalizeQueryParamValue(currentTree.queryParams[CLAWXPERT_WORKBENCH_VIEW_QUERY_PARAM])
    const currentQuery = readWorkbenchViewQueryFromTree(currentTree)

    if (
      this.#viewKey() === normalizedViewKey &&
      (currentViewKey === normalizedViewKey || this.#pendingViewKey === normalizedViewKey) &&
      equalWorkbenchViewQuery(currentQuery, normalizedQuery)
    ) {
      return Promise.resolve(true)
    }

    const queryParams = { ...currentTree.queryParams }
    if (normalizedViewKey) {
      queryParams[CLAWXPERT_WORKBENCH_VIEW_QUERY_PARAM] = normalizedViewKey
    } else {
      delete queryParams[CLAWXPERT_WORKBENCH_VIEW_QUERY_PARAM]
    }
    if (normalizedQuery?.selectionId) {
      queryParams[CLAWXPERT_WORKBENCH_VIEW_SELECTION_QUERY_PARAM] = normalizedQuery.selectionId
    } else {
      delete queryParams[CLAWXPERT_WORKBENCH_VIEW_SELECTION_QUERY_PARAM]
    }
    if (normalizedQuery?.parameters && Object.keys(normalizedQuery.parameters).length > 0) {
      queryParams[CLAWXPERT_WORKBENCH_VIEW_PARAMETERS_QUERY_PARAM] = JSON.stringify(normalizedQuery.parameters)
    } else {
      delete queryParams[CLAWXPERT_WORKBENCH_VIEW_PARAMETERS_QUERY_PARAM]
    }

    const navigationVersion = ++this.#navigationVersion
    this.#pendingViewKey = normalizedViewKey
    this.#viewKey.set(normalizedViewKey)
    this.#viewQuery.set(normalizedQuery)

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
        this.#viewQuery.set(readWorkbenchViewQuery(this.#router, this.#router.url))
      })
  }
}

function readWorkbenchViewKey(router: Router, url: string) {
  return normalizeQueryParamValue(router.parseUrl(url).queryParams[CLAWXPERT_WORKBENCH_VIEW_QUERY_PARAM])
}

/** Read the extension-view query state from a router URL. */
function readWorkbenchViewQuery(router: Router, url: string) {
  return readWorkbenchViewQueryFromTree(router.parseUrl(url))
}

/** Decode normalized selection and parameter state from a parsed URL tree. */
function readWorkbenchViewQueryFromTree(tree: UrlTree): XpertViewQuery | null {
  const selectionId = normalizeQueryParamValue(tree.queryParams[CLAWXPERT_WORKBENCH_VIEW_SELECTION_QUERY_PARAM])
  const parameters = parseParameters(tree.queryParams[CLAWXPERT_WORKBENCH_VIEW_PARAMETERS_QUERY_PARAM])
  return normalizeWorkbenchViewQuery({ ...(selectionId ? { selectionId } : {}), ...(parameters ? { parameters } : {}) })
}

/** Parse only object-shaped JSON; malformed or array values are ignored at the URL boundary. */
function parseParameters(value: unknown): XpertViewQuery['parameters'] | null {
  const text = Array.isArray(value) ? value[0] : value
  if (typeof text !== 'string' || !text.trim()) return null
  try {
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as XpertViewQuery['parameters']
  } catch {
    return null
  }
}

/** Collapse empty view state to null so URL equality remains deterministic. */
function normalizeWorkbenchViewQuery(query: XpertViewQuery | null | undefined): XpertViewQuery | null {
  const selectionId = query?.selectionId?.trim()
  const parameters = query?.parameters && Object.keys(query.parameters).length > 0 ? query.parameters : undefined
  return selectionId || parameters
    ? { ...(selectionId ? { selectionId } : {}), ...(parameters ? { parameters } : {}) }
    : null
}

/** View queries contain JSON-safe scalars, so stable construction order is sufficient here. */
function equalWorkbenchViewQuery(left: XpertViewQuery | null, right: XpertViewQuery | null) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function normalizeQueryParamValue(value: unknown) {
  return normalizeWorkbenchViewKey(Array.isArray(value) ? value[0] : typeof value === 'string' ? value : null)
}

function normalizeWorkbenchViewKey(value: string | null | undefined) {
  return value?.trim() || null
}
