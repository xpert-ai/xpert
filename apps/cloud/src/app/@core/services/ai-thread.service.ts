import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { API_PREFIX } from '@metad/cloud/state'

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

  getThread(threadId: string) {
    return this.#http.get<IAiThread>(`${API_AI_THREADS}/${threadId}`)
  }
}
