import { Injectable } from '@angular/core'
import { API_PREFIX, OrganizationBaseCrudService } from '@metad/cloud/state'
import { IChatMessageFeedback } from '../types'

@Injectable({ providedIn: 'root' })
export class ChatMessageFeedbackService extends OrganizationBaseCrudService<IChatMessageFeedback> {
  constructor() {
    super(API_PREFIX + '/chat-message-feedback')
  }
}
