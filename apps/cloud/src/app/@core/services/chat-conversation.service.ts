import { HttpParams } from '@angular/common/http'
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

  override getOneById(id: string, options?: PaginationParams<IChatConversation>, organizationId?: string) {
    return this.selectOrganizationId().pipe(
      switchMap(() =>
        this.httpClient.get<IChatConversation>(this.apiBaseUrl + '/' + id, {
          params: appendOrganizationId(toHttpParams(options), organizationId)
        })
      )
    )
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

  getThreadState(id: string, organizationId?: string) {
    return this.httpClient.get<unknown>(this.apiBaseUrl + `/${id}/state`, {
      params: appendOrganizationId(null, organizationId)
    })
  }

  getByThreadId(threadId: string, organizationId?: string) {
    return this.httpClient.get<IChatConversation>(this.apiBaseUrl + '/by-thread', {
      params: toParams({
        threadId,
        organizationId
      })
    })
  }

  getAttachments(id: string, organizationId?: string) {
    return this.httpClient.get<IStorageFile[]>(this.apiBaseUrl + `/${id}/attachments`, {
      params: appendOrganizationId(null, organizationId)
    })
  }

  cancelConversation(id: string, organizationId?: string) {
    return this.httpClient.post<{ canceledExecutionIds: string[] }>(
      this.apiBaseUrl + `/${id}/cancel`,
      {},
      {
        params: appendOrganizationId(null, organizationId)
      }
    )
  }

  // Files

  getFiles(id: string, path = '', organizationId?: string) {
    return this.httpClient.get<TFileDirectory[]>(this.apiBaseUrl + `/${id}/files`, {
      params: toParams({
        path,
        organizationId
      })
    })
  }

  getFile(id: string, path: string, organizationId?: string) {
    return this.httpClient.get<TFile>(this.apiBaseUrl + `/${id}/file`, {
      params: toParams({
        path,
        organizationId
      })
    })
  }

  saveFile(id: string, path: string, content: string, organizationId?: string) {
    return this.httpClient.put<TFile>(
      this.apiBaseUrl + `/${id}/file`,
      {
        path,
        content
      },
      {
        params: appendOrganizationId(null, organizationId)
      }
    )
  }

  uploadFile(id: string, file: File, path = '', organizationId?: string) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('path', path)
    return this.httpClient.post<TFile>(this.apiBaseUrl + `/${id}/file/upload`, formData, {
      params: appendOrganizationId(null, organizationId)
    })
  }

  deleteFile(id: string, filePath: string, organizationId?: string) {
    return this.httpClient.delete<void>(this.apiBaseUrl + `/${id}/file`, {
      params: toParams({
        path: filePath,
        organizationId
      })
    })
  }

}

function appendOrganizationId(params: HttpParams | null, organizationId?: string) {
  if (!organizationId) {
    return params ?? undefined
  }

  return (params ?? new HttpParams()).set('organizationId', organizationId)
}
