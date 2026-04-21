import { inject, Injectable } from '@angular/core'
import { API_PREFIX, ISkillPackage } from '@xpert-ai/cloud/state'
import { NGXLogger } from 'ngx-logger'
import { toParams } from '@xpert-ai/core'
import { IShareSkillPackageInput, TFile, TFileDirectory } from '../types'
import { XpertWorkspaceBaseCrudService } from './xpert-workspace.service'

@Injectable({ providedIn: 'root' })
export class SkillPackageService extends XpertWorkspaceBaseCrudService<ISkillPackage> {
  readonly #logger = inject(NGXLogger)

  constructor() {
    super(`${API_PREFIX}/skill-package`)
  }

  installPackage(workspaceId: string, indexId: string) {
    return this.httpClient.post<ISkillPackage>(`${this.apiBaseUrl}/install`, { workspaceId, indexId })
  }

  uploadPackage(workspaceId: string, file: File) {
    const formData = new FormData()
    formData.append('file', file)
    return this.httpClient.post<ISkillPackage[]>(`${this.apiBaseUrl}/workspace/${workspaceId}/upload`, formData)
  }

  installRepositoryPackages(workspaceId: string, repositoryId: string) {
    return this.httpClient.post<ISkillPackage[]>(
      `${this.apiBaseUrl}/workspace/${workspaceId}/install-repository/${repositoryId}`,
      {}
    )
  }

  sharePackage(workspaceId: string, id: string, input: IShareSkillPackageInput) {
    return this.httpClient.post<ISkillPackage>(`${this.apiBaseUrl}/workspace/${workspaceId}/${id}/share`, input)
  }

  uninstallPackages(ids: string[]) {
    return this.httpClient.delete(`${this.apiBaseUrl}/uninstall`, {
      body: ids
    })
  }

  uninstallPackageInWorkspace(workspaceId: string, id: string) {
    return this.httpClient.delete(`${this.apiBaseUrl}/workspace/${workspaceId}/${id}`)
  }

  getFiles(workspaceId: string, id: string, path = '', deepth = 1) {
    return this.httpClient.get<TFileDirectory[]>(`${this.apiBaseUrl}/workspace/${workspaceId}/${id}/files`, {
      params: toParams({
        path,
        deepth
      })
    })
  }

  getFile(workspaceId: string, id: string, path: string) {
    return this.httpClient.get<TFile>(`${this.apiBaseUrl}/workspace/${workspaceId}/${id}/file`, {
      params: toParams({
        path
      })
    })
  }

  uploadFile(workspaceId: string, id: string, file: File, path = '') {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('path', path)
    return this.httpClient.post<TFile>(`${this.apiBaseUrl}/workspace/${workspaceId}/${id}/file/upload`, formData)
  }

  downloadFile(workspaceId: string, id: string, path: string) {
    return this.httpClient.get(`${this.apiBaseUrl}/workspace/${workspaceId}/${id}/file/download`, {
      params: toParams({
        path
      }),
      responseType: 'blob'
    })
  }

  saveFile(workspaceId: string, id: string, path: string, content: string) {
    return this.httpClient.put<TFile>(`${this.apiBaseUrl}/workspace/${workspaceId}/${id}/file`, {
      path,
      content
    })
  }

  deleteFile(workspaceId: string, id: string, path: string) {
    return this.httpClient.delete<void>(`${this.apiBaseUrl}/workspace/${workspaceId}/${id}/file`, {
      params: toParams({
        path
      })
    })
  }
}

export function injectSkillPackageAPI() {
  return inject(SkillPackageService)
}
