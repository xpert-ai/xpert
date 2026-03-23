import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { IFileAsset, IUploadFileTarget } from '@metad/contracts'
import { API_PREFIX } from '@metad/cloud/state'

const API_FILE_UPLOAD = API_PREFIX + '/files'

@Injectable({
  providedIn: 'root'
})
export class FileUploadService {
  private readonly httpClient = inject(HttpClient)

  upload(file: File, targets: IUploadFileTarget[], metadata?: Record<string, any>) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('targets', JSON.stringify(targets))
    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata))
    }

    return this.httpClient.post<IFileAsset>(`${API_FILE_UPLOAD}/upload`, formData, {
      observe: 'events',
      reportProgress: true
    })
  }
}
