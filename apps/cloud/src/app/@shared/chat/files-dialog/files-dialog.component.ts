import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FileTypePipe } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { DateRelativePipe, injectToastr } from '../../../@core'

@Component({
  standalone: true,
  selector: 'chat-files-dialog',
  templateUrl: `files-dialog.component.html`,
  styleUrl: `files-dialog.component.scss`,
  imports: [CommonModule, FormsModule, DragDropModule, CdkMenuModule, TranslateModule, DateRelativePipe, FileTypePipe]
})
export class ChatFilesDialogComponent {
  readonly #data = inject<{ files: { name: string; url: string; extenstion: string; created_date: string }[] }>(
    DIALOG_DATA
  )
  readonly #dialogRef = inject(DialogRef)
  readonly #toastr = injectToastr()

  readonly files = signal(this.#data.files)

  preview(file) {
    this.#dialogRef.close(file)
  }

  download(file) {
    // Check if the URL is available
    const fileUrl = file.url
    if (fileUrl) {
      // Open the URL in a new tab
      window.open(fileUrl, '_blank')
    } else {
      console.error('No URL available to open.')
    }
  }

  close() {
    this.#dialogRef.close()
  }
}
