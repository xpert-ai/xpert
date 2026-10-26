import { effect, inject, Signal, untracked } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute } from '@angular/router'
import { IMcpPublicationSummary } from '@xpert-ai/contracts'
import { map, of } from 'rxjs'

/** A search link may select only an entry returned by the current scoped management list. */
export function injectPublicationSearchSelection(
  publications: Signal<IMcpPublicationSummary[]>,
  loading: Signal<boolean>,
  select: (id: string) => Promise<void>
) {
  const route = inject(ActivatedRoute, { optional: true })
  const requested = toSignal(route?.queryParamMap.pipe(map((params) => params.get('publicationId'))) ?? of(null))
  effect(() => {
    const id = requested()
    if (id && !loading() && publications().some((item) => item.id === id)) untracked(() => void select(id))
  })
  return requested
}
