import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core'
import { ChatConversationService } from '../../../@core'
import {
  FileWorkbenchComponent,
  FileWorkbenchFileLoader,
  FileWorkbenchFileSaver,
  FileWorkbenchFilesLoader
} from '../../../@shared/files'
import { TranslateModule } from '@ngx-translate/core'

export type ClawXpertConversationFilesMode = 'readonly' | 'editable'

@Component({
  standalone: true,
  selector: 'pac-clawxpert-conversation-files',
  imports: [CommonModule, TranslateModule, FileWorkbenchComponent],
  template: `
    <pac-file-workbench
      [rootId]="xpertId() || conversationId()"
      [rootLabel]="'PAC.Chat.ClawXpert.WorkspaceFiles' | translate: { Default: 'Workspace files' }"
      [filesLoader]="loadConversationFiles"
      [fileLoader]="loadConversationFile"
      [fileSaver]="mode() === 'editable' ? saveConversationFile : null"
      [reloadKey]="reloadKey()"
      [treeSize]="'sm'"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block h-full min-h-0'
  }
})
export class ClawXpertConversationFilesComponent {
  readonly #conversationService = inject(ChatConversationService)

  readonly conversationId = input<string | null | undefined>(null)
  readonly xpertId = input<string | null | undefined>(null)
  readonly mode = input<ClawXpertConversationFilesMode>('editable')
  readonly reloadKey = input<number>(0)

  readonly loadConversationFiles: FileWorkbenchFilesLoader = (path?: string) => {
    const conversationId = this.conversationId()
    if (!conversationId) {
      return []
    }

    return this.#conversationService.getFiles(conversationId, path ?? '')
  }

  readonly loadConversationFile: FileWorkbenchFileLoader = (path: string) => {
    const conversationId = this.conversationId()
    if (!conversationId) {
      throw new Error('Conversation context is required')
    }

    return this.#conversationService.getFile(conversationId, path)
  }

  readonly saveConversationFile: FileWorkbenchFileSaver = (path: string, content: string) => {
    const conversationId = this.conversationId()
    if (!conversationId) {
      throw new Error('Conversation context is required')
    }

    return this.#conversationService.saveFile(conversationId, path, content)
  }
}
