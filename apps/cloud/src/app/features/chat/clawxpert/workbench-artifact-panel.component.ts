import { workspaceDocumentScope } from '../../../@shared/files/document/file-document-store'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, untracked } from '@angular/core'
import type { TFile } from '@xpert-ai/contracts'
import { ChatConversationService, XpertAPIService } from '../../../@core'
import { FileDocumentComponent } from '../../../@shared/files/document/file-document.component'
import { FileDocumentState } from '../../../@shared/files/document/file-document-state'
import type {
  FileWorkbenchFileLoader,
  FileWorkbenchFileSaver,
  FileWorkbenchBinaryFileSaver,
  FileWorkbenchFileUploader,
  FileWorkbenchFileDownloader,
  FileWorkbenchReferenceRequest
} from '../../../@shared/files/workbench/workbench.types'
import { firstValueFrom } from 'rxjs'
import type { WorkbenchArtifactTab } from './workbench-artifact-tabs'

@Component({
  selector: 'xp-workbench-artifact-panel',
  standalone: true,
  imports: [FileDocumentComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-h-0 min-w-0 overflow-hidden' },
  template: `<xp-file-document [document]="document" [active]="active()" (back)="back.emit()" [backVisible]="true" />`
})
export class WorkbenchArtifactPanelComponent {
  readonly #conversationService = inject(ChatConversationService)
  readonly #xpertService = inject(XpertAPIService)
  readonly tab = input.required<WorkbenchArtifactTab>()
  readonly active = input(true)
  readonly mode = input<'readonly' | 'editable'>('readonly')
  readonly referenceRequest = output<FileWorkbenchReferenceRequest>()
  readonly back = output<void>()
  readonly workspace = computed(() => this.tab().resource.workspace)
  readonly filePath = computed(() => this.workspace()?.path ?? this.tab().resource.file.name)

  readonly fileLoader = computed<FileWorkbenchFileLoader>(() => {
    const workspace = this.workspace()
    const file = this.tab().resource.file
    if (workspace) {
      const { xpertId, conversationId } = workspace
      return (path) =>
        conversationId
          ? this.#conversationService.getFile(conversationId, path, undefined, file.fileAssetId)
          : this.#xpertService.getWorkspaceFile(xpertId, path)
    }
    const source: TFile = {
      filePath: file.name,
      fileUrl: file.previewUrl || file.url,
      mimeType: file.mimeType,
      size: file.size
    }
    return () => source
  })
  readonly fileSaver = computed<FileWorkbenchFileSaver | null>(() => {
    const workspace = this.workspace()
    if (!workspace || this.mode() !== 'editable') return null
    const { xpertId, conversationId } = workspace
    return (path, content) =>
      conversationId
        ? this.#conversationService.saveFile(conversationId, path, content)
        : this.#xpertService.saveWorkspaceFile(xpertId, path, content)
  })
  readonly fileUploader = computed<FileWorkbenchFileUploader | null>(() => {
    const workspace = this.workspace()
    if (!workspace || this.mode() !== 'editable') return null
    const { xpertId, conversationId } = workspace
    return (file, path) =>
      conversationId
        ? this.#conversationService.uploadFile(conversationId, file, path)
        : this.#xpertService.uploadWorkspaceFileToFolder(xpertId, file, path)
  })
  readonly fileDownloader = computed<FileWorkbenchFileDownloader>(() => {
    const workspace = this.workspace()
    const file = this.tab().resource.file
    if (!workspace) return () => ({ kind: 'url', url: file.url, fileName: file.name })
    const { xpertId, conversationId } = workspace
    return async (path) => ({
      kind: 'blob',
      blob: await firstValueFrom(
        conversationId
          ? this.#conversationService.downloadFile(conversationId, path)
          : this.#xpertService.downloadWorkspaceFile(xpertId, path)
      ),
      fileName: path.split('/').pop() || path
    })
  })
  readonly binaryFileSaver = computed<FileWorkbenchBinaryFileSaver | null>(() => {
    const workspace = this.workspace()
    if (!workspace || this.mode() !== 'editable') return null
    const { xpertId, conversationId } = workspace
    return (path, file) =>
      conversationId
        ? this.#conversationService.saveBinaryFile(conversationId, path, file)
        : this.#xpertService.saveWorkspaceBinaryFile(xpertId, path, file)
  })
  readonly document = new FileDocumentState({
    rootId: () => this.tab().id,
    documentScope: () => workspaceDocumentScope(this.workspace()?.xpertId, this.workspace()?.projectId),
    fileLoader: this.fileLoader,
    fileSaver: this.fileSaver,
    fileUploader: this.fileUploader,
    fileDownloader: this.fileDownloader,
    binaryFileSaver: this.binaryFileSaver,
    referenceable: () => !!this.workspace(),
    onReference: (request) => this.referenceRequest.emit(request),
    openInEditMode: false
  })

  constructor() {
    effect(() => {
      this.tab().revision
      const path = this.filePath()
      untracked(() => {
        if (!this.document.dirty() && !this.document.saving()) void this.document.loadActiveFile(path)
      })
    })
  }
}
