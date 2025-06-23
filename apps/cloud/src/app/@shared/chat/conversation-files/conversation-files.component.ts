import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { injectToastr } from '../../../@core'
import { ChatFileListComponent } from '../file-list/file-list.component'

@Component({
  standalone: true,
  selector: 'chat-conversation-files',
  templateUrl: `conversation-files.component.html`,
  styleUrl: `conversation-files.component.scss`,
  imports: [CommonModule, FormsModule, DragDropModule, CdkMenuModule, TranslateModule, ChatFileListComponent]
})
export class ChatConversationFilesComponent {
  readonly #data = inject<{ projectId?: string; conversationId: string }>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)
  readonly #toastr = injectToastr()

  readonly request = signal(this.#data)
  readonly projectId = signal(this.#data.projectId)
  readonly conversationId = signal(this.#data.conversationId)

  close() {
    this.#dialogRef.close()
  }
}
