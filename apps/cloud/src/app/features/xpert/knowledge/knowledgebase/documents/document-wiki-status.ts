import { computed, inject, Signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { catchError, distinctUntilChanged, exhaustMap, map, merge, of, startWith, switchMap, take, timer } from 'rxjs'
import {
  IKnowledgebase,
  IKnowledgeDocument,
  isDocumentKnowledgebaseType,
  KDocumentSourceType,
  KNOWLEDGE_WIKI_DOCUMENT_STATUS_BATCH_SIZE,
  KnowledgeWikiDocumentProgress,
  KnowledgeWikiService
} from '../../../../../@core'

type CachedProgress = { key: string; progress: KnowledgeWikiDocumentProgress | undefined }

export function injectDocumentWikiProgress(
  knowledgebase: Signal<IKnowledgebase>,
  documents: Signal<IKnowledgeDocument[]>,
  selectedDocument?: Signal<IKnowledgeDocument | null>
) {
  const api = inject(KnowledgeWikiService)
  const sources = computed(() => {
    const selected = selectedDocument?.()
    // Folder browsing can select a file that is not in the current table page.
    // The table's refreshed source must win over an older selection snapshot.
    return [...new Map([...(selected ? [selected] : []), ...documents()].map((doc) => [doc.id, doc])).values()]
  })
  const request = computed(() => {
    const kb = knowledgebase()
    const context = [kb?.id, kb?.wikiConfig?.enabled, kb?.type]
    const entries =
      kb?.wikiConfig?.enabled && isDocumentKnowledgebaseType(kb.type)
        ? sources()
            .filter((document) => document.id && document.sourceType !== KDocumentSourceType.FOLDER)
            .map((doc) => ({
              id: doc.id,
              key: JSON.stringify([...context, doc.id, doc.version, doc.updatedAt, doc.status, doc.disabled])
            }))
            .sort((left, right) => left.id.localeCompare(right.id))
        : []
    return {
      id: kb?.id,
      entries,
      availability: kb?.wikiAvailability,
      key: JSON.stringify([context, kb?.wikiAvailability, entries])
    }
  })
  let cache = new Map<string, CachedProgress>()
  let availability: IKnowledgebase['wikiAvailability']
  const result = toSignal(
    toObservable(request).pipe(
      distinctUntilChanged((left, right) => left.key === right.key),
      switchMap((current) => {
        const { id, entries } = current
        // Retain only unchanged sources in this knowledgebase; snapshots are never mutated after emission.
        cache = new Map(
          entries.flatMap(({ id, key }) => {
            const cached = cache.get(id)
            return cached?.key === key ? [[id, cached]] : []
          })
        )
        const refreshAll = availability !== current.availability
        availability = current.availability
        if (!id || !entries.length) return of(cache)
        const changed = entries.filter((entry) => refreshAll || !cache.has(entry.id))
        return timer(0, 5000).pipe(
          exhaustMap((tick) => {
            // Source changes refresh just the affected rows; periodic polling still batches all visible rows.
            const targets = tick === 0 ? changed : entries
            const batches: Array<typeof entries> = []
            for (let index = 0; index < targets.length; index += KNOWLEDGE_WIKI_DOCUMENT_STATUS_BATCH_SIZE) {
              batches.push(targets.slice(index, index + KNOWLEDGE_WIKI_DOCUMENT_STATUS_BATCH_SIZE))
            }
            if (!batches.length) return of(cache)
            return merge(
              ...batches.map((batch) =>
                api
                  .getDocumentStatus(
                    id,
                    batch.map((entry) => entry.id)
                  )
                  .pipe(
                    take(1),
                    map((response) => response.documents ?? []),
                    catchError(() => of([] as KnowledgeWikiDocumentProgress[])),
                    map((documents) => {
                      const progress = new Map(documents.map((doc) => [doc.documentId, doc]))
                      cache = new Map(cache)
                      for (const entry of batch) {
                        cache.set(entry.id, { key: entry.key, progress: progress.get(entry.id) })
                      }
                      return cache
                    })
                  )
              )
            )
          }),
          startWith(cache)
        )
      })
    )
  )
  return computed(() => {
    const current = request()
    const response = result()
    return new Map(
      current.entries.flatMap(({ id, key }) => {
        const cached = response?.get(id)
        return cached?.key === key && cached.progress ? [[id, cached.progress]] : []
      })
    )
  })
}
