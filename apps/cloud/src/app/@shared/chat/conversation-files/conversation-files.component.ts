import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FileTypePipe } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { ChatConversationService, DateRelativePipe, injectToastr, TFile } from '../../../@core'
import { derivedAsync } from 'ngxtension/derived-async'
import { of } from 'rxjs'

@Component({
  standalone: true,
  selector: 'chat-conversation-files',
  templateUrl: `conversation-files.component.html`,
  styleUrl: `conversation-files.component.scss`,
  imports: [CommonModule, FormsModule, DragDropModule, CdkMenuModule, TranslateModule, DateRelativePipe, FileTypePipe]
})
export class ChatConversationFilesComponent {
  readonly #data = inject<{ conversationId: string }>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)
  readonly #conversation = inject(ChatConversationService)
  readonly #toastr = injectToastr()

  readonly conversationId = signal(this.#data.conversationId)

  readonly attachments = derivedAsync(() => {
    return this.conversationId() ? this.#conversation.getAttachments(this.conversationId()) : of(null)
  })

  preview(file: TFile) {
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
