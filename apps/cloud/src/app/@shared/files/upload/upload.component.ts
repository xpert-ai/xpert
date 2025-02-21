import { CommonModule } from '@angular/common'
import { Component, booleanAttribute, input, output } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { NgmDndDirective } from '@metad/core'
import { AppearanceDirective, DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'

export type UploadFile = {
  file: File
  progress?: number
  error?: string | null
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    AppearanceDirective,
    DensityDirective,
    NgmDndDirective
  ],
  selector: 'pac-upload',
  templateUrl: './upload.component.html',
  styleUrls: ['./upload.component.scss']
})
export class UploadComponent {

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
