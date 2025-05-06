import { CommonModule } from '@angular/common'
import { HttpEventType } from '@angular/common/http'
import { booleanAttribute, Component, effect, inject, input, output, signal } from '@angular/core'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { StorageFileService } from '@cloud/app/@core'
import { getErrorMessage, IStorageFile } from '@cloud/app/@core/types'
import { FileTypePipe } from '@metad/core'
import { effectAction, NgmDensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { catchError, EMPTY, Observable, of, switchMap, tap } from 'rxjs'
import { FileIconComponent } from '../icon/icon.component'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, MatProgressBarModule, FileTypePipe, FileIconComponent],
  selector: 'storage-file',
  templateUrl: './storage-file.component.html',
  styleUrls: ['./storage-file.component.scss'],
  hostDirectives: [
    {
      directive: NgmDensityDirective,
      inputs: ['small', 'large']
    }
  ]
})
export class StorageFileComponent {
  readonly storageFileService = inject(StorageFileService)

  // Inputs
  readonly file = input<File>()
  readonly immediately = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // Outputs
  readonly onProgress = output<number>()
  readonly error = output<string>()
  readonly storageFile = output<IStorageFile>()
  readonly onDelete = output<void>()

  // States
  readonly progress = signal<number>(null)

  constructor() {
    effect(() => {
      this.onProgress.emit(this.progress())
    }, { allowSignalWrites: true })

    effect(() => {
      if (this.file() && this.immediately()) {
        this.upload(this.file())
      }
    }, { allowSignalWrites: true })
  }

  readonly upload = effectAction((file$: Observable<File>) => {
    return file$.pipe(
      switchMap((file) =>
        file
          ? this.storageFileService.uploadFile(file).pipe(
              tap((event) => {
                switch (event.type) {
                  case HttpEventType.UploadProgress:
                    this.progress.set((event.loaded / event.total) * 100)
                    break
                  case HttpEventType.Response:
                    this.progress.set(100)
                    this.storageFile.emit(event.body)
                    break
                }
              }),
              catchError((error) => {
                this.error.emit(getErrorMessage(error))
                return of(null)
              })
            )
          : EMPTY
      )
    )
  })

  delete() {
    this.upload(null)
    this.onDelete.emit()
  }
}
