import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import type { ChatGroupSnapshot, ChatGroupSummary } from '@xpert-ai/contracts'
import { API_PREFIX } from '../state'
import { map } from 'rxjs'

/** Cloud sidebar and navigation only; messaging and member management stay in the shared ChatKit. */
@Injectable({ providedIn: 'root' })
export class ChatGroupService {
  private readonly http = inject(HttpClient)

  list() {
    return this.http.get<ChatGroupSummary[]>(`${API_PREFIX}/ai/groups`)
  }

  /** Fetch minimal history for entry metadata; ChatKit loads the actual transcript. */
  snapshot(id: string) {
    return this.http.get<ChatGroupSnapshot>(`${API_PREFIX}/ai/groups/${encodeURIComponent(id)}`, {
      params: { limit: 1 }
    })
  }

  /** Changes only the current member's sidebar preferences. */
  preferences(id: string, preferences: { pinned?: boolean; archived?: boolean }) {
    return this.http.patch(`${API_PREFIX}/ai/groups/${encodeURIComponent(id)}/preferences`, preferences)
  }

  /** Reuse the normal chat route with the shared group thread, never an Assistant runtime thread. */
  conversationRoute(id: string) {
    return this.snapshot(id).pipe(map((group) => ['/chat/x', group.xpertId, 'c', group.threadId]))
  }
}
