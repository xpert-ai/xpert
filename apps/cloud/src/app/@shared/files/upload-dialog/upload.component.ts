import { CommonModule } from '@angular/common'
import { HttpEventType } from '@angular/common/http'
import { Component, computed, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog'
import { NgmSearchComponent } from '@metad/ocap-angular/common'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { uniqWith } from 'lodash-es'
import { catchError, combineLatest, of, startWith, tap } from 'rxjs'
import { IStorageFile, StorageFileService, ToastrService, getErrorMessage, listAnimation } from '../../../@core'
import { MaterialModule } from '../../material.module'
import { FilesUploadComponent, UploadFile } from '../upload/upload.component'

@Component({
  standalone: true,
  selector: 'pac-files-upload',
  templateUrl: './upload.component.html',
  styleUrls: ['upload.component.scss'],
  providers: [],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MaterialModule,
    TranslateModule,
    ButtonGroupDirective,
    AppearanceDirective,
    DensityDirective,
    NgmSearchComponent,
    FilesUploadComponent
  ],
  animations: [listAnimation]
})
export class FilesUploadDialogComponent {
  private readonly _dialog = inject(MatDialog)
  readonly #dialogRef = inject(MatDialogRef)
  private readonly _data = inject<{ projectId: string }>(MAT_DIALOG_DATA)
  private readonly _toastrService = inject(ToastrService)
  private readonly storageFileService = inject(StorageFileService)

  readonly #files = signal<IStorageFile[]>([])
  readonly searchControl = new FormControl('')
  readonly search = toSignal(this.searchControl.valueChanges.pipe(startWith('')))
  readonly filteredFiles = computed(() => {
    const text = this.search()?.toLowerCase()
    return text ? this.#files().filter((file) => file.originalName?.toLowerCase().includes(text)) : this.#files()
  })

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
    const file = this.fileList[index]
    this.fileList.splice(index, 1)
    this.fileList = [...this.fileList]
  }

  async upload() {
    this.loading.set(false)
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
