import { CommonModule } from '@angular/common'
import { HttpEventType } from '@angular/common/http'
import { booleanAttribute, Component, computed, effect, inject, input, model, output, signal, TemplateRef, viewChild } from '@angular/core'
import { StorageFileService } from '@cloud/app/@core'
import { getErrorMessage, IStorageFile } from '@cloud/app/@core/types'
import { FileTypePipe, linkedModel } from '@metad/core'
import { effectAction, NgmDensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { catchError, EMPTY, Observable, of, switchMap, tap } from 'rxjs'
import { FileIconComponent } from '../../files'
import { NgmProgressSpinnerComponent } from '@metad/ocap-angular/common'
import { Dialog, DialogRef } from '@angular/cdk/dialog'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, NgmProgressSpinnerComponent, FileTypePipe, FileIconComponent,],
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
  readonly storageFile = model<IStorageFile>()

  readonly immediately = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // Outputs
  readonly onProgress = output<number>()
  readonly error = output<string>()
  readonly onDelete = output<void>()

  // States
  readonly progress = signal<number>(null)
  readonly previewUrl = signal<string | null>(null);
  readonly uploadedUrl = linkedModel({
    initialValue: null,
    compute: () => this.storageFile()?.url,
    update: () => {
    }
  })
  readonly isImage = signal<boolean>(false)

  readonly name = computed(() => this.storageFile()?.originalName || this.file()?.name)

  // Children
  readonly imageDialog = viewChild('dialog', {read: TemplateRef})
  dialogRef: DialogRef

  constructor() {
    effect(() => {
      this.onProgress.emit(this.progress())
    }, { allowSignalWrites: true })

    effect(() => {
      const file = this.file();
      if (file) {
        // Check if file is an image
        this.isImage.set(file.type.startsWith('image/'));

        // Generate preview for images
        if (this.isImage()) {
          const reader = new FileReader();
          reader.onload = () => this.previewUrl.set(reader.result as string);
          reader.readAsDataURL(file);
        }

        if (this.immediately() && !this.storageFile()) {
          this.upload(file)
        }
      }
    }, { allowSignalWrites: true })

    effect(() => {
      const file = this.storageFile()
      if (file) {
        // Check if file is an image
        this.isImage.set(file.mimetype.startsWith('image/'));
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
                    this.storageFile.set(event.body)
                    this.uploadedUrl.set(event.body.url); // Assuming response contains URL
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

  openImage() {
    this.dialogRef = this.#dialog.open(this.imageDialog(), {
      backdropClass: 'backdrop-blur-sm-black',
    })
  }

  closeImage() {
    this.dialogRef.close()
  }
}
