import { inject, Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { API_PREFIX } from '@xpert-ai/cloud/state'
import { toParams } from '@xpert-ai/core'
import { TFile, TFileDirectory } from '../types'

@Injectable({ providedIn: 'root' })
export class FileMemoryApiService {
  readonly #httpClient = inject(HttpClient)
  readonly #apiBaseUrl = `${API_PREFIX}/xpert`

  getFiles(xpertId: string, path = '') {
    return this.#httpClient.get<TFileDirectory[]>(`${this.#apiBaseUrl}/${xpertId}/memory/files`, {
      params: toParams({
        path
      })
    })
  }

  getFile(xpertId: string, path: string) {
    return this.#httpClient.get<TFile>(`${this.#apiBaseUrl}/${xpertId}/memory/file`, {
      params: toParams({
        path
      })
    })
  }

  saveFile(xpertId: string, path: string, content: string) {
    return this.#httpClient.put<TFile>(`${this.#apiBaseUrl}/${xpertId}/memory/file`, {
      path,
      content
    })
  }
}

export function injectFileMemoryAPI() {
  return inject(FileMemoryApiService)
}
