import { HttpParams } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { API_PREFIX, OrganizationBaseCrudService, PaginationParams, toHttpParams } from '@xpert-ai/cloud/state'
import { IChatMessageFeedback } from '../types'

@Injectable({ providedIn: 'root' })
export class ChatMessageFeedbackService extends OrganizationBaseCrudService<IChatMessageFeedback> {
  constructor() {
    super(API_PREFIX + '/chat-message-feedback')
  }

  override getMyAll(options?: PaginationParams<IChatMessageFeedback>, organizationId?: string) {
    return this.httpClient.get<{ items: IChatMessageFeedback[]; total: number }>(this.apiBaseUrl + '/my', {
      params: appendOrganizationId(toHttpParams(options), organizationId)
    })
  }
}

function appendOrganizationId(params: HttpParams | null, organizationId?: string) {
  if (!organizationId) {
    return params ?? undefined
  }

  return (params ?? new HttpParams()).set('organizationId', organizationId)
}
