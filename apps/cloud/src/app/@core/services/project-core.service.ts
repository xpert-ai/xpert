import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { IProjectCore, TFile, TFileDirectory } from '@xpert-ai/contracts'
import { API_PREFIX, OrganizationBaseCrudService, PaginationParams } from '@xpert-ai/cloud/state'
import { toParams } from '@xpert-ai/core'

export const API_PROJECT_CORE = API_PREFIX + '/project-core'

@Injectable({
  providedIn: 'root'
})
export class ProjectCoreService extends OrganizationBaseCrudService<IProjectCore> {
  readonly #http = inject(HttpClient)

  constructor() {
    super(API_PROJECT_CORE)
  }

  list(options?: PaginationParams<IProjectCore>) {
    return this.getAll(options)
  }

  getFiles(id: string, path = '', deepth = 1) {
    return this.#http.get<TFileDirectory[]>(`${API_PROJECT_CORE}/${id}/files`, {
      params: toParams({
        path,
        deepth
      })
    })
  }

  getFile(id: string, path: string) {
    return this.#http.get<TFile>(`${API_PROJECT_CORE}/${id}/file`, {
      params: toParams({
        path
      })
    })
  }

  saveFile(id: string, path: string, content: string) {
    return this.#http.put<TFile>(`${API_PROJECT_CORE}/${id}/file`, {
      path,
      content
    })
  }

  uploadFile(id: string, file: File, path = '') {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('path', path)
    return this.#http.post<TFile>(`${API_PROJECT_CORE}/${id}/file/upload`, formData)
  }

  deleteFile(id: string, path: string) {
    return this.#http.delete<void>(`${API_PROJECT_CORE}/${id}/file`, {
      params: toParams({
        path
      })
    })
  }
}
