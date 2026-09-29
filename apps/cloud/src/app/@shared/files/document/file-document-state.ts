// A file session survives tab switches; each owner releases its requests and URLs on destruction.
import { FileDocumentStore, SharedFileDocument } from './file-document-store'
import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { DestroyRef, TemplateRef, WritableSignal, computed, inject, signal } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import type { TChatFileElementReference, TFile } from '@xpert-ai/contracts'
import { getErrorMessage, injectToastr } from '../../../@core'
import { FileEditorSelection } from '../editor/editor.component'
import { FilePanelMode, FileViewerComponent } from '../viewer/viewer.component'
import { isSpreadsheetEditorFile } from '../spreadsheet-editor/spreadsheet-file.utils'
import { isDocxEditorFile } from '../docx-editor/docx-file.utils'
import { isPptxEditorFile } from '../pptx-editor/pptx-file.utils'
import { resolveFilePreviewKind, toFilePreviewSource } from '../preview/file-preview.utils'
import type { FileTreeNode } from '../tree/tree.utils'
import type {
  FileWorkbenchFileLoader,
  FileWorkbenchFileSaver,
  FileWorkbenchBinaryFileSaver,
  FileWorkbenchFileUploader,
  FileWorkbenchFileDownloader,
  FileWorkbenchDownloadPayload,
  FileWorkbenchReferenceRequest
} from '../workbench/workbench.types'
import {
  fileExtension,
  normalizeDownloadUrl,
  normalizeReferencePath,
  createReferenceRequest,
  parentDirectoryPath,
  resolveAsyncValue,
  revokeObjectUrl,
  requiresPreviewUrl,
  createDownloadPayload,
  triggerFileDownload
} from '../workbench/workbench.utils'

type DirtyDialogAction = 'save' | 'discard' | 'cancel'
type FileWorkbenchPreviewResource = {
  objectUrl: string | null
  url: string | null
  buffer: ArrayBuffer | null
}

export const DEFAULT_EDITABLE_EXTENSIONS = [
  'md',
  'mdx',
  'txt',
  'js',
  'jsx',
  'ts',
  'tsx',
  'json',
  'yml',
  'yaml',
  'py',
  'sh',
  'html',
  'css',
  'xml',
  'env',
  'docx',
  'pptx'
]

export const DEFAULT_MARKDOWN_EXTENSIONS = ['md', 'mdx']

export interface FileDocumentConfig {
  documentScope?: () => string | null | undefined
  rootId: () => string | null | undefined
  fileLoader: () => FileWorkbenchFileLoader | null
  fileSaver: () => FileWorkbenchFileSaver | null
  binaryFileSaver: () => FileWorkbenchBinaryFileSaver | null
  fileUploader: () => FileWorkbenchFileUploader | null
  fileDownloader: () => FileWorkbenchFileDownloader | null
  editableExtensions?: () => string[]
  markdownExtensions?: () => string[]
  referenceable: () => boolean
  onReference: (request: FileWorkbenchReferenceRequest) => void
  openInEditMode?: boolean
}

export class FileDocumentState {
  readonly #store = inject(FileDocumentStore, { optional: true })
  #shared: SharedFileDocument | null = null
  #unsubscribeShared: (() => void) | null = null
  readonly #destroyRef = inject(DestroyRef)
  readonly #dialog = inject(Dialog)
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)
  readonly rootId = () => this.config.rootId()
  readonly fileLoader = () => this.config.fileLoader()
  readonly fileSaver = () => this.config.fileSaver()
  readonly binaryFileSaver = () => this.config.binaryFileSaver()
  readonly fileUploader = () => this.config.fileUploader()
  readonly fileDownloader = () => this.config.fileDownloader()
  readonly referenceable = () => this.config.referenceable()
  readonly editableExtensions = () => this.config.editableExtensions?.() ?? DEFAULT_EDITABLE_EXTENSIONS
  readonly markdownExtensions = () => this.config.markdownExtensions?.() ?? DEFAULT_MARKDOWN_EXTENSIONS
  readonly referenceRequest = { emit: (request: FileWorkbenchReferenceRequest) => this.config.onReference(request) }
  readonly fileViewer = signal<FileViewerComponent | undefined>(undefined)
  readonly unsavedChangesDialog = signal<TemplateRef<unknown> | undefined>(undefined)
  readonly saving = signal(false)
  readonly fileLoading = signal(false)
  readonly draftLoading = signal(false)
  readonly downloadingPaths = signal<Set<string>>(new Set())
  readonly activeFilePath = signal<string | null>(null)
  readonly activeFile = signal<TFile | null>(null)
  readonly activePreviewUrl = signal<string | null>(null)
  readonly draftContent = signal('')
  readonly documentBuffer = signal<ArrayBuffer | null>(null)
  readonly docxDirty = signal(false)
  readonly spreadsheetDirty = signal(false)
  readonly pptxDirty = signal(false)
  readonly panelMode = signal<FilePanelMode>('view')
  readonly fileReadable = computed(() => typeof this.activeFile()?.contents === 'string')
  readonly #editableExtensionSet = computed(
    () => new Set((this.editableExtensions() ?? []).map((extension) => extension.toLowerCase()))
  )
  readonly #markdownExtensionSet = computed(
    () => new Set((this.markdownExtensions() ?? []).map((extension) => extension.toLowerCase()))
  )
  readonly isActiveFileEditable = computed(() => {
    const path = this.activeFilePath()
    if (!path) {
      return false
    }
    if (isSpreadsheetEditorFile(path)) {
      return !!this.fileUploader() && !!this.activePreviewUrl()
    }
    if (isDocxEditorFile(path)) {
      return !!this.fileUploader() && !!this.documentBuffer()
    }
    if (isPptxEditorFile(path)) {
      return !!this.binaryFileSaver() && !!this.documentBuffer()
    }
    return !!this.fileSaver() && this.fileReadable() && this.isEditableFile(path)
  })
  readonly isMarkdownFile = computed(() => {
    const path = this.activeFilePath()
    return !!path && this.#markdownExtensionSet().has(fileExtension(path))
  })
  readonly isSpreadsheetFile = computed(() => isSpreadsheetEditorFile(this.activeFilePath()))
  readonly isDocxFile = computed(() => isDocxEditorFile(this.activeFilePath()))
  readonly isPptxFile = computed(() => isPptxEditorFile(this.activeFilePath()))
  readonly dirty = computed(
    () =>
      this.isActiveFileEditable() &&
      (this.isSpreadsheetFile()
        ? this.spreadsheetDirty()
        : this.isDocxFile()
          ? this.docxDirty()
          : this.isPptxFile()
            ? this.pptxDirty()
            : this.draftContent() !== (this.activeFile()?.contents ?? ''))
  )
  readonly canDownloadActiveFile = computed(() => {
    const activeFile = this.activeFile()
    return (
      !!this.activeFilePath() &&
      (!!this.fileDownloader() || !!normalizeDownloadUrl(activeFile?.fileUrl || activeFile?.url) || this.fileReadable())
    )
  })

  #dirtyDialogRef: DialogRef<unknown, unknown> | null = null
  #pendingNavigationAction: (() => Promise<void>) | null = null
  #fileRequestToken = 0
  #activePreviewObjectUrl: string | null = null
  #destroyed = false

  constructor(readonly config: FileDocumentConfig) {
    this.#destroyRef.onDestroy(() => {
      this.#destroyed = true
      this.reset()
    })
  }

  reset() {
    this.#fileRequestToken++
    this.#shared?.detachWriter(this)
    this.#unsubscribeShared?.()
    this.#unsubscribeShared = null
    this.#shared = null
    this.#pendingNavigationAction = null
    this.closeDirtyDialog()
    this.fileLoading.set(false)
    this.draftLoading.set(false)
    this.saving.set(false)
    this.downloadingPaths.set(new Set())
    this.activeFilePath.set(null)
    this.activeFile.set(null)
    this.setActivePreviewResource({ objectUrl: null, url: null, buffer: null })
    this.draftContent.set('')
    this.documentBuffer.set(null)
    this.docxDirty.set(false)
    this.spreadsheetDirty.set(false)
    this.pptxDirty.set(false)
    this.panelMode.set('view')
  }

  suspendView() {
    // Commit the open cell to memory before Angular removes the editor, then capture its snapshot.
    void this.fileViewer()?.finishEditing()
    this.#shared?.detachWriter(this)
  }

  resumeView() {
    if (this.#shared) {
      this.applySharedSnapshot(this.#shared)
      this.draftLoading.set(this.#shared.synchronizing)
    }
  }

  isEditableFile(filePath: string | null | undefined) {
    return !!filePath && this.#editableExtensionSet().has(fileExtension(filePath))
  }

  async guardDirtyBefore(action: () => Promise<void> | void) {
    if (this.saving()) return false
    if (!this.dirty()) {
      await action()
      return true
    }

    this.#pendingNavigationAction = async () => {
      await action()
    }
    this.openDirtyDialog()
    return false
  }

  async switchPanelMode(mode: FilePanelMode) {
    if (mode === 'edit' && !this.isActiveFileEditable()) {
      return
    }
    if (mode === 'view') await this.fileViewer()?.finishEditing()
    this.panelMode.set(mode)
  }

  referenceActiveFile() {
    const filePath = normalizeReferencePath(this.activeFilePath())
    if (!this.referenceable() || !filePath) {
      return
    }

    this.referenceRequest.emit({
      type: 'file_path',
      path: filePath
    })
  }

  referenceSelectedRange(selection: FileEditorSelection) {
    const filePath = normalizeReferencePath(this.activeFilePath())
    if (!this.referenceable() || !filePath) {
      return
    }

    const text = selection.text
    if (!text.trim().length) {
      return
    }

    this.referenceRequest.emit(createReferenceRequest(filePath, text, selection.startLine, selection.endLine))
  }

  referenceFileElement(reference: TChatFileElementReference) {
    if (!this.referenceable()) {
      return
    }

    this.referenceRequest.emit(reference)
  }

  changeContent(content: string) {
    if (this.saving() || this.panelMode() !== 'edit') return
    this.draftContent.set(content)
    this.#shared?.changeText(content, this)
  }

  changeBinary(dirty: boolean) {
    // Initializing a second editor must not clear the shared dirty flag.
    if (!dirty || this.saving() || this.draftLoading() || this.panelMode() !== 'edit') return
    if (this.isDocxFile()) this.docxDirty.set(true)
    else if (this.isSpreadsheetFile()) this.spreadsheetDirty.set(true)
    else if (this.isPptxFile()) this.pptxDirty.set(true)
    const viewer = this.fileViewer()
    if (viewer)
      this.#shared?.changeBinary(this, (finishEditing) =>
        this.isDocxFile()
          ? viewer.exportDocxFile()
          : this.isSpreadsheetFile()
            ? viewer.exportSpreadsheetFile(finishEditing)
            : viewer.exportPptxFile()
      )
  }

  private attachShared(document: SharedFileDocument) {
    if (this.#shared !== document) this.#shared?.detachWriter(this)
    this.#unsubscribeShared?.()
    this.#shared = document
    this.#unsubscribeShared = document.subscribe((update, source) => {
      this.saving.set(document.saving)
      if (update === 'saving') return
      this.draftLoading.set(source !== this && document.synchronizing)
      if (update === 'error') return
      if ((source !== this && update !== 'dirty') || update === 'saved' || update === 'discarded') {
        this.applySharedSnapshot(document)
      }
      this.docxDirty.set(this.isDocxFile() && document.dirty)
      this.spreadsheetDirty.set(this.isSpreadsheetFile() && document.dirty)
      this.pptxDirty.set(this.isPptxFile() && document.dirty)
      if (update === 'discarded') {
        if (this.isSpreadsheetFile()) void this.fileViewer()?.reloadSpreadsheet()
        if (this.isDocxFile()) this.fileViewer()?.reloadDocx()
        if (this.isPptxFile()) this.fileViewer()?.reloadPptx()
      }
    })
    this.applySharedSnapshot(document)
    this.draftLoading.set(document.synchronizing)
    this.saving.set(document.saving)
    this.docxDirty.set(this.isDocxFile() && document.dirty)
    this.spreadsheetDirty.set(this.isSpreadsheetFile() && document.dirty)
    this.pptxDirty.set(this.isPptxFile() && document.dirty)
  }

  private applySharedSnapshot(document: SharedFileDocument) {
    const { file, content, buffer, url } = document.draft
    this.activeFile.set(file)
    this.draftContent.set(content)
    this.documentBuffer.set(buffer)
    this.setActivePreviewResource({ objectUrl: null, url, buffer })
  }

  private async saveSharedFile(document: SharedFileDocument) {
    await this.fileViewer()?.finishEditing()
    if (!document.beginSave()) return false
    try {
      await document.flush(true)
      const path = this.activeFilePath()
      if (!path) return false
      const { binary, content } = document.draft
      if (this.isDocxFile() || this.isSpreadsheetFile()) {
        const upload = this.fileUploader()
        if (!upload || !binary) throw new Error('Document draft is not ready')
        await resolveAsyncValue(upload(binary, parentDirectoryPath(path)))
        document.saved()
      } else if (this.isPptxFile()) {
        const save = this.binaryFileSaver()
        if (!save || !binary) throw new Error('Document draft is not ready')
        document.saved(await resolveAsyncValue(save(path, binary)))
      } else {
        const save = this.fileSaver()
        if (!save) return false
        document.saved(await resolveAsyncValue(save(path, content)))
      }
      this.panelMode.set('view')
      this.#toastr.success(this.#translate.instant('XP.Files.SkillFileSaved', { Default: 'File saved' }))
      return true
    } catch (error) {
      this.#toastr.danger(getErrorMessage(error))
      return false
    } finally {
      document.endSave()
    }
  }

  discardActiveFileChanges() {
    if (this.#shared) {
      this.#shared.discard()
      this.panelMode.set('view')
      return
    }
    if (this.isDocxFile()) {
      this.docxDirty.set(false)
      this.fileViewer()?.reloadDocx()
      this.panelMode.set('view')
      return
    }

    if (this.isSpreadsheetFile()) {
      this.spreadsheetDirty.set(false)
      void this.fileViewer()?.reloadSpreadsheet()
      this.panelMode.set('view')
      return
    }

    if (this.isPptxFile()) {
      this.pptxDirty.set(false)
      this.fileViewer()?.reloadPptx()
      this.panelMode.set('view')
      return
    }

    this.draftContent.set(this.activeFile()?.contents ?? '')
    this.panelMode.set('view')
  }

  async saveActiveFile(savedDocument?: File) {
    if (this.saving()) return false
    const fileSaver = this.fileSaver()
    const binaryFileSaver = this.binaryFileSaver()
    const filePath = this.activeFilePath()
    if (!filePath || !this.isActiveFileEditable() || !this.dirty()) {
      return true
    }

    if (this.#shared) return this.saveSharedFile(this.#shared)

    const requestToken = this.#fileRequestToken
    const rootId = this.rootId()
    const isCurrent = () => !this.#destroyed && requestToken === this.#fileRequestToken && rootId === this.rootId()
    this.saving.set(true)
    try {
      if (this.isDocxFile()) {
        const fileUploader = this.fileUploader()
        const fileViewer = this.fileViewer()
        if (!fileUploader || !fileViewer) {
          throw new Error('DOCX editor is not ready')
        }

        const file = savedDocument ?? (await fileViewer.exportDocxFile())
        if (!file) {
          throw new Error('DOCX editor did not return a file')
        }

        if (!isCurrent()) return false
        await resolveAsyncValue(fileUploader(file, parentDirectoryPath(filePath)))
        const buffer = await file.arrayBuffer()
        if (!isCurrent()) return false
        this.documentBuffer.set(buffer)
        const objectUrl = URL.createObjectURL(file)
        this.setActivePreviewResource({
          objectUrl,
          url: objectUrl,
          buffer: null
        })
        this.docxDirty.set(false)
      } else if (this.isSpreadsheetFile()) {
        const fileUploader = this.fileUploader()
        const fileViewer = this.fileViewer()
        if (!fileUploader || !fileViewer) {
          throw new Error('Spreadsheet editor is not ready')
        }

        const file = await fileViewer.exportSpreadsheetFile()
        if (!isCurrent()) return false
        await resolveAsyncValue(fileUploader(file, parentDirectoryPath(filePath)))
        if (!isCurrent()) return false
        fileViewer.markSpreadsheetSaved()
        const objectUrl = URL.createObjectURL(file)
        this.setActivePreviewResource({ objectUrl, url: objectUrl, buffer: null })
        this.spreadsheetDirty.set(false)
      } else if (this.isPptxFile()) {
        const fileViewer = this.fileViewer()
        if (!binaryFileSaver || !fileViewer) {
          throw new Error('PPTX editor is not ready')
        }

        const file = savedDocument ?? (await fileViewer.exportPptxFile())
        if (!file) {
          throw new Error('PPTX editor did not return a file')
        }

        if (!isCurrent()) return false
        const saved = await resolveAsyncValue(binaryFileSaver(filePath, file))
        const buffer = await file.arrayBuffer()
        if (!isCurrent()) return false
        this.activeFile.set(saved)
        this.documentBuffer.set(buffer)
        const objectUrl = URL.createObjectURL(file)
        this.setActivePreviewResource({ objectUrl, url: objectUrl, buffer: null })
        fileViewer.markPptxSaved()
        this.pptxDirty.set(false)
      } else {
        if (!fileSaver) {
          return false
        }
        const file = await resolveAsyncValue(fileSaver(filePath, this.draftContent()))
        if (!isCurrent()) return false
        this.activeFile.set(file)
        this.draftContent.set(file.contents ?? '')
      }
      this.panelMode.set('view')
      this.#toastr.success(
        this.#translate.instant('XP.Files.SkillFileSaved', {
          Default: 'File saved'
        })
      )
      return true
    } catch (error) {
      if (isCurrent()) this.#toastr.danger(getErrorMessage(error))
      return false
    } finally {
      if (isCurrent()) this.saving.set(false)
    }
  }

  async downloadActiveFile() {
    const filePath = this.activeFilePath()
    if (!filePath) {
      return
    }

    await this.downloadFileByPath(filePath)
  }

  async refreshActiveFile() {
    const filePath = this.activeFilePath()
    if (!filePath || this.fileLoading()) {
      return
    }

    await this.guardDirtyBefore(async () => {
      await this.loadActiveFile(filePath)
    })
  }

  openDirtyDialog() {
    if (this.#dirtyDialogRef) {
      return
    }

    const dialogTemplate = this.unsavedChangesDialog()
    if (!dialogTemplate) {
      return
    }

    this.#dirtyDialogRef = this.#dialog.open(dialogTemplate, {
      disableClose: true,
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog'
    })
  }

  async resolveDirtyDialog(action: DirtyDialogAction) {
    if (action === 'cancel') {
      this.#pendingNavigationAction = null
      this.closeDirtyDialog()
      return
    }

    if (action === 'save') {
      const saved = await this.saveActiveFile()
      if (!saved) {
        return
      }
    } else {
      this.discardActiveFileChanges()
    }

    this.closeDirtyDialog()
    const pendingAction = this.#pendingNavigationAction
    this.#pendingNavigationAction = null
    if (pendingAction) {
      await pendingAction()
    }
  }

  async loadActiveFile(filePath: string) {
    const fileLoader = this.fileLoader()
    const rootId = this.rootId()
    if (!fileLoader || !rootId || this.#destroyed) {
      return
    }

    const requestToken = ++this.#fileRequestToken
    const scope = this.config.documentScope?.()
    const key = scope && this.#store ? this.#store.key(scope, filePath) : null
    const existing = key ? this.#store?.get(key) : null
    const revision = existing?.revision
    if (existing?.dirty || existing?.saving) {
      this.activeFilePath.set(filePath)
      this.attachShared(existing)
      this.fileLoading.set(false)
      return
    }
    if (this.#shared !== existing) {
      this.#shared?.detachWriter(this)
      this.#unsubscribeShared?.()
      this.#unsubscribeShared = null
      this.#shared = null
    }
    this.fileLoading.set(true)
    try {
      const file = await resolveAsyncValue(fileLoader(filePath))
      if (!file || requestToken !== this.#fileRequestToken || this.rootId() !== rootId) {
        return
      }

      const previewResource = await this.resolvePreviewResource(file.filePath || filePath, file)
      if (requestToken !== this.#fileRequestToken || this.rootId() !== rootId) {
        revokeObjectUrl(previewResource.objectUrl)
        return
      }

      this.activeFilePath.set(file.filePath || filePath)
      this.activeFile.set(file)
      this.setActivePreviewResource(previewResource)
      this.draftContent.set(file.contents ?? '')
      this.documentBuffer.set(previewResource.buffer)
      this.docxDirty.set(false)
      this.spreadsheetDirty.set(false)
      this.pptxDirty.set(false)
      if (key && this.#store) {
        this.#activePreviewObjectUrl = null
        const snapshot = {
          file,
          content: file.contents ?? '',
          url: previewResource.url,
          buffer: previewResource.buffer,
          binary: null
        }
        if (existing && existing.revision === revision && !existing.dirty && !existing.saving) {
          existing.replace(snapshot, previewResource.objectUrl)
        } else if (existing) {
          revokeObjectUrl(previewResource.objectUrl)
        }
        const shared = this.#store.open(key, snapshot, existing ? null : previewResource.objectUrl)
        this.#activePreviewObjectUrl = null
        this.attachShared(shared)
      }
      const activePath = file.filePath || filePath
      const opensInEditor = isSpreadsheetEditorFile(activePath)
        ? !!previewResource.url
        : isDocxEditorFile(activePath) && !!previewResource.buffer
      this.panelMode.set(
        opensInEditor && this.isActiveFileEditable() && this.config.openInEditMode !== false ? 'edit' : 'view'
      )
    } catch (error) {
      this.#toastr.danger(
        getErrorMessage(error) || this.#translate.instant('XP.Files.LoadFileFailed', { Default: 'Failed to load file' })
      )
    } finally {
      if (requestToken === this.#fileRequestToken) {
        this.fileLoading.set(false)
      }
    }
  }

  async downloadFileByPath(filePath: string, item?: FileTreeNode) {
    if (!filePath || this.downloadingPaths().has(filePath)) {
      return
    }

    this.markPathBusy(this.downloadingPaths, filePath, true)
    try {
      const payload = await this.resolveDownloadPayload(filePath, item)
      if (!payload) {
        throw new Error(
          this.#translate.instant('XP.Files.DownloadUnavailable', {
            Default: 'This file is not available for download yet.'
          })
        )
      }

      triggerFileDownload(payload, filePath)
    } catch (error) {
      this.#toastr.danger(
        getErrorMessage(error) ||
          this.#translate.instant('XP.Files.DownloadFailed', {
            Default: 'Failed to download file'
          })
      )
    } finally {
      this.markPathBusy(this.downloadingPaths, filePath, false)
    }
  }

  private async resolveDownloadPayload(
    filePath: string,
    item?: FileTreeNode
  ): Promise<FileWorkbenchDownloadPayload | null | undefined> {
    if (this.activeFilePath() === filePath && this.isPptxFile() && this.pptxDirty()) {
      const file = await this.fileViewer()?.exportPptxFile()
      if (file) {
        return { kind: 'blob', blob: file, fileName: file.name }
      }
    }
    const fileDownloader = this.fileDownloader()
    if (fileDownloader) {
      const payload = await resolveAsyncValue(fileDownloader(filePath, item))
      if (payload) {
        return payload
      }
    }

    const activeFile = this.activeFilePath() === filePath ? this.activeFile() : null
    const file = activeFile ?? (await this.loadFileForDownload(filePath))
    return createDownloadPayload(file, filePath, item)
  }

  private async loadFileForDownload(filePath: string) {
    const fileLoader = this.fileLoader()
    if (!fileLoader) {
      return null
    }

    return resolveAsyncValue(fileLoader(filePath))
  }

  private markPathBusy(target: WritableSignal<Set<string>>, filePath: string, busy: boolean) {
    target.update((paths) => {
      const next = new Set(paths)
      if (busy) {
        next.add(filePath)
      } else {
        next.delete(filePath)
      }
      return next
    })
  }

  private closeDirtyDialog() {
    this.#dirtyDialogRef?.close()
    this.#dirtyDialogRef = null
  }

  private async resolvePreviewResource(filePath: string, file: TFile): Promise<FileWorkbenchPreviewResource> {
    const directUrl = normalizeDownloadUrl(file.fileUrl || file.url)
    const previewKind = resolveFilePreviewKind(
      toFilePreviewSource({
        ...file,
        filePath: file.filePath || filePath
      })
    )

    if (directUrl) {
      if (previewKind === 'document' || previewKind === 'presentation') {
        return this.resolveDocumentUrl(directUrl)
      }

      return {
        objectUrl: null,
        url: directUrl,
        buffer: null
      }
    }

    if (!requiresPreviewUrl(previewKind, typeof file.contents === 'string')) {
      return {
        objectUrl: null,
        url: null,
        buffer: null
      }
    }

    const fileDownloader = this.fileDownloader()
    if (!fileDownloader) {
      return {
        objectUrl: null,
        url: null,
        buffer: null
      }
    }

    const payload = await resolveAsyncValue(fileDownloader(file.filePath || filePath))
    if (!payload) {
      return {
        objectUrl: null,
        url: null,
        buffer: null
      }
    }

    if (payload.kind === 'url') {
      if (previewKind === 'document' || previewKind === 'presentation') {
        return this.resolveDocumentUrl(payload.url)
      }

      return {
        objectUrl: null,
        url: payload.url,
        buffer: null
      }
    }

    const buffer =
      previewKind === 'document' || previewKind === 'presentation' ? await payload.blob.arrayBuffer() : null
    const objectUrl = URL.createObjectURL(payload.blob)
    return {
      objectUrl,
      url: objectUrl,
      buffer
    }
  }

  private async resolveDocumentUrl(url: string): Promise<FileWorkbenchPreviewResource> {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to load document: ${response.status}`)
      }

      const blob = await response.blob()
      const buffer = await blob.arrayBuffer()
      const objectUrl = URL.createObjectURL(blob)
      return {
        objectUrl,
        url: objectUrl,
        buffer
      }
    } catch {
      return {
        objectUrl: null,
        url,
        buffer: null
      }
    }
  }

  handleDocumentError(error: Error) {
    this.#toastr.danger(
      getErrorMessage(error) ||
        this.#translate.instant('XP.Files.LoadFileFailed', {
          Default: 'Failed to load document editor'
        })
    )
  }

  setActivePreviewResource(resource: FileWorkbenchPreviewResource) {
    revokeObjectUrl(this.#activePreviewObjectUrl)
    this.#activePreviewObjectUrl = resource.objectUrl
    this.activePreviewUrl.set(resource.url)
  }
}
