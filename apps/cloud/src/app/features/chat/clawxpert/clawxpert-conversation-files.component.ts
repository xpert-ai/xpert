import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core'
import { ChatConversationService, XpertAPIService } from '../../../@core'
import {
  FileWorkbenchComponent,
  FileWorkbenchReferenceRequest,
  FileWorkbenchFileDeleter,
  FileWorkbenchFileDownloader,
  FileWorkbenchFileLoader,
  FileWorkbenchFileSaver,
  FileWorkbenchFileUploader,
  FileWorkbenchFilesLoader
} from '../../../@shared/files'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'

export type ClawXpertConversationFilesMode = 'readonly' | 'editable'

@Component({
  standalone: true,
  selector: 'xp-clawxpert-conversation-files',
  imports: [CommonModule, TranslateModule, FileWorkbenchComponent],
  template: `
    <xp-file-workbench
      [rootId]="workspaceRootId()"
      [rootLabel]="'XP.Chat.ClawXpert.WorkspaceFiles' | translate: { Default: 'Workspace files' }"
      [filesLoader]="loadWorkspaceFiles"
      [fileLoader]="loadWorkspaceFile"
      [fileSaver]="mode() === 'editable' ? saveWorkspaceFile : null"
      [fileDeleter]="mode() === 'editable' ? deleteWorkspaceFile : null"
      [fileUploader]="mode() === 'editable' ? uploadWorkspaceFile : null"
      [fileDownloader]="downloadWorkspaceFile"
      [reloadKey]="workspaceReloadKey()"
      [referenceable]="true"
      [treeSize]="'sm'"
      (referenceRequest)="referenceRequest.emit($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block h-full min-h-0'
  }
})
export class ClawXpertConversationFilesComponent {
  readonly #conversationService = inject(ChatConversationService)
  readonly #xpertService = inject(XpertAPIService)

  readonly conversationId = input<string | null | undefined>(null)
  readonly xpertId = input<string | null | undefined>(null)
  readonly projectId = input<string | null | undefined>(null)
  readonly mode = input<ClawXpertConversationFilesMode>('editable')
  readonly reloadKey = input<number>(0)
  readonly referenceRequest = output<FileWorkbenchReferenceRequest>()
  readonly workspaceRootId = computed(() =>
    this.normalizedProjectId() ? this.normalizedConversationId() : this.normalizedXpertId()
  )
  readonly workspaceReloadKey = computed(() =>
    [
      this.normalizedProjectId() ?? 'personal',
      this.normalizedConversationId() ?? 'no-conversation',
      this.normalizedXpertId() ?? 'no-xpert',
      this.reloadKey()
    ].join(':')
  )

  readonly loadWorkspaceFiles: FileWorkbenchFilesLoader = (path?: string) => {
    if (this.normalizedProjectId()) {
      const conversationId = this.normalizedConversationId()
      return conversationId ? this.#conversationService.getFiles(conversationId, path ?? '') : []
    }

    const xpertId = this.normalizedXpertId()
    if (!xpertId) {
      return []
    }

    return this.#xpertService.getWorkspaceFiles(xpertId, path ?? '')
  }

  readonly loadWorkspaceFile: FileWorkbenchFileLoader = (path: string) => {
    if (this.normalizedProjectId()) {
      return this.#conversationService.getFile(this.requireConversationId(), path)
    }

    return this.#xpertService.getWorkspaceFile(this.requireXpertId(), path)
  }

  readonly downloadWorkspaceFile: FileWorkbenchFileDownloader = async (path, item) => {
    const blob = await firstValueFrom(
      this.normalizedProjectId()
        ? this.#conversationService.downloadFile(this.requireConversationId(), path)
        : this.#xpertService.downloadWorkspaceFile(this.requireXpertId(), path)
    )
    return {
      kind: 'blob',
      blob,
      fileName: item?.hasChildren ? `${path.split('/').pop() || path}.zip` : path.split('/').pop() || path
    }
  }

  readonly saveWorkspaceFile: FileWorkbenchFileSaver = (path: string, content: string) => {
    if (this.normalizedProjectId()) {
      return this.#conversationService.saveFile(this.requireConversationId(), path, content)
    }

    return this.#xpertService.saveWorkspaceFile(this.requireXpertId(), path, content)
  }

  readonly uploadWorkspaceFile: FileWorkbenchFileUploader = (file: File, path: string) => {
    if (this.normalizedProjectId()) {
      return this.#conversationService.uploadFile(this.requireConversationId(), file, path)
    }

    return this.#xpertService.uploadWorkspaceFileToFolder(this.requireXpertId(), file, path)
  }

  readonly deleteWorkspaceFile: FileWorkbenchFileDeleter = (path: string) => {
    if (this.normalizedProjectId()) {
      return this.#conversationService.deleteFile(this.requireConversationId(), path)
    }

    return this.#xpertService.deleteWorkspaceFile(this.requireXpertId(), path)
  }

  private normalizedConversationId() {
    return this.conversationId()?.trim() || null
  }

  private normalizedXpertId() {
    return this.xpertId()?.trim() || null
  }

  private normalizedProjectId() {
    return this.projectId()?.trim() || null
  }

  private requireConversationId() {
    const conversationId = this.normalizedConversationId()
    if (!conversationId) {
      throw new Error('Conversation context is required')
    }
    return conversationId
  }

  private requireXpertId() {
    const xpertId = this.normalizedXpertId()
    if (!xpertId) {
      throw new Error('Xpert context is required')
    }
    return xpertId
  }
}
