import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { API_PREFIX } from '@cloud/app/@core/state'
import {
  XpertExtensionViewManifest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewFileAccessGrantResult,
  XpertViewFileAccessRequest,
  XpertViewFileAccessSessionResult,
  XpertViewQuery,
  XpertViewRuntimeScopeInput
} from '@xpert-ai/contracts'
import { injectApiBaseUrl } from '../providers'

@Injectable({ providedIn: 'root' })
export class ViewExtensionApiService {
  private readonly httpClient = inject(HttpClient)
  private readonly apiBaseUrl = injectApiBaseUrl()
  private readonly baseUrl = `${this.apiBaseUrl}${API_PREFIX}/view-hosts`
  private readonly workspaceFilesBaseUrl = `${this.apiBaseUrl}${API_PREFIX}/workspace-files`

  getSlotViews(
    hostType: string,
    hostId: string,
    slot: string,
    options: { isDraft?: boolean; runtimeScope?: XpertViewRuntimeScopeInput } = {}
  ) {
    let params = new HttpParams()
    if (options.isDraft) {
      params = params.set('isDraft', 'true')
    }

    return this.httpClient.get<XpertExtensionViewManifest[]>(
      `${this.baseUrl}/${encodeURIComponent(hostType)}/${encodeURIComponent(hostId)}/slots/${encodeURIComponent(slot)}/views`,
      { params, headers: createRuntimeScopeHeaders(options.runtimeScope) }
    )
  }

  getViewData(
    hostType: string,
    hostId: string,
    viewKey: string,
    query: XpertViewQuery = {},
    runtimeScope?: XpertViewRuntimeScopeInput
  ) {
    let params = new HttpParams()

    if (query.page) {
      params = params.set('page', String(query.page))
    }
    if (query.pageSize) {
      params = params.set('pageSize', String(query.pageSize))
    }
    if (query.cursor) {
      params = params.set('cursor', query.cursor)
    }
    if (query.search) {
      params = params.set('search', query.search)
    }
    if (query.sortBy) {
      params = params.set('sortBy', query.sortBy)
    }
    if (query.sortDirection) {
      params = params.set('sortDirection', query.sortDirection)
    }
    if (query.selectionId) {
      params = params.set('selectionId', query.selectionId)
    }
    if (query.parameters && Object.keys(query.parameters).length) {
      params = params.set('parameters', JSON.stringify(query.parameters))
    }
    if (query.filters?.length) {
      params = params.set('filters', JSON.stringify(query.filters))
    }

    return this.httpClient.get<XpertViewDataResult>(
      `${this.baseUrl}/${encodeURIComponent(hostType)}/${encodeURIComponent(hostId)}/views/${encodeURIComponent(viewKey)}/data`,
      { params, headers: createRuntimeScopeHeaders(runtimeScope) }
    )
  }

  getRemoteComponentEntry(
    hostType: string,
    hostId: string,
    viewKey: string,
    runtimeScope?: XpertViewRuntimeScopeInput
  ) {
    return this.httpClient.get(
      `${this.baseUrl}/${encodeURIComponent(hostType)}/${encodeURIComponent(hostId)}/views/${encodeURIComponent(viewKey)}/remote-component/entry`,
      { responseType: 'text', headers: createRuntimeScopeHeaders(runtimeScope) }
    )
  }

  createViewFileAccessSession(
    hostType: string,
    hostId: string,
    viewKey: string,
    runtimeScope?: XpertViewRuntimeScopeInput
  ) {
    return this.httpClient.post<XpertViewFileAccessSessionResult>(
      `${this.workspaceFilesBaseUrl}/view-sessions`,
      {
        hostType,
        hostId,
        viewKey,
        runtimeScope
      },
      { withCredentials: true, headers: createRuntimeScopeHeaders(runtimeScope) }
    )
  }

  createViewFileAccessGrant(sessionId: string, request: XpertViewFileAccessRequest) {
    return this.httpClient.post<XpertViewFileAccessGrantResult>(
      `${this.workspaceFilesBaseUrl}/view-sessions/${encodeURIComponent(sessionId)}/grants`,
      request
    )
  }

  revokeViewFileAccessSession(sessionId: string) {
    return this.httpClient.delete<{ success: boolean }>(
      `${this.workspaceFilesBaseUrl}/view-sessions/${encodeURIComponent(sessionId)}`,
      { withCredentials: true }
    )
  }

  getViewParameterOptions(
    hostType: string,
    hostId: string,
    viewKey: string,
    parameterKey: string,
    query: {
      search?: string
      parameters?: Record<string, unknown>
    } = {},
    runtimeScope?: XpertViewRuntimeScopeInput
  ) {
    let params = new HttpParams()
    if (query.search) {
      params = params.set('search', query.search)
    }
    if (query.parameters && Object.keys(query.parameters).length) {
      params = params.set('parameters', JSON.stringify(query.parameters))
    }

    return this.httpClient.get(
      `${this.baseUrl}/${encodeURIComponent(hostType)}/${encodeURIComponent(hostId)}/views/${encodeURIComponent(viewKey)}/parameters/${encodeURIComponent(parameterKey)}/options`,
      { params, headers: createRuntimeScopeHeaders(runtimeScope) }
    )
  }

  executeAction(
    hostType: string,
    hostId: string,
    viewKey: string,
    actionKey: string,
    body: {
      targetId?: string
      input?: Record<string, unknown> | null
      parameters?: Record<string, unknown>
    },
    runtimeScope?: XpertViewRuntimeScopeInput
  ) {
    return this.httpClient.post<XpertViewActionResult>(
      `${this.baseUrl}/${encodeURIComponent(hostType)}/${encodeURIComponent(hostId)}/views/${encodeURIComponent(viewKey)}/actions/${encodeURIComponent(actionKey)}`,
      body,
      { headers: createRuntimeScopeHeaders(runtimeScope) }
    )
  }

  executeFileAction(
    hostType: string,
    hostId: string,
    viewKey: string,
    actionKey: string,
    body: {
      targetId?: string
      input?: Record<string, unknown> | null
      parameters?: Record<string, unknown>
      file: {
        name?: string
        type?: string
        size?: number
        buffer: ArrayBuffer
      }
    },
    runtimeScope?: XpertViewRuntimeScopeInput
  ) {
    const formData = new FormData()
    const fileName = body.file.name || 'upload.bin'
    const file = new File([body.file.buffer], fileName, {
      type: body.file.type || 'application/octet-stream'
    })
    formData.append('file', file, fileName)
    if (body.targetId) {
      formData.append('targetId', body.targetId)
    }
    if (body.input) {
      formData.append('input', JSON.stringify(body.input))
    }
    if (body.parameters) {
      formData.append('parameters', JSON.stringify(body.parameters))
    }

    return this.httpClient.post<XpertViewActionResult>(
      `${this.baseUrl}/${encodeURIComponent(hostType)}/${encodeURIComponent(hostId)}/views/${encodeURIComponent(viewKey)}/actions/${encodeURIComponent(actionKey)}/file`,
      formData,
      { headers: createRuntimeScopeHeaders(runtimeScope) }
    )
  }
}

function createRuntimeScopeHeaders(scope?: XpertViewRuntimeScopeInput) {
  let headers = new HttpHeaders()
  if (scope?.projectId) headers = headers.set('X-Xpert-View-Project-Id', scope.projectId)
  if (scope?.conversationId) headers = headers.set('X-Xpert-View-Conversation-Id', scope.conversationId)
  return headers
}

export function injectViewExtensionApi() {
  return inject(ViewExtensionApiService)
}
