import { XpDialogFrameImports, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { HttpEventType } from '@angular/common/http'
import { Component, inject, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { uniqWith } from 'lodash-es'
import { catchError, combineLatest, of, tap } from 'rxjs'
import { IStorageFile, StorageFileService, getErrorMessage } from '../../../@core'
import { FilesUploadComponent, UploadFile } from '../upload/upload.component'

import { DialogRef } from '@angular/cdk/dialog'
@Component({
  standalone: true,
  selector: 'xp-files-upload',
  templateUrl: './upload.component.html',
  imports: [...XpDialogFrameImports, ZardButtonComponent, TranslateModule, FilesUploadComponent]
})
export class FilesUploadDialogComponent {
  readonly #dialogRef = inject(DialogRef)
  private readonly storageFileService = inject(StorageFileService)

  readonly loading = signal(false)
  fileList: UploadFile[] = []

  async onFileListChange(files: FileList) {
    this.fileList = uniqWith([...this.fileList, ...Array.from(files).map((file) => ({ file }))], (a, b) => {
      return a.file.name === b.file.name && a.file.size === b.file.size && a.file.lastModified === b.file.lastModified
    })
  }

  removeFiles(files: UploadFile[]) {
    for (const file of files) {
      this.removeFile(this.fileList.indexOf(file))
    }
  }
  removeFile(index: number) {
    this.fileList.splice(index, 1)
    this.fileList = [...this.fileList]
  }

  close() {
    this.#dialogRef.close()
  }

  async upload() {
    if (this.loading() || !this.fileList.length) return
    this.loading.set(true)
    const storageFiles: IStorageFile[] = []
    combineLatest(
      this.fileList.map((item) =>
        this.storageFileService.uploadFile(item.file).pipe(
          tap((event) => {
            switch (event.type) {
              case HttpEventType.UploadProgress:
                item.progress = (event.loaded / event.total) * 100
                break
              case HttpEventType.Response:
                item.progress = 100
                storageFiles.push(event.body)
                break
            }
          }),
          catchError((error) => {
            item.error = getErrorMessage(error)
            return of(null)
          })
        )
      )
    ).subscribe({
      complete: () => {
        this.loading.set(false)
        this.#dialogRef.close(storageFiles)
      }
    })
  }
}
