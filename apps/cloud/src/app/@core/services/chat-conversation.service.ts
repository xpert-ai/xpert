import { Injectable } from '@angular/core'
import {
  API_PREFIX,
  IChatConversation,
  IStorageFile,
  OrganizationBaseCrudService,
  PaginationParams,
  TFileDirectory,
  toHttpParams
} from '@xpert-ai/cloud/state'
import { toParams } from '@xpert-ai/core'
import { switchMap } from 'rxjs'
import { TFile } from '../types'

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

  findLatestByProject(projectId: string, assistantId: string) {
    return this.httpClient.get<IChatConversation | null>(this.apiBaseUrl + `/project/${projectId}/latest`, {
      params: toParams({
        assistantId
      })
    })
  }

  getThreadState(id: string) {
    return this.httpClient.get<unknown>(this.apiBaseUrl + `/${id}/state`)
  }

  getByThreadId(threadId: string) {
    return this.httpClient.get<IChatConversation>(this.apiBaseUrl + '/by-thread', {
      params: toParams({
        threadId
      })
    })
  }

  getAttachments(id: string) {
    return this.httpClient.get<IStorageFile[]>(this.apiBaseUrl + `/${id}/attachments`)
  }

  cancelConversation(id: string) {
    return this.httpClient.post<{ canceledExecutionIds: string[] }>(this.apiBaseUrl + `/${id}/cancel`, {})
  }

  // Files

  getFiles(id: string, path = '') {
    return this.httpClient.get<TFileDirectory[]>(this.apiBaseUrl + `/${id}/files`, {
      params: toParams({
        path
      })
    })
  }

  getFile(id: string, path: string) {
    return this.httpClient.get<TFile>(this.apiBaseUrl + `/${id}/file`, {
      params: toParams({
        path
      })
    })
  }

  saveFile(id: string, path: string, content: string) {
    return this.httpClient.put<TFile>(this.apiBaseUrl + `/${id}/file`, {
      path,
      content
    })
  }

  uploadFile(id: string, file: File, path = '') {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('path', path)
    return this.httpClient.post<TFile>(this.apiBaseUrl + `/${id}/file/upload`, formData)
  }

  deleteFile(id: string, filePath: string) {
    return this.httpClient.delete<void>(this.apiBaseUrl + `/${id}/file`, {
      params: toParams({
        path: filePath
      })
    })
  }

}
