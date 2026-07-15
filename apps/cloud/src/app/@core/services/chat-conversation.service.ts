import { Injectable } from '@angular/core'
import {
  API_PREFIX,
  IChatConversation,
  IChatConversationReadState,
  IChatConversationUnreadXpertSummary,
  IStorageFile,
  OrganizationBaseCrudService,
  PaginationParams,
  TFileDirectory,
  toHttpParams
} from '@xpert-ai/cloud/state'
import { Subject, switchMap, tap } from 'rxjs'
import { TFile } from '../types'
import { appendOrganizationIdQueryParam, createOptionalQueryParams } from './query-params'

@Injectable({ providedIn: 'root' })
export class ChatConversationService extends OrganizationBaseCrudService<IChatConversation> {
  readonly #unreadRefresh = new Subject<void>()
  readonly unreadRefresh$ = this.#unreadRefresh.asObservable()

  constructor() {
    super(API_PREFIX + '/chat-conversation')
  }

  override getOneById(id: string, options?: PaginationParams<IChatConversation>, organizationId?: string) {
    return this.selectOrganizationId().pipe(
      switchMap(() =>
        this.httpClient.get<IChatConversation>(this.apiBaseUrl + '/' + id, {
          params: appendOrganizationIdQueryParam(toHttpParams(options), organizationId)
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
      params: appendOrganizationIdQueryParam(null, organizationId)
    })
  }

  getByThreadId(threadId: string, organizationId?: string) {
    return this.httpClient.get<IChatConversation>(this.apiBaseUrl + '/by-thread', {
      params: createOptionalQueryParams({
        threadId,
        organizationId
      })
    })
  }

  getAttachments(id: string, organizationId?: string) {
    return this.httpClient.get<IStorageFile[]>(this.apiBaseUrl + `/${id}/attachments`, {
      params: appendOrganizationIdQueryParam(null, organizationId)
    })
  }

  cancelConversation(id: string, organizationId?: string) {
    return this.httpClient.post<{ canceledExecutionIds: string[] }>(
      this.apiBaseUrl + `/${id}/cancel`,
      {},
      {
        params: appendOrganizationIdQueryParam(null, organizationId)
      }
    )
  }

  getUnreadByXperts(xpertIds: string[], organizationId?: string) {
    return this.selectOrganizationId().pipe(
      switchMap(() =>
        this.httpClient.post<IChatConversationUnreadXpertSummary[]>(
          this.apiBaseUrl + '/unread/xperts',
          {
            xpertIds
          },
          {
            params: appendOrganizationIdQueryParam(null, organizationId)
          }
        )
      )
    )
  }

  markRead(id: string, lastReadMessageId?: string | null, organizationId?: string) {
    return this.httpClient
      .post<IChatConversationReadState>(
        this.apiBaseUrl + `/${id}/read-state`,
        {
          ...(lastReadMessageId ? { lastReadMessageId } : {})
        },
        {
          params: appendOrganizationIdQueryParam(null, organizationId)
        }
      )
      .pipe(tap(() => this.#unreadRefresh.next()))
  }

  refreshUnread() {
    this.#unreadRefresh.next()
  }

  // Files

  getFiles(id: string, path = '', organizationId?: string) {
    return this.httpClient.get<TFileDirectory[]>(this.apiBaseUrl + `/${id}/files`, {
      params: createOptionalQueryParams({
        path,
        organizationId
      })
    })
  }

  getFile(id: string, path: string, organizationId?: string, fileAssetId?: string, metadataOnly?: boolean) {
    return this.httpClient.get<TFile>(this.apiBaseUrl + `/${id}/file`, {
      params: createOptionalQueryParams({
        path,
        organizationId,
        fileAssetId,
        metadataOnly
      })
    })
  }

  downloadFile(id: string, path: string, organizationId?: string) {
    return this.httpClient.get(this.apiBaseUrl + `/${id}/file/download`, {
      params: createOptionalQueryParams({
        path,
        organizationId
      }),
      responseType: 'blob'
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
        params: appendOrganizationIdQueryParam(null, organizationId)
      }
    )
  }

  uploadFile(id: string, file: File, path = '', organizationId?: string) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('path', path)
    return this.httpClient.post<TFile>(this.apiBaseUrl + `/${id}/file/upload`, formData, {
      params: appendOrganizationIdQueryParam(null, organizationId)
    })
  }

  deleteFile(id: string, filePath: string, organizationId?: string) {
    return this.httpClient.delete<void>(this.apiBaseUrl + `/${id}/file`, {
      params: createOptionalQueryParams({
        path: filePath,
        organizationId
      })
    })
  }
}
