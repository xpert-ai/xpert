import { HttpClient, HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { IFileAsset, IStorageFile, TStorageFileAssetDestination } from '@metad/contracts'
import { API_PREFIX } from '@metad/cloud/state'
import { map } from 'rxjs'
import { FileUploadService } from './file-upload.service'

export const C_API_STORAGEFILE = API_PREFIX + '/storage-file'

@Injectable({
  providedIn: 'root'
})
export class StorageFileService {
  private readonly httpClient = inject(HttpClient)
  private readonly fileUploadService = inject(FileUploadService)

  /**
   * @deprecated use `uploadFile` instead
   */
  _create(
    input: FormData,
    options?: {
      observe: 'events'
      reportProgress: true
    }
  ) {
    return this.httpClient.post<IStorageFile>(C_API_STORAGEFILE, input, options)
  }

  uploadFile(file: File) {
    return this.fileUploadService.upload(file, [{ kind: 'storage' }]).pipe(
      map((event): HttpEvent<IStorageFile> => {
        if (event.type !== HttpEventType.Response) {
          return event as HttpEvent<IStorageFile>
        }

        const response = event as HttpResponse<IFileAsset>
        return response.clone({
          body: this.extractStorageFile(response.body)
        })
      })
    )
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

  private extractStorageFile(asset: IFileAsset | null | undefined): IStorageFile {
    const destination = asset?.destinations?.find(
      (item): item is TStorageFileAssetDestination => item.kind === 'storage'
    )

    if (!destination) {
      throw new Error('Unified upload did not return a storage destination.')
    }

    const storageFile = destination.metadata?.storageFile
    if (!storageFile) {
      throw new Error('Unified upload did not return a persisted storage file.')
    }

    return storageFile
  }
}
