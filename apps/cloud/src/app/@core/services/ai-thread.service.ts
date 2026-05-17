import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { EventSourceMessage } from '@microsoft/fetch-event-source'
import { API_PREFIX } from '@xpert-ai/cloud/state'
import { Observable } from 'rxjs'
import { injectFetchEventSource } from './fetch-event-source'

const API_AI_THREADS = API_PREFIX + '/ai/threads'

export type IAiThread = {
  thread_id: string
  status?: string
  metadata?: {
    id?: string
    assistant_id?: string
    [key: string]: unknown
  }
  values?: Record<string, unknown>
  [key: string]: unknown
}

@Injectable({ providedIn: 'root' })
export class AiThreadService {
  readonly #http = inject(HttpClient)
  readonly #fetchEventSource = injectFetchEventSource()

  getThread(threadId: string) {
    return this.#http.get<IAiThread>(`${API_AI_THREADS}/${threadId}`)
  }

  joinRunStream(threadId: string, runId: string, lastEventId?: string | null): Observable<EventSourceMessage> {
    const normalizedLastEventId = lastEventId?.trim()
    return this.#fetchEventSource({
      url: `${API_AI_THREADS}/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}/stream`,
      method: 'GET',
      ...(normalizedLastEventId
        ? {
            headers: {
              'Last-Event-Id': normalizedLastEventId
            }
          }
        : {})
    })
  }
}
