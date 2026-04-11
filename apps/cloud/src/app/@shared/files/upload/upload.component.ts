
import { Component, booleanAttribute, input, output } from '@angular/core'

import { NgmDndDirective } from '@xpert-ai/core'
import { AppearanceDirective, DensityDirective } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardIconComponent, ZardProgressBarComponent } from '@xpert-ai/headless-ui'

export type UploadFile = {
  file: File
  progress?: number
  error?: string | null
}

@Component({
  standalone: true,
  imports: [
    TranslateModule,
    ZardButtonComponent,
    ZardIconComponent,
    ZardProgressBarComponent,
    AppearanceDirective,
    DensityDirective,
    NgmDndDirective
],
  selector: 'pac-upload',
  templateUrl: './upload.component.html',
  styleUrls: ['./upload.component.scss']
})
export class FilesUploadComponent {

  // Inputs
  readonly files = input<UploadFile[]>([])
  readonly description = input<string>()

  readonly multiple = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // Outputs
  readonly filesChange = output<FileList>()
  readonly removeFileChange = output<UploadFile[]>()

  /**
   * on file drop handler
   */
  async onFileDropped(event) {
    await this.uploadStorageFile(event)
  }

  /**
   * handle file from browsing
   */
  async fileBrowseHandler(event: EventTarget & { files?: FileList }) {
    await this.uploadStorageFile(event.files)
  }

  async uploadStorageFile(files: FileList) {
    this.filesChange.emit(files)
  }

  removeFile(file: UploadFile) {
    this.removeFileChange.emit([file])
  }
}
