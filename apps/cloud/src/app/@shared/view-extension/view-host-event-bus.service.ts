import { Injectable, OnDestroy } from '@angular/core'
import type { XpertViewHostEventMessage, XpertViewRuntimeScopeInput } from '@xpert-ai/contracts'
import { Observable, Subject } from 'rxjs'

export type {
  XpertRemoteViewHostEventMessage,
  XpertViewHostEventMessage,
  XpertViewHostEventVisualization
} from '@xpert-ai/contracts'

/** Browser-only BroadcastChannel routing key. Server authorization must resolve its own runtime data scope. */
export function resolveViewRuntimeDataScopeKey(
  runtimeScope: XpertViewRuntimeScopeInput | null | undefined,
  userId?: string | null,
  hostType?: string | null,
  hostId?: string | null
) {
  if (!runtimeScope) {
    return undefined
  }

  const normalizedUserId = userId?.trim()
  if (!normalizedUserId) {
    return undefined
  }

  const projectId = runtimeScope.projectId?.trim()
  if (projectId) {
    return `user:${normalizedUserId}:project:${projectId}`
  }

  const normalizedHostType = hostType?.trim()
  const normalizedHostId = hostId?.trim()
  return normalizedHostType && normalizedHostId
    ? `user:${normalizedUserId}:personal:${normalizedHostType}:${normalizedHostId}`
    : undefined
}

@Injectable({
  providedIn: 'root'
})
export class ViewHostEventBus implements OnDestroy {
  readonly #channel =
    typeof window === 'undefined' || typeof window.BroadcastChannel === 'undefined'
      ? null
      : new window.BroadcastChannel('xpert-view-host-events')
  readonly #events = new Subject<XpertViewHostEventMessage>()
  readonly events$: Observable<XpertViewHostEventMessage> = this.#events.asObservable()

  constructor() {
    if (this.#channel) {
      this.#channel.onmessage = ({ data }: MessageEvent<XpertViewHostEventMessage>) => this.#events.next(data)
    }
  }

  publish(event: XpertViewHostEventMessage) {
    this.#events.next(event)
    this.#channel?.postMessage(event)
  }

  ngOnDestroy() {
    this.#channel?.close()
  }
}
