import { HttpEventType } from '@angular/common/http'
import {
  booleanAttribute,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  TemplateRef,
  viewChild
} from '@angular/core'
import { StorageFileService } from '@cloud/app/@core'
import { getErrorMessage } from '@cloud/app/@core/types'
import { FileTypePipe, linkedModel } from '@xpert-ai/core'
import { effectAction, NgmDensityDirective } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { catchError, EMPTY, Observable, of, switchMap, tap } from 'rxjs'
import { NgmProgressSpinnerComponent } from '@xpert-ai/ocap-angular/common'
import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { FileIconComponent } from '../../files'
import { getChatStorageFileId, type ChatAttachmentStorageFile } from '../attachments/agent-file'

@Component({
  standalone: true,
  imports: [TranslateModule, NgmProgressSpinnerComponent, FileTypePipe, FileIconComponent],
  selector: 'chat-attachment',
  templateUrl: './attachment.component.html',
  styleUrls: ['./attachment.component.scss'],
  hostDirectives: [
    {
      directive: NgmDensityDirective,
      inputs: ['small', 'large']
    }
  ]
})
export class ChatAttachmentComponent {
  readonly storageFileService = inject(StorageFileService)
  readonly #dialog = inject(Dialog)

  // Inputs
  readonly file = input<File>()
  readonly url = input<string>()
  readonly storageFile = model<ChatAttachmentStorageFile>()

  readonly immediately = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly editable = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly deletable = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // Outputs
  readonly onProgress = output<number>()
  readonly error = output<string>()
  readonly onDelete = output<void>()

  // States
  readonly progress = signal<number>(null)
  readonly previewUrl = signal<string | null>(null)
  readonly uploadedUrl = linkedModel({
    initialValue: null,
    compute: () => this.storageFile()?.url ?? this.storageFile()?.fileUrl,
    update: () => {}
  })
  readonly isImage = signal<boolean>(false)

  readonly name = computed(() => this.storageFile()?.originalName || this.file()?.name)

  // Children
  readonly imageDialog = viewChild('dialog', { read: TemplateRef })
  dialogRef: DialogRef

  constructor() {
    effect(() => {
      this.onProgress.emit(this.progress())
    })

    effect(() => {
      const file = this.file()
      if (file) {
        // Check if file is an image
        this.isImage.set(file.type.startsWith('image/'))

        // Generate preview for images
        if (this.isImage()) {
          const reader = new FileReader()
          reader.onload = () => this.previewUrl.set(reader.result as string)
          reader.readAsDataURL(file)
        }

        if (this.immediately() && !this.storageFile()) {
          this.upload(file)
        }
      }
    })

    effect(() => {
      const url = this.url()
      if (url) {
        // Check if file is an image
        this.isImage.set(true)

        // Generate preview for images
        if (this.isImage()) {
          this.previewUrl.set(url)
        }

        if (this.immediately() && !this.storageFile()) {
          this.createUrlFile(url)
        }
      }
    })

    effect(() => {
      const file = this.storageFile()
      if (file) {
        const mimeType = 'mimeType' in file ? file.mimeType : undefined
        // Check if file is an image
        this.isImage.set((mimeType ?? file.mimetype ?? '').startsWith('image/'))
      }
    })
  }

  readonly upload = effectAction((file$: Observable<File>) => {
    return file$.pipe(
      switchMap((file) =>
        file
          ? this.storageFileService.uploadAgentFile(file).pipe(
              tap((event) => {
                switch (event.type) {
                  case HttpEventType.UploadProgress:
                    this.progress.set((event.loaded / event.total) * 100)
                    break
                  case HttpEventType.Response:
                    this.progress.set(100)
                    this.storageFile.set(event.body)
                    this.uploadedUrl.set(event.body.url) // Assuming response contains URL
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

  readonly createUrlFile = effectAction((file$: Observable<string>) => {
    return file$.pipe(
      switchMap((file) => {
        if (file) {
          return this.storageFileService.createUrl({ url: file, file }).pipe(
            catchError((error) => {
              this.error.emit(getErrorMessage(error))
              return of(null)
            })
          )
        }
        return EMPTY
      }),
      tap((file) => {
        if (!file) {
          return
        }
        this.storageFile.set(file)
        this.uploadedUrl.set(file.url)
      })
    )
  })

  readonly deleteFile = effectAction((file$: Observable<string>) => {
    return file$.pipe(
      switchMap((file) =>
        file
          ? this.storageFileService.delete(file).pipe(
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
    const storageFile = this.storageFile()
    const storageFileId = storageFile ? getChatStorageFileId(storageFile) : undefined
    if (storageFileId && this.deletable()) {
      this.deleteFile(storageFileId)
    }
    this.upload(null)
    this.onDelete.emit()
  }

  openImage() {
    this.dialogRef = this.#dialog.open(this.imageDialog(), {
      backdropClass: 'backdrop-blur-sm-black'
    })
  }

  closeImage() {
    this.dialogRef.close()
  }
}
