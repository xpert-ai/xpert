import { Injectable } from '@angular/core'
import { API_PREFIX, OrganizationBaseCrudService, PaginationParams, toHttpParams } from '@xpert-ai/cloud/state'
import { IChatMessageFeedback } from '../types'
import { appendOrganizationIdQueryParam } from './query-params'

@Injectable({ providedIn: 'root' })
export class ChatMessageFeedbackService extends OrganizationBaseCrudService<IChatMessageFeedback> {
  constructor() {
    super(API_PREFIX + '/chat-message-feedback')
  }

  override getMyAll(options?: PaginationParams<IChatMessageFeedback>, organizationId?: string) {
    return this.httpClient.get<{ items: IChatMessageFeedback[]; total: number }>(this.apiBaseUrl + '/my', {
      params: appendOrganizationIdQueryParam(toHttpParams(options), organizationId)
    })
  }
}
