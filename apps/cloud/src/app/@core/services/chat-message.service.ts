import { Injectable } from '@angular/core'
import { API_PREFIX, OrganizationBaseCrudService } from '@metad/cloud/state'
import { IChatMessage } from '../types'

@Injectable({ providedIn: 'root' })
export class ChatMessageService extends OrganizationBaseCrudService<IChatMessage> {
  constructor() {
    super(API_PREFIX + '/chat-message')
  }

  suggestedQuestions(id: string) {
    return this.httpClient.get<string[]>(this.apiBaseUrl + `/${id}/suggested-questions`)
  }
}
