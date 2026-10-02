import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { API_PREFIX } from '@cloud/app/@core/state'
import { TFile, TFileDirectory } from '@xpert-ai/contracts'
import { injectApiBaseUrl } from '../providers'

/** Chat workbench files use the AI facade; Studio keeps its management API. */
@Injectable({ providedIn: 'root' })
export class AiWorkspaceFilesService {
  private readonly httpClient = inject(HttpClient)
  private readonly apiBaseUrl = `${injectApiBaseUrl()}${API_PREFIX}/ai/assistants`

  getWorkspaceFiles(id: string, path = '') {
    return this.httpClient.get<TFileDirectory[]>(this.apiBaseUrl + `/${encodeURIComponent(id)}/workspace/files`, {
      params: { path }
    })
  }

  getWorkspaceFile(id: string, path: string) {
    return this.httpClient.get<TFile>(this.apiBaseUrl + `/${encodeURIComponent(id)}/workspace/file`, {
      params: { path }
    })
  }

  downloadWorkspaceFile(id: string, path: string) {
    return this.httpClient.get(this.apiBaseUrl + `/${encodeURIComponent(id)}/workspace/file/download`, {
      params: { path },
      responseType: 'blob'
    })
  }

  saveWorkspaceFile(id: string, path: string, content: string) {
    return this.httpClient.put<TFile>(this.apiBaseUrl + `/${encodeURIComponent(id)}/workspace/file`, { path, content })
  }

  saveWorkspaceBinaryFile(id: string, path: string, file: Blob) {
    const formData = new FormData()
    formData.append('file', file, path.split('/').pop() || 'workspace-file')
    formData.append('path', path)
    return this.httpClient.post<TFile>(
      this.apiBaseUrl + `/${encodeURIComponent(id)}/workspace/file/save-binary`,
      formData
    )
  }

  uploadWorkspaceFileToFolder(id: string, file: File, path = '') {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('path', path)
    return this.httpClient.post<TFile>(this.apiBaseUrl + `/${encodeURIComponent(id)}/workspace/file/upload`, formData)
  }

  deleteWorkspaceFile(id: string, path: string) {
    return this.httpClient.delete<void>(this.apiBaseUrl + `/${encodeURIComponent(id)}/workspace/file`, {
      params: { path }
    })
  }
}
