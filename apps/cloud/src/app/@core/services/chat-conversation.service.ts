import { Injectable } from '@angular/core'
import { API_PREFIX, IChatConversation, IStorageFile, OrganizationBaseCrudService, PaginationParams, toHttpParams } from '@metad/cloud/state'
import { switchMap } from 'rxjs'

@Injectable({ providedIn: 'root' })
export class ChatConversationService extends OrganizationBaseCrudService<IChatConversation> {
  constructor() {
    super(API_PREFIX + '/chat-conversation')
  }

  getMyInOrg(options?: PaginationParams<IChatConversation>, search?: string) {
    let params = toHttpParams(options)
    if (search) {
      params = params.append('search', search)
    }
    return this.selectOrganizationId().pipe(
      switchMap(() =>
        this.httpClient.get<{ items: IChatConversation[]; total: number }>(this.apiBaseUrl + '/my', {
          params
        })
      )
    )
  }

  findAllByXpert(xpertId: string, options: PaginationParams<IChatConversation>) {
    return this.httpClient.get<{ items: IChatConversation[] }>(this.apiBaseUrl + `/xpert/${xpertId}`, {
      params: toHttpParams(options)
    })
  }

  getThreadState(id: string) {
    return this.httpClient.get<any>(this.apiBaseUrl + `/${id}/state`)
  }

  getAttachments(id: string) {
    return this.httpClient.get<IStorageFile[]>(this.apiBaseUrl + `/${id}/attachments`)
  }
}
