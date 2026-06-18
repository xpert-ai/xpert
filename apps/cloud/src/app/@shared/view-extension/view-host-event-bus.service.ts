import { Injectable } from '@angular/core'
import type { XpertViewHostEventMessage } from '@xpert-ai/contracts'
import { Observable, Subject } from 'rxjs'

export type {
  XpertRemoteViewHostEventMessage,
  XpertViewHostEventMessage,
  XpertViewHostEventVisualization
} from '@xpert-ai/contracts'

@Injectable({
  providedIn: 'root'
})
export class ViewHostEventBus {
  readonly #events = new Subject<XpertViewHostEventMessage>()
  readonly events$: Observable<XpertViewHostEventMessage> = this.#events.asObservable()

  publish(event: XpertViewHostEventMessage) {
    this.#events.next(event)
  }
}
