import { inject, Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { API_PREFIX } from '@metad/cloud/state'
import { toParams } from '@metad/core'
import { TFile, TFileDirectory } from '../types'

@Injectable({ providedIn: 'root' })
export class FileMemoryApiService {
  readonly #httpClient = inject(HttpClient)
  readonly #apiBaseUrl = `${API_PREFIX}/file-memory`

  getFiles(xpertId: string, workspaceId?: string | null, path = '') {
    return this.#httpClient.get<TFileDirectory[]>(`${this.#apiBaseUrl}/xpert/${xpertId}/files`, {
      params: toParams({
        workspaceId: workspaceId ?? undefined,
        path
      })
    })
  }

  getFile(xpertId: string, workspaceId: string | null | undefined, path: string) {
    return this.#httpClient.get<TFile>(`${this.#apiBaseUrl}/xpert/${xpertId}/file`, {
      params: toParams({
        workspaceId: workspaceId ?? undefined,
        path
      })
    })
  }

  saveFile(xpertId: string, workspaceId: string | null | undefined, path: string, content: string) {
    return this.#httpClient.put<TFile>(`${this.#apiBaseUrl}/xpert/${xpertId}/file`, {
      workspaceId: workspaceId ?? null,
      path,
      content
    })
  }
}

export function injectFileMemoryAPI() {
  return inject(FileMemoryApiService)
}
