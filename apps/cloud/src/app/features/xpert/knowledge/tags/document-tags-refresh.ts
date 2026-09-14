import { computed, inject, Signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import {
  IKnowledgebase,
  IKnowledgeDocument,
  IKnowledgeDocumentTag,
  isDocumentKnowledgebaseType,
  KDocumentSourceType
} from '@xpert-ai/contracts'
import {
  catchError,
  distinctUntilChanged,
  EMPTY,
  exhaustMap,
  filter,
  map,
  merge,
  of,
  switchMap,
  take,
  timer
} from 'rxjs'
import { KnowledgeDocumentService } from '@cloud/app/@core/services/knowledge-document.service'

/** Tags finish independently of parsing. Poll only visible-page associations, like Wiki progress. */
export function injectDocumentTags(knowledgebase: Signal<IKnowledgebase>, documents: Signal<IKnowledgeDocument[]>) {
  const api = inject(KnowledgeDocumentService)
  const request = computed(() => {
    const kb = knowledgebase()
    const ids =
      kb?.automaticTagging?.enabled && isDocumentKnowledgebaseType(kb.type)
        ? documents()
            .filter((doc) => doc.id && doc.sourceType !== KDocumentSourceType.FOLDER)
            .map((doc) => doc.id)
            .sort()
        : []
    return { id: kb?.id, ids, key: JSON.stringify([kb?.id, ids]) }
  })
  const result = toSignal(
    toObservable(request).pipe(
      distinctUntilChanged((a, b) => a.key === b.key),
      switchMap((current) => {
        let tags = new Map<string, IKnowledgeDocumentTag[]>()
        if (!current.id || !current.ids.length) return of({ key: current.key, tags })
        const batches: string[][] = []
        for (let offset = 0; offset < current.ids.length; offset += 100)
          batches.push(current.ids.slice(offset, offset + 100))
        return timer(0, 5000).pipe(
          filter(() => typeof document !== 'undefined' && document.visibilityState === 'visible'),
          exhaustMap(() =>
            merge(
              ...batches.map((ids) =>
                api
                  .getAll({
                    select: ['id'],
                    relations: ['tagAssignments', 'tagAssignments.tag'],
                    where: { knowledgebaseId: current.id, id: { $in: ids } },
                    take: ids.length
                  })
                  .pipe(
                    take(1),
                    map((response) => {
                      tags = new Map(tags)
                      for (const doc of response.items) tags.set(doc.id, doc.tagAssignments ?? [])
                      return { key: current.key, tags }
                    }),
                    // Keep the last successful snapshot, and retry on the next tick.
                    catchError(() => EMPTY)
                  )
              )
            )
          )
        )
      })
    )
  )
  return computed(() => (result()?.key === request().key ? result().tags : new Map<string, IKnowledgeDocumentTag[]>()))
}
