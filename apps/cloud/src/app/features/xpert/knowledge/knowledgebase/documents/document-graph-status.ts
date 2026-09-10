import { computed, inject, Signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import {
  catchError,
  distinctUntilChanged,
  exhaustMap,
  from,
  map,
  mergeMap,
  of,
  startWith,
  switchMap,
  take,
  timer
} from 'rxjs'
import {
  KNOWLEDGE_GRAPH_DOCUMENT_STATUS_BATCH_SIZE,
  IKnowledgebase,
  IKnowledgeDocument,
  KDocumentSourceType,
  KnowledgeGraphDocumentProgress,
  KnowledgebaseService
} from '../../../../../@core'

export type DocumentGraphProgressSnapshot = { progress: KnowledgeGraphDocumentProgress | null | undefined }
type CachedProgress = { key: string; checkedAt: number; snapshot: DocumentGraphProgressSnapshot }
const ACTIVE_POLL_MS = 5000
const SETTLED_POLL_MS = 30000
const ACTIVE_STATES = new Set(['queued', 'running', 'waiting_source'])
const LOADING_SNAPSHOT: DocumentGraphProgressSnapshot = { progress: undefined }

/** The table and inspector share document progress, independently of the aggregate job history. */
export function injectDocumentGraphProgress(
  knowledgebase: Signal<IKnowledgebase>,
  documents: Signal<IKnowledgeDocument[]>,
  selectedDocument?: Signal<IKnowledgeDocument | null>,
  refresh?: Signal<number>
) {
  const api = inject(KnowledgebaseService)
  const request = computed(() => {
    const kb = knowledgebase()
    const selected = selectedDocument?.()
    const sources = new Map([...(selected ? [selected] : []), ...documents()].map((doc) => [doc.id, doc]))
    const context = [kb?.id, kb?.graphRag?.enabled, kb?.graphRevision, kb?.graphStatus, refresh?.()]
    const entries = kb?.graphRag?.enabled
      ? [...sources.values()]
          .filter((doc) => doc.id && doc.sourceType !== KDocumentSourceType.FOLDER)
          .map((doc) => ({
            id: doc.id,
            key: JSON.stringify([
              ...context,
              doc.id,
              doc.version,
              doc.updatedAt,
              doc.status,
              doc.disabled,
              doc.contentHash,
              doc.publicationEpoch
            ])
          }))
          .sort((left, right) => left.id.localeCompare(right.id))
      : []
    return { knowledgebaseId: kb?.id, entries, key: JSON.stringify([context, entries]) }
  })
  let cache = new Map<string, CachedProgress>()
  const result = toSignal(
    toObservable(request).pipe(
      distinctUntilChanged((left, right) => left.key === right.key),
      switchMap(({ knowledgebaseId, entries }) => {
        cache = new Map(
          entries.flatMap(({ id, key }) => {
            const cached = cache.get(id)
            return cached?.key === key ? [[id, cached]] : []
          })
        )
        if (!knowledgebaseId || !entries.length) return of(cache)
        return timer(0, ACTIVE_POLL_MS).pipe(
          exhaustMap(() => {
            const targets = entries.filter(({ id }) => {
              const cached = cache.get(id)
              const state = cached?.snapshot.progress?.state
              const interval = !state || ACTIVE_STATES.has(state) ? ACTIVE_POLL_MS : SETTLED_POLL_MS
              return !cached || Date.now() - cached.checkedAt >= interval
            })
            const batches: (typeof entries)[] = []
            for (let index = 0; index < targets.length; index += KNOWLEDGE_GRAPH_DOCUMENT_STATUS_BATCH_SIZE) {
              batches.push(targets.slice(index, index + KNOWLEDGE_GRAPH_DOCUMENT_STATUS_BATCH_SIZE))
            }
            return from(batches).pipe(
              mergeMap((batch) => {
                const checkedAt = Date.now()
                return api
                  .getGraphDocumentsProgress(
                    knowledgebaseId,
                    batch.map(({ id }) => id)
                  )
                  .pipe(
                    take(1),
                    catchError(() => of(null)),
                    map((response) => {
                      const progress = new Map(response?.documents.map((item) => [item.documentId, item]) ?? [])
                      cache = new Map(cache)
                      for (const { id, key } of batch) {
                        cache.set(id, { key, checkedAt, snapshot: { progress: progress.get(id) ?? null } })
                      }
                      return cache
                    })
                  )
              }, 2)
            )
          }),
          startWith(cache)
        )
      })
    )
  )
  return computed(() => {
    const response = result()
    return new Map(
      request().entries.map(({ id, key }) => {
        const cached = response?.get(id)
        return [id, cached?.key === key ? cached.snapshot : LOADING_SNAPSHOT]
      })
    )
  })
}
