import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpContext } from '@angular/common/http'
import {
  SharedConversation,
  ConversationShareList,
  ConversationShareListQuery,
  ConversationShareRevokeAll
} from '@xpert-ai/contracts'
import { API_PREFIX } from '../state'
import { SKIP_AUTH_REFRESH } from '../auth/http-context'

@Injectable({ providedIn: 'root' })
export class ConversationSharingService {
  private readonly http = inject(HttpClient)
  listMine(query: ConversationShareListQuery) {
    return this.http.get<ConversationShareList>(`${API_PREFIX}/ai/conversation-shares`, { params: { ...query } })
  }
  previewMine(id: string) {
    return this.http.get<SharedConversation>(`${API_PREFIX}/ai/conversation-shares/${encodeURIComponent(id)}`)
  }
  revokeMine(id: string) {
    return this.http.delete<void>(`${API_PREFIX}/ai/conversation-shares/${encodeURIComponent(id)}`)
  }
  revokeAllMine(input: ConversationShareRevokeAll) {
    return this.http.post<{ revoked: number }>(`${API_PREFIX}/ai/conversation-shares/revoke-all`, input)
  }
  read(token: string, authenticated = false) {
    return this.http.get<SharedConversation>(
      `${API_PREFIX}/ai/shared-conversations/${encodeURIComponent(token)}${authenticated ? '/authenticated' : ''}`,
      {
        context: new HttpContext().set(SKIP_AUTH_REFRESH, true)
      }
    )
  }
}
