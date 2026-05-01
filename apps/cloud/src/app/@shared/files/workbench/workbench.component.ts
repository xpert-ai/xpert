import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  TemplateRef,
  WritableSignal,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild
} from '@angular/core'
import { injectConfirmDelete } from '@xpert-ai/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { Observable, defaultIfEmpty, finalize, firstValueFrom, from, isObservable } from 'rxjs'
import type { TChatFileElementReference } from '@xpert-ai/contracts'
import { getErrorMessage, injectToastr, TFile, TFileDirectory } from '../../../@core'
import { FileEditorSelection, mapFileLanguageFromPath } from '../editor/editor.component'
import { FileTreeComponent, type FileTreeUploadKind } from '../tree/tree.component'
import {
  collectExpandedDirectoryPaths,
  FileTreeNode,
  findPreferredFile,
  mergeFileTreeState,
  prepareFileTree,
  removeFileTreeNode,
  updateFileTreeNode
} from '../tree/tree.utils'
import { type FileTreeSizeVariants } from '../tree/tree.component.variants'
import { FilePanelMode, FileViewerComponent } from '../viewer/viewer.component'
import { resolveFilePreviewKind, toFilePreviewSource, type FilePreviewKind } from '../preview/file-preview.utils'

type DirtyDialogAction = 'save' | 'discard' | 'cancel'
export type FileWorkbenchTreeItem = FileTreeNode
type FileWorkbenchUploadSelection = {
  file: File
  relativePath: string | null
}

type AsyncValue<T> = T | Promise<T> | Observable<T>

export type FileWorkbenchFilesLoader = (path?: string) => AsyncValue<TFileDirectory[] | null | undefined>
export type FileWorkbenchFileLoader = (path: string) => AsyncValue<TFile | null | undefined>
export type FileWorkbenchFileSaver = (path: string, content: string) => AsyncValue<TFile>
export type FileWorkbenchFileDeleter = (path: string) => AsyncValue<void>
export type FileWorkbenchFileUploader = (file: File, path: string) => AsyncValue<unknown>
export type FileWorkbenchDownloadPayload =
  | { kind: 'url'; url: string; fileName?: string }
  | { kind: 'blob'; blob: Blob; fileName?: string }
export type FileWorkbenchFileDownloader = (path: string) => AsyncValue<FileWorkbenchDownloadPayload | null | undefined>
export type FileWorkbenchCodeReferenceRequest = {
  path: string
  text: string
  startLine: number
  endLine: number
  language?: string
}
export type FileWorkbenchFilePathReferenceRequest = {
  type: 'file_path'
  path: string
}
export type FileWorkbenchReferenceRequest =
  | FileWorkbenchFilePathReferenceRequest
  | FileWorkbenchCodeReferenceRequest
  | TChatFileElementReference

type FileWorkbenchPreviewResource = {
  objectUrl: string | null
  url: string | null
}

type FileModifiedTimestamp = NonNullable<TFile['createdAt'] | TFile['updatedAt']>
type FileWithModifiedTimestamp = TFile & ({ readonly updatedAt: FileModifiedTimestamp } | { readonly createdAt: FileModifiedTimestamp })

type LoadDirectoryChildrenOptions = {
  merge?: boolean
  requestToken?: number
}

const DEFAULT_EDITABLE_EXTENSIONS = [
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
  'env'
]

const DEFAULT_MARKDOWN_EXTENSIONS = ['md', 'mdx']

@Component({
  standalone: true,
  selector: 'pac-file-workbench',
  templateUrl: './workbench.component.html',
  styleUrls: ['./workbench.component.css'],
  imports: [CommonModule, TranslateModule, FileTreeComponent, FileViewerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.xp-file-workbench--tree-hidden]': '!fileTreeVisible()'
  }
})
export class FileWorkbenchComponent {
  readonly #destroyRef = inject(DestroyRef)
  readonly #dialog = inject(Dialog)
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)
  readonly #confirmDelete = injectConfirmDelete()

  readonly rootId = input<string | null | undefined>(null)
  readonly rootLabel = input<string | null | undefined>(null)
  readonly filesLoader = input<FileWorkbenchFilesLoader | null>(null)
  readonly fileLoader = input<FileWorkbenchFileLoader | null>(null)
  readonly fileSaver = input<FileWorkbenchFileSaver | null>(null)
  readonly fileDeleter = input<FileWorkbenchFileDeleter | null>(null)
  readonly fileUploader = input<FileWorkbenchFileUploader | null>(null)
  readonly fileDownloader = input<FileWorkbenchFileDownloader | null>(null)
  readonly editableExtensions = input<string[]>(DEFAULT_EDITABLE_EXTENSIONS)
  readonly markdownExtensions = input<string[]>(DEFAULT_MARKDOWN_EXTENSIONS)
  readonly treeSize = input<FileTreeSizeVariants>('default')
  readonly reloadKey = input<unknown>(null)
  readonly referenceable = input(false)
  readonly mobilePane = model<'tree' | 'file'>('tree')
  readonly referenceRequest = output<FileWorkbenchReferenceRequest>()

  readonly unsavedChangesDialog = viewChild<TemplateRef<unknown>>('unsavedChangesDialog')
  readonly uploadInput = viewChild<ElementRef<HTMLInputElement>>('uploadInput')
  readonly folderUploadInput = viewChild<ElementRef<HTMLInputElement>>('folderUploadInput')

  readonly treeLoading = signal(false)
  readonly saving = signal(false)
  readonly fileLoading = signal(false)
  readonly fileTreeLoadingPaths = signal<Set<string>>(new Set())
  readonly downloadingPaths = signal<Set<string>>(new Set())
  readonly deletingPaths = signal<Set<string>>(new Set())
  readonly uploading = signal(false)
  readonly fileTreeVisible = signal(true)
  readonly fileTree = signal<FileTreeNode[]>([])
  readonly activeFilePath = signal<string | null>(null)
  readonly activeFile = signal<TFile | null>(null)
  readonly activePreviewUrl = signal<string | null>(null)
  readonly draftContent = signal('')
  readonly panelMode = signal<FilePanelMode>('view')
  readonly selectedTreeItem = signal<{ path: string; isDirectory: boolean } | null>(null)
  readonly treeActivePath = computed(() => this.selectedTreeItem()?.path ?? this.activeFilePath())
  readonly fileReadable = computed(() => typeof this.activeFile()?.contents === 'string')
  readonly #editableExtensionSet = computed(
    () => new Set((this.editableExtensions() ?? []).map((extension) => extension.toLowerCase()))
  )
  readonly #markdownExtensionSet = computed(
    () => new Set((this.markdownExtensions() ?? []).map((extension) => extension.toLowerCase()))
  )
  readonly isActiveFileEditable = computed(() => {
    const path = this.activeFilePath()
    return !!this.fileSaver() && !!path && this.fileReadable() && this.isEditableFile(path)
  })
  readonly isMarkdownFile = computed(() => {
    const path = this.activeFilePath()
    return !!path && this.#markdownExtensionSet().has(fileExtension(path))
  })
  readonly dirty = computed(
    () => this.isActiveFileEditable() && this.draftContent() !== (this.activeFile()?.contents ?? '')
  )
  readonly canDeleteFiles = computed(() => !!this.fileDeleter())
  readonly canUploadFiles = computed(() => !!this.fileUploader() && !!this.rootId())
  readonly canDownloadFiles = computed(() => !!this.fileDownloader() || !!this.fileLoader())
  readonly canDownloadActiveFile = computed(() => {
    const activeFile = this.activeFile()
    return (
      !!this.activeFilePath() &&
      (!!this.fileDownloader() || !!normalizeDownloadUrl(activeFile?.fileUrl || activeFile?.url) || this.fileReadable())
    )
  })
  readonly uploadTargetPath = computed(() => resolveUploadTargetPath(this.selectedTreeItem()))
  readonly uploadTargetDisplayPath = computed(() => formatDirectoryPath(this.uploadTargetPath()))
  readonly uploadTargetHint = computed(() => {
    const selection = this.selectedTreeItem()
    if (!selection) {
      return this.#translate.instant('PAC.Files.UploadTargetRoot', {
        Default: `No folder selected. Uploading to ${this.uploadTargetDisplayPath()}`,
        path: this.uploadTargetDisplayPath()
      })
    }

    if (selection.isDirectory) {
      return this.#translate.instant('PAC.Files.UploadTarget', {
        Default: `Upload to ${this.uploadTargetDisplayPath()}`,
        path: this.uploadTargetDisplayPath()
      })
    }

    return this.#translate.instant('PAC.Files.UploadTargetFromFile', {
      Default: `Selected file. Uploading to ${this.uploadTargetDisplayPath()}`,
      path: this.uploadTargetDisplayPath()
    })
  })

  #dirtyDialogRef: DialogRef<unknown, unknown> | null = null
  #pendingNavigationAction: (() => Promise<void>) | null = null
  #treeRequestToken = 0
  #fileRequestToken = 0
  #activeRootId: string | null = null
  #activePreviewObjectUrl: string | null = null

  readonly #reloadRootEffect = effect(() => {
    const rootId = this.rootId() ?? null
    this.reloadKey()
    this.filesLoader()

    if (!rootId) {
      this.#activeRootId = null
      this.resetState()
      return
    }

    if (this.#activeRootId !== rootId) {
      this.#activeRootId = rootId
      untracked(() => {
        void Promise.resolve().then(() => this.reloadRootTree(rootId))
      })
      return
    }

    untracked(() => {
      void Promise.resolve().then(() => this.refreshRootTree(rootId))
    })
  })

  constructor() {
    this.#destroyRef.onDestroy(() => {
      revokeObjectUrl(this.#activePreviewObjectUrl)
    })
  }

  isEditableFile(filePath: string | null | undefined) {
    return !!filePath && this.#editableExtensionSet().has(fileExtension(filePath))
  }

  toggleFileTree() {
    this.fileTreeVisible.update((visible) => !visible)
  }

  async guardDirtyBefore(action: () => Promise<void> | void) {
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

  async openFile(item: FileTreeNode) {
    this.rememberSelectedTreeItem(item)

    if (item.hasChildren) {
      await this.toggleDirectory(item)
      return
    }

    const filePath = item.fullPath || item.filePath
    if (!filePath) {
      return
    }

    if (filePath === this.activeFilePath()) {
      this.mobilePane.set('file')
      return
    }

    await this.guardDirtyBefore(async () => {
      await this.loadActiveFile(filePath)
      this.mobilePane.set('file')
    })
  }

  async toggleDirectory(item: FileTreeNode) {
    const filePath = item.fullPath || item.filePath
    if (!item.hasChildren || !filePath) {
      return
    }

    this.rememberSelectedTreeItem(item)

    const expanded = !item.expanded
    this.fileTree.update((state) => updateFileTreeNode(state, filePath, (node) => ({ ...node, expanded })))

    if (expanded && item.children == null) {
      await this.loadDirectoryChildren(filePath)
    }
  }

  async switchPanelMode(mode: FilePanelMode) {
    if (mode === 'edit' && !this.isActiveFileEditable()) {
      return
    }
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

  discardActiveFileChanges() {
    this.draftContent.set(this.activeFile()?.contents ?? '')
    this.panelMode.set('view')
  }

  async saveActiveFile() {
    const fileSaver = this.fileSaver()
    const filePath = this.activeFilePath()
    if (!fileSaver || !filePath || !this.isActiveFileEditable() || !this.dirty()) {
      return true
    }

    this.saving.set(true)
    try {
      const file = await resolveAsyncValue(fileSaver(filePath, this.draftContent()))
      this.activeFile.set(file)
      this.draftContent.set(file.contents ?? '')
      this.panelMode.set('view')
      this.#toastr.success(
        this.#translate.instant('PAC.Files.SkillFileSaved', {
          Default: 'File saved'
        })
      )
      return true
    } catch (error) {
      this.#toastr.danger(getErrorMessage(error))
      return false
    } finally {
      this.saving.set(false)
    }
  }

  async downloadTreeFile(item: FileTreeNode) {
    const filePath = item.fullPath || item.filePath
    if (!filePath || item.hasChildren) {
      return
    }

    await this.downloadFileByPath(filePath, item)
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

  requestUpload(kind: FileTreeUploadKind = 'file') {
    if (!this.canUploadFiles() || this.uploading()) {
      return
    }

    const input = kind === 'folder' ? this.folderUploadInput()?.nativeElement : this.uploadInput()?.nativeElement
    input?.click()
  }

  async onUploadFiles(event: Event, kind: FileTreeUploadKind = 'file') {
    const files = readSelectedFiles(event, kind)
    const input = event.target instanceof HTMLInputElement ? event.target : null
    if (!files.length) {
      if (input) {
        input.value = ''
      }
      return
    }

    const fileUploader = this.fileUploader()
    if (!fileUploader) {
      if (input) {
        input.value = ''
      }
      return
    }

    this.uploading.set(true)
    const targetPath = this.uploadTargetPath()
    let uploadedCount = 0

    try {
      for (const { file, relativePath } of files) {
        const destinationPath = resolveUploadDestinationPath(targetPath, relativePath)
        await resolveAsyncValue(fileUploader(file, destinationPath))
        uploadedCount++
      }

      await this.refreshTreeAfterMutation(targetPath)

      this.#toastr.success(
        this.#translate.instant('PAC.Files.UploadedFiles', {
          Default: uploadedCount > 1 ? 'Files uploaded' : 'File uploaded'
        })
      )
    } catch (error) {
      this.#toastr.danger(
        getErrorMessage(error) ||
          this.#translate.instant('PAC.Files.UploadFailed', {
            Default: 'Failed to upload file'
          })
      )
    } finally {
      this.uploading.set(false)
      if (input) {
        input.value = ''
      }
    }
  }

  async deleteTreeFile(item: FileTreeNode) {
    const fileDeleter = this.fileDeleter()
    const filePath = item.fullPath || item.filePath
    if (!fileDeleter || !filePath) {
      return
    }

    const isDirectory = !!item.hasChildren
    const fileName = fileNameFromPath(filePath)
    const activeFilePath = this.activeFilePath()
    const deletesActiveFile = !!activeFilePath && isPathSameOrDescendant(filePath, activeFilePath)
    const information =
      deletesActiveFile && this.dirty()
        ? this.#translate.instant(isDirectory ? 'PAC.Files.DeleteDirtyFolderInfo' : 'PAC.Files.DeleteDirtyFileInfo', {
            Default: isDirectory
              ? 'A file in this folder has unsaved changes. Deleting the folder will also discard those pending edits.'
              : 'This file has unsaved changes. Deleting it will also discard those pending edits.'
          })
        : this.#translate.instant(isDirectory ? 'PAC.Files.DeleteFolderInfo' : 'PAC.Files.DeleteFileInfo', {
            Default: isDirectory
              ? 'Are you sure you want to delete this folder and all of its contents? This action cannot be undone.'
              : 'Are you sure you want to delete this file? This action cannot be undone.'
          })

    try {
      const deleted = await firstValueFrom(
        this.#confirmDelete(
          {
            title: this.#translate.instant(isDirectory ? 'PAC.Files.DeleteFolderTitle' : 'PAC.Files.DeleteFileTitle', {
              Default: isDirectory ? 'Delete Folder' : 'Delete File'
            }),
            value: fileName,
            information
          },
          () => {
            this.markPathBusy(this.deletingPaths, filePath, true)
            return from(resolveAsyncValue(fileDeleter(filePath)).then(() => true)).pipe(
              finalize(() => this.markPathBusy(this.deletingPaths, filePath, false))
            )
          }
        ).pipe(defaultIfEmpty(false))
      )
      if (!deleted) {
        return
      }

      this.fileTree.update((state) => removeFileTreeNode(state, filePath))
      if (isPathSameOrDescendant(filePath, this.selectedTreeItem()?.path)) {
        this.selectedTreeItem.set(null)
      }
      if (deletesActiveFile) {
        this.activeFilePath.set(null)
        this.activeFile.set(null)
        this.setActivePreviewResource({ objectUrl: null, url: null })
        this.draftContent.set('')
        this.panelMode.set('view')

        const preferredFile = findPreferredFile(this.fileTree(), (path) => this.isEditableFile(path))
        if (preferredFile?.fullPath) {
          await this.loadActiveFile(preferredFile.fullPath)
        }
      }

      this.#toastr.success(
        this.#translate.instant(isDirectory ? 'PAC.Files.FolderDeleted' : 'PAC.Files.FileDeleted', {
          Default: isDirectory ? 'Folder deleted' : 'File deleted'
        })
      )
    } catch (error) {
      this.#toastr.danger(
        getErrorMessage(error) ||
          this.#translate.instant(isDirectory ? 'PAC.Files.DeleteFolderFailed' : 'PAC.Files.DeleteFileFailed', {
            Default: isDirectory ? 'Failed to delete folder' : 'Failed to delete file'
          })
      )
    }
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
      backdropClass: 'xp-overlay-share-sheet',
      panelClass: 'xp-overlay-pane-share-sheet'
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

  private async reloadRootTree(rootId: string) {
    const filesLoader = this.filesLoader()
    if (!filesLoader) {
      this.resetState()
      return
    }

    const requestToken = ++this.#treeRequestToken
    this.#fileRequestToken++
    this.treeLoading.set(true)
    this.fileTree.set([])
    this.activeFilePath.set(null)
    this.activeFile.set(null)
    this.setActivePreviewResource({ objectUrl: null, url: null })
    this.draftContent.set('')
    this.panelMode.set('view')

    try {
      const files = await resolveAsyncValue(filesLoader())
      if (requestToken !== this.#treeRequestToken || this.rootId() !== rootId) {
        return
      }

      const tree = prepareFileTree(files ?? [])
      this.fileTree.set(tree)
      const preferredFile = findPreferredFile(tree, (filePath) => this.isEditableFile(filePath))
      if (preferredFile?.fullPath) {
        await this.loadActiveFile(preferredFile.fullPath)
      }
    } catch (error) {
      this.#toastr.danger(
        getErrorMessage(error) ||
          this.#translate.instant('PAC.Files.LoadFilesFailed', { Default: 'Failed to load files' })
      )
    } finally {
      if (requestToken === this.#treeRequestToken) {
        this.treeLoading.set(false)
      }
    }
  }

  private async refreshRootTree(rootId: string) {
    const filesLoader = this.filesLoader()
    if (!filesLoader) {
      this.resetState()
      return
    }

    const requestToken = ++this.#treeRequestToken
    const expandedDirectoryPaths = collectExpandedDirectoryPaths(this.fileTree())
    const activeFilePath = this.activeFilePath()
    const knownActiveFileModifiedAt =
      fileModifiedFingerprint(this.activeFile()) ??
      fileModifiedFingerprint(findFileTreeNode(this.fileTree(), activeFilePath))
    this.treeLoading.set(true)

    try {
      const files = await resolveAsyncValue(filesLoader())
      if (requestToken !== this.#treeRequestToken || this.rootId() !== rootId) {
        return
      }

      this.fileTree.update((state) => mergeFileTreeState(state, prepareFileTree(files ?? [])))

      for (const filePath of expandedDirectoryPaths) {
        if (requestToken !== this.#treeRequestToken || this.rootId() !== rootId) {
          return
        }

        await this.loadDirectoryChildren(filePath, {
          merge: true,
          requestToken
        })
      }

      await this.refreshActiveFileIfModified(activeFilePath, knownActiveFileModifiedAt, rootId, requestToken)

      if (!this.activeFilePath()) {
        const preferredFile = findPreferredFile(this.fileTree(), (filePath) => this.isEditableFile(filePath))
        if (preferredFile?.fullPath) {
          await this.loadActiveFile(preferredFile.fullPath)
        }
      }
    } catch (error) {
      this.#toastr.danger(
        getErrorMessage(error) ||
          this.#translate.instant('PAC.Files.LoadFilesFailed', { Default: 'Failed to load files' })
      )
    } finally {
      if (requestToken === this.#treeRequestToken) {
        this.treeLoading.set(false)
      }
    }
  }

  private async loadDirectoryChildren(filePath: string, options: LoadDirectoryChildrenOptions = {}) {
    const filesLoader = this.filesLoader()
    const rootId = this.rootId()
    if (!filesLoader || !rootId) {
      return
    }

    this.fileTreeLoadingPaths.update((paths) => new Set(paths).add(filePath))
    try {
      const files = await resolveAsyncValue(filesLoader(filePath))
      if (this.rootId() !== rootId || (options.requestToken != null && options.requestToken !== this.#treeRequestToken)) {
        return
      }

      this.fileTree.update((state) =>
        updateFileTreeNode(state, filePath, (node) => {
          const nextChildren = prepareFileTree(files ?? [])
          const children = options.merge
            ? mergeFileTreeState(
                Array.isArray(node.children) ? (node.children as FileTreeNode[]) : [],
                nextChildren
              )
            : nextChildren

          if (node.expanded && node.children === children) {
            return node
          }

          return {
            ...node,
            expanded: true,
            children
          }
        })
      )
    } catch (error) {
      this.#toastr.danger(
        getErrorMessage(error) ||
          this.#translate.instant('PAC.Files.LoadFolderFailed', { Default: 'Failed to load folder' })
      )
    } finally {
      this.fileTreeLoadingPaths.update((paths) => {
        const next = new Set(paths)
        next.delete(filePath)
        return next
      })
    }
  }

  private async refreshActiveFileIfModified(
    filePath: string | null,
    knownModifiedAt: string | null,
    rootId: string,
    requestToken: number
  ) {
    if (!filePath || this.activeFilePath() !== filePath || this.dirty()) {
      return
    }

    const latestModifiedAt = fileModifiedFingerprint(findFileTreeNode(this.fileTree(), filePath))
    if (!knownModifiedAt || !latestModifiedAt || knownModifiedAt === latestModifiedAt) {
      return
    }

    if (requestToken !== this.#treeRequestToken || this.rootId() !== rootId) {
      return
    }

    await this.loadActiveFile(filePath)
  }

  private async loadActiveFile(filePath: string) {
    const fileLoader = this.fileLoader()
    const rootId = this.rootId()
    if (!fileLoader || !rootId) {
      return
    }

    const requestToken = ++this.#fileRequestToken
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
      this.panelMode.set('view')
    } catch (error) {
      this.#toastr.danger(
        getErrorMessage(error) ||
          this.#translate.instant('PAC.Files.LoadFileFailed', { Default: 'Failed to load file' })
      )
    } finally {
      if (requestToken === this.#fileRequestToken) {
        this.fileLoading.set(false)
      }
    }
  }

  private async downloadFileByPath(filePath: string, item?: FileTreeNode) {
    if (!filePath || this.downloadingPaths().has(filePath)) {
      return
    }

    this.markPathBusy(this.downloadingPaths, filePath, true)
    try {
      const payload = await this.resolveDownloadPayload(filePath, item)
      if (!payload) {
        throw new Error(
          this.#translate.instant('PAC.Files.DownloadUnavailable', {
            Default: 'This file is not available for download yet.'
          })
        )
      }

      triggerFileDownload(payload, filePath)
    } catch (error) {
      this.#toastr.danger(
        getErrorMessage(error) ||
          this.#translate.instant('PAC.Files.DownloadFailed', {
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
    const fileDownloader = this.fileDownloader()
    if (fileDownloader) {
      const payload = await resolveAsyncValue(fileDownloader(filePath))
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

  private resetState() {
    this.#treeRequestToken++
    this.#fileRequestToken++
    this.#pendingNavigationAction = null
    this.closeDirtyDialog()
    this.treeLoading.set(false)
    this.fileLoading.set(false)
    this.saving.set(false)
    this.uploading.set(false)
    this.fileTreeLoadingPaths.set(new Set())
    this.downloadingPaths.set(new Set())
    this.deletingPaths.set(new Set())
    this.fileTree.set([])
    this.activeFilePath.set(null)
    this.activeFile.set(null)
    this.setActivePreviewResource({ objectUrl: null, url: null })
    this.draftContent.set('')
    this.panelMode.set('view')
    this.selectedTreeItem.set(null)
  }

  private closeDirtyDialog() {
    this.#dirtyDialogRef?.close()
    this.#dirtyDialogRef = null
  }

  private rememberSelectedTreeItem(item: FileTreeNode) {
    const filePath = item.fullPath || item.filePath
    if (!filePath) {
      return
    }

    this.selectedTreeItem.set({
      path: filePath,
      isDirectory: !!item.hasChildren
    })
  }

  private async refreshTreeAfterMutation(targetPath: string) {
    const filesLoader = this.filesLoader()
    if (!filesLoader) {
      return
    }

    if (!targetPath) {
      const files = await resolveAsyncValue(filesLoader())
      this.fileTree.set(mergeFileTreeState(this.fileTree(), prepareFileTree(files ?? [])))
      return
    }

    this.fileTree.update((state) =>
      updateFileTreeNode(state, targetPath, (node) => (node.expanded ? node : { ...node, expanded: true }))
    )
    await this.loadDirectoryChildren(targetPath)
  }

  private async resolvePreviewResource(filePath: string, file: TFile): Promise<FileWorkbenchPreviewResource> {
    const directUrl = normalizeDownloadUrl(file.fileUrl || file.url)
    if (directUrl) {
      return {
        objectUrl: null,
        url: directUrl
      }
    }

    const previewKind = resolveFilePreviewKind(
      toFilePreviewSource({
        ...file,
        filePath: file.filePath || filePath
      })
    )

    if (!requiresPreviewUrl(previewKind, typeof file.contents === 'string')) {
      return {
        objectUrl: null,
        url: null
      }
    }

    const fileDownloader = this.fileDownloader()
    if (!fileDownloader) {
      return {
        objectUrl: null,
        url: null
      }
    }

    const payload = await resolveAsyncValue(fileDownloader(file.filePath || filePath))
    if (!payload) {
      return {
        objectUrl: null,
        url: null
      }
    }

    if (payload.kind === 'url') {
      return {
        objectUrl: null,
        url: payload.url
      }
    }

    const objectUrl = URL.createObjectURL(payload.blob)
    return {
      objectUrl,
      url: objectUrl
    }
  }

  private setActivePreviewResource(resource: FileWorkbenchPreviewResource) {
    revokeObjectUrl(this.#activePreviewObjectUrl)
    this.#activePreviewObjectUrl = resource.objectUrl
    this.activePreviewUrl.set(resource.url)
  }
}

function fileExtension(filePath: string) {
  return filePath.split('.').pop()?.toLowerCase() ?? ''
}

function findFileTreeNode(items: FileTreeNode[], filePath?: string | null): FileTreeNode | null {
  const targetPath = normalizeComparableFilePath(filePath)
  if (!targetPath) {
    return null
  }

  for (const item of items ?? []) {
    if (normalizeComparableFilePath(item.fullPath || item.filePath) === targetPath) {
      return item
    }

    if (Array.isArray(item.children)) {
      const child = findFileTreeNode(item.children as FileTreeNode[], targetPath)
      if (child) {
        return child
      }
    }
  }

  return null
}

function fileModifiedFingerprint(file: TFile | null | undefined): string | null {
  if (!hasFileModifiedTimestamp(file)) {
    return null
  }

  return normalizeFileTimestamp(file.updatedAt ?? file.createdAt)
}

function hasFileModifiedTimestamp(file: TFile | null | undefined): file is FileWithModifiedTimestamp {
  return isFileModifiedTimestamp(file?.updatedAt) || isFileModifiedTimestamp(file?.createdAt)
}

function isFileModifiedTimestamp(value: FileModifiedTimestamp | number | string | null | undefined): value is FileModifiedTimestamp {
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime())
  }

  if (typeof value === 'number') {
    return Number.isFinite(value)
  }

  if (typeof value === 'string') {
    return value.trim().length > 0
  }

  return false
}

function normalizeFileTimestamp(value: FileModifiedTimestamp | number | string): string {
  if (value instanceof Date) {
    return String(value.getTime())
  }

  if (typeof value === 'number') {
    return String(value)
  }

  const timestamp = value.trim()
  const time = Date.parse(timestamp)
  return Number.isNaN(time) ? timestamp : String(time)
}

function normalizeComparableFilePath(filePath?: string | null) {
  return (filePath ?? '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
}

function isPathSameOrDescendant(parentPath?: string | null, childPath?: string | null) {
  const parent = normalizeComparableFilePath(parentPath)
  const child = normalizeComparableFilePath(childPath)
  return !!parent && !!child && (child === parent || child.startsWith(`${parent}/`))
}

function normalizeReferencePath(filePath?: string | null) {
  return (filePath ?? '').trim().replace(/\\/g, '/') || null
}

function fileNameFromPath(filePath: string) {
  return filePath.split('/').pop() || filePath
}

function parentDirectoryPath(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(0, index) : ''
}

/**
 * Formats relative directory path for display.
 */
function formatDirectoryPath(path: string) {
  return path ? `./${path}` : './'
}

function resolveUploadTargetPath(selection: { path: string; isDirectory: boolean } | null) {
  if (!selection?.path) {
    return ''
  }

  return selection.isDirectory ? selection.path : parentDirectoryPath(selection.path)
}

function normalizeDownloadUrl(url?: string | null) {
  if (!url) {
    return null
  }

  return /^(https?:)?\/\//.test(url) || url.startsWith('/') ? url : null
}

function revokeObjectUrl(url?: string | null) {
  if (typeof URL === 'undefined' || !url || !url.startsWith('blob:')) {
    return
  }

  URL.revokeObjectURL(url)
}

function requiresPreviewUrl(previewKind: FilePreviewKind, hasContents: boolean) {
  if (previewKind === 'text' || previewKind === 'code' || previewKind === 'html') {
    return !hasContents
  }

  return (
    previewKind === 'document' ||
    previewKind === 'image' ||
    previewKind === 'pdf' ||
    previewKind === 'audio' ||
    previewKind === 'video' ||
    previewKind === 'spreadsheet'
  )
}

function createDownloadPayload(
  file: TFile | null | undefined,
  filePath: string,
  item?: FileTreeNode
): FileWorkbenchDownloadPayload | null {
  if (!file && !item) {
    return null
  }

  const fileName = fileNameFromPath(file?.filePath || filePath)
  const url = normalizeDownloadUrl(file?.fileUrl || file?.url || item?.url)
  if (url) {
    return {
      kind: 'url',
      url,
      fileName
    }
  }

  if (typeof file?.contents === 'string') {
    return {
      kind: 'blob',
      blob: new Blob([file.contents], {
        type: file.mimeType || 'text/plain;charset=utf-8'
      }),
      fileName
    }
  }

  return null
}

function triggerFileDownload(payload: FileWorkbenchDownloadPayload, fallbackPath: string) {
  if (payload.kind === 'url') {
    const anchor = document.createElement('a')
    anchor.href = appendDownloadQuery(payload.url)
    anchor.target = '_blank'
    anchor.rel = 'noopener'
    anchor.download = payload.fileName || fileNameFromPath(fallbackPath)
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    return
  }

  const anchor = document.createElement('a')
  const objectUrl = URL.createObjectURL(payload.blob)
  anchor.href = objectUrl
  anchor.download = payload.fileName || fileNameFromPath(fallbackPath)
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(objectUrl)
}

function appendDownloadQuery(url: string) {
  const normalizedUrl = new URL(url, window.location.origin)
  normalizedUrl.searchParams.set('download', '1')
  return normalizedUrl.toString()
}

function createReferenceRequest(
  path: string,
  text: string,
  startLine: number,
  endLine: number
): FileWorkbenchReferenceRequest {
  const language = mapFileLanguageFromPath(path)

  return {
    path,
    text,
    startLine,
    endLine,
    ...(language !== 'plaintext' ? { language } : {})
  }
}

function readSelectedFiles(event: Event, kind: FileTreeUploadKind): FileWorkbenchUploadSelection[] {
  const input = event.target instanceof HTMLInputElement ? event.target : null
  if (!input?.files) {
    return []
  }

  return Array.from(input.files).map((file) => ({
    file,
    relativePath: kind === 'folder' ? normalizeUploadRelativePath(file.webkitRelativePath) : null
  }))
}

function normalizeUploadRelativePath(relativePath?: string | null) {
  const normalized = (relativePath ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '')

  return normalized || null
}

function resolveUploadDestinationPath(targetPath: string, relativePath?: string | null) {
  const normalizedTargetPath = normalizeReferencePath(targetPath) ?? ''
  const normalizedRelativePath = normalizeUploadRelativePath(relativePath)
  const relativeDirectoryPath = normalizedRelativePath ? parentDirectoryPath(normalizedRelativePath) : ''
  return [normalizedTargetPath, relativeDirectoryPath].filter(Boolean).join('/')
}

async function resolveAsyncValue<T>(value: AsyncValue<T>): Promise<T> {
  if (isObservable(value)) {
    return firstValueFrom(value)
  }
  return Promise.resolve(value)
}
