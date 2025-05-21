import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { IStorageFile } from '@metad/contracts'
import { API_PREFIX } from '@metad/cloud/state'

export const C_API_STORAGEFILE = API_PREFIX + '/storage-file'

@Injectable({
  providedIn: 'root'
})
export class StorageFileService {
  private readonly httpClient = inject(HttpClient)

  /**
   * @deprecated use `uploadFile` instead
   */
  _create(input: FormData, options?: {
    observe: 'events',
    reportProgress: true
  }) {
    return this.httpClient.post<IStorageFile>(C_API_STORAGEFILE, input, options)
  }

  uploadFile(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    return this.httpClient.post<IStorageFile>(C_API_STORAGEFILE, formData, {
      observe: 'events',
      reportProgress: true
    })
  }

  createUrl(input: Partial<IStorageFile>) {
    return this.httpClient.post<IStorageFile>(C_API_STORAGEFILE + '/url', input)
  }

  update(id: string, input) {
    return this.httpClient.put(`${C_API_STORAGEFILE}/${id}`, input)
  }

  delete(id: string) {
    return this.httpClient.delete(`${C_API_STORAGEFILE}/${id}`)
  }
}
