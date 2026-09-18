import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
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
import { injectConfirmDelete } from '@xpert-ai/headless-ui'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { defaultIfEmpty, finalize, firstValueFrom, from } from 'rxjs'
import { getErrorMessage, injectToastr } from '../../../@core'
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
import { FileDocumentComponent } from '../document/file-document.component'
import {
  FileDocumentState,
  DEFAULT_EDITABLE_EXTENSIONS,
  DEFAULT_MARKDOWN_EXTENSIONS
} from '../document/file-document-state'
import type {
  FileWorkbenchLayout,
  FileWorkbenchFilesLoader,
  FileWorkbenchFileLoader,
  FileWorkbenchFileSaver,
  FileWorkbenchBinaryFileSaver,
  FileWorkbenchFileDeleter,
  FileWorkbenchFileUploader,
  FileWorkbenchFileDownloader,
  FileWorkbenchReferenceRequest
} from './workbench.types'
import {
  filterFileTree,
  findFileTreeNode,
  fileModifiedFingerprint,
  isPathSameOrDescendant,
  fileNameFromPath,
  resolveUploadTargetPath,
  formatDirectoryPath,
  resolveAsyncValue,
  readSelectedFiles,
  resolveUploadDestinationPath
} from './workbench.utils'
export * from './workbench.types'
export type FileWorkbenchTreeItem = FileTreeNode

type LoadDirectoryChildrenOptions = {
  merge?: boolean
  requestToken?: number
}

@Component({
  standalone: true,
  selector: 'xp-file-workbench',
  templateUrl: './workbench.component.html',
  styleUrls: ['./workbench.component.css'],
  imports: [CommonModule, TranslateModule, FileTreeComponent, FileDocumentComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.xp-file-workbench--tree-hidden]': '!fileTreeVisible()',
    '[class.xp-file-workbench--library]': "layout() === 'library'"
  }
})
export class FileWorkbenchComponent {
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)
  readonly #confirmDelete = injectConfirmDelete()

  readonly rootId = input<string | null | undefined>(null)
  readonly documentScope = input<string | null>(null)
  readonly active = input(true)
  readonly rootLabel = input<string | null | undefined>(null)
  readonly layout = input<FileWorkbenchLayout>('default')
  readonly showTreeRefresh = input(false)
  readonly navigationTitle = input<string | null>(null)
  readonly treeTitle = input<string | null>(null)
  readonly searchPlaceholder = input<string | null>(null)
  readonly filesLoader = input<FileWorkbenchFilesLoader | null>(null)
  readonly fileLoader = input<FileWorkbenchFileLoader | null>(null)
  readonly fileSaver = input<FileWorkbenchFileSaver | null>(null)
  readonly binaryFileSaver = input<FileWorkbenchBinaryFileSaver | null>(null)
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

  readonly uploadInput = viewChild<ElementRef<HTMLInputElement>>('uploadInput')
  readonly folderUploadInput = viewChild<ElementRef<HTMLInputElement>>('folderUploadInput')
  readonly document = new FileDocumentState({
    rootId: this.rootId,
    documentScope: this.documentScope,
    fileLoader: this.fileLoader,
    fileSaver: this.fileSaver,
    binaryFileSaver: this.binaryFileSaver,
    fileUploader: this.fileUploader,
    fileDownloader: this.fileDownloader,
    editableExtensions: this.editableExtensions,
    markdownExtensions: this.markdownExtensions,
    referenceable: this.referenceable,
    onReference: (request) => this.referenceRequest.emit(request)
  })
  readonly fileViewer = this.document.fileViewer

  readonly treeLoading = signal(false)
  readonly saving = this.document.saving
  readonly fileLoading = this.document.fileLoading
  readonly fileTreeLoadingPaths = signal<Set<string>>(new Set())
  readonly downloadingPaths = this.document.downloadingPaths
  readonly deletingPaths = signal<Set<string>>(new Set())
  readonly uploading = signal(false)
  readonly fileTreeVisible = signal(true)
  readonly fileTree = signal<FileTreeNode[]>([])
  readonly treeSearchQuery = signal('')
  readonly visibleFileTree = computed(() => filterFileTree(this.fileTree(), this.treeSearchQuery()))
  readonly activeFilePath = this.document.activeFilePath
  readonly activeFile = this.document.activeFile
  readonly activePreviewUrl = this.document.activePreviewUrl
  readonly draftContent = this.document.draftContent
  readonly documentBuffer = this.document.documentBuffer
  readonly docxDirty = this.document.docxDirty
  readonly spreadsheetDirty = this.document.spreadsheetDirty
  readonly pptxDirty = this.document.pptxDirty
  readonly panelMode = this.document.panelMode
  readonly selectedTreeItem = signal<{ path: string; isDirectory: boolean } | null>(null)
  readonly treeActivePath = computed(() => this.selectedTreeItem()?.path ?? this.activeFilePath())
  readonly fileReadable = this.document.fileReadable
  readonly isActiveFileEditable = this.document.isActiveFileEditable
  readonly isMarkdownFile = this.document.isMarkdownFile
  readonly isSpreadsheetFile = this.document.isSpreadsheetFile
  readonly isDocxFile = this.document.isDocxFile
  readonly isPptxFile = this.document.isPptxFile
  readonly dirty = this.document.dirty
  readonly canDeleteFiles = computed(() => !!this.fileDeleter())
  readonly canUploadFiles = computed(() => !!this.fileUploader() && !!this.rootId())
  readonly canDownloadFiles = computed(() => !!this.fileDownloader() || !!this.fileLoader())
  readonly canDownloadDirectories = computed(() => !!this.fileDownloader())
  readonly canDownloadActiveFile = this.document.canDownloadActiveFile
  readonly uploadTargetPath = computed(() => resolveUploadTargetPath(this.selectedTreeItem()))
  readonly uploadTargetDisplayPath = computed(() => formatDirectoryPath(this.uploadTargetPath()))
  readonly uploadTargetHint = computed(() => {
    const selection = this.selectedTreeItem()
    if (!selection) {
      return this.#translate.instant('XP.Files.UploadTargetRoot', {
        Default: `No folder selected. Uploading to ${this.uploadTargetDisplayPath()}`,
        path: this.uploadTargetDisplayPath()
      })
    }

    if (selection.isDirectory) {
      return this.#translate.instant('XP.Files.UploadTarget', {
        Default: `Upload to ${this.uploadTargetDisplayPath()}`,
        path: this.uploadTargetDisplayPath()
      })
    }

    return this.#translate.instant('XP.Files.UploadTargetFromFile', {
      Default: `Selected file. Uploading to ${this.uploadTargetDisplayPath()}`,
      path: this.uploadTargetDisplayPath()
    })
  })

  #treeRequestToken = 0
  #activeRootId: string | null = null

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

  readonly isEditableFile = this.document.isEditableFile.bind(this.document)
  readonly guardDirtyBefore = this.document.guardDirtyBefore.bind(this.document)
  readonly switchPanelMode = this.document.switchPanelMode.bind(this.document)
  readonly referenceActiveFile = this.document.referenceActiveFile.bind(this.document)
  readonly referenceSelectedRange = this.document.referenceSelectedRange.bind(this.document)
  readonly referenceFileElement = this.document.referenceFileElement.bind(this.document)
  readonly discardActiveFileChanges = this.document.discardActiveFileChanges.bind(this.document)
  readonly saveActiveFile = this.document.saveActiveFile.bind(this.document)
  readonly downloadActiveFile = this.document.downloadActiveFile.bind(this.document)
  readonly refreshActiveFile = this.document.refreshActiveFile.bind(this.document)
  readonly handleDocumentError = this.document.handleDocumentError.bind(this.document)
  readonly loadActiveFile = this.document.loadActiveFile.bind(this.document)
  readonly downloadFileByPath = this.document.downloadFileByPath.bind(this.document)
  readonly setActivePreviewResource = this.document.setActivePreviewResource.bind(this.document)

  updateTreeSearch(event: Event) {
    const target = event.target
    this.treeSearchQuery.set(target instanceof HTMLInputElement ? target.value : '')
  }

  clearTreeSearch() {
    this.treeSearchQuery.set('')
  }

  toggleFileTree() {
    this.fileTreeVisible.update((visible) => !visible)
  }

  async refreshFileTree() {
    const rootId = this.rootId()
    if (!rootId || this.treeLoading()) {
      return
    }

    await this.refreshRootTree(rootId)
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

  async downloadTreeFile(item: FileTreeNode) {
    const filePath = item.fullPath || item.filePath
    if (!filePath) {
      return
    }

    await this.downloadFileByPath(filePath, item)
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
        this.#translate.instant('XP.Files.UploadedFiles', {
          Default: uploadedCount > 1 ? 'Files uploaded' : 'File uploaded'
        })
      )
    } catch (error) {
      this.#toastr.danger(
        getErrorMessage(error) ||
          this.#translate.instant('XP.Files.UploadFailed', {
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
        ? this.#translate.instant(isDirectory ? 'XP.Files.DeleteDirtyFolderInfo' : 'XP.Files.DeleteDirtyFileInfo', {
            Default: isDirectory
              ? 'A file in this folder has unsaved changes. Deleting the folder will also discard those pending edits.'
              : 'This file has unsaved changes. Deleting it will also discard those pending edits.'
          })
        : this.#translate.instant(isDirectory ? 'XP.Files.DeleteFolderInfo' : 'XP.Files.DeleteFileInfo', {
            Default: isDirectory
              ? 'Are you sure you want to delete this folder and all of its contents? This action cannot be undone.'
              : 'Are you sure you want to delete this file? This action cannot be undone.'
          })

    try {
      const deleted = await firstValueFrom(
        this.#confirmDelete(
          {
            title: this.#translate.instant(isDirectory ? 'XP.Files.DeleteFolderTitle' : 'XP.Files.DeleteFileTitle', {
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
        this.setActivePreviewResource({ objectUrl: null, url: null, buffer: null })
        this.draftContent.set('')
        this.documentBuffer.set(null)
        this.docxDirty.set(false)
        this.spreadsheetDirty.set(false)
        this.pptxDirty.set(false)
        this.panelMode.set('view')

        const preferredFile = findPreferredFile(this.fileTree(), (path) => this.isEditableFile(path))
        if (preferredFile?.fullPath) {
          await this.loadActiveFile(preferredFile.fullPath)
        }
      }

      this.#toastr.success(
        this.#translate.instant(isDirectory ? 'XP.Files.FolderDeleted' : 'XP.Files.FileDeleted', {
          Default: isDirectory ? 'Folder deleted' : 'File deleted'
        })
      )
    } catch (error) {
      this.#toastr.danger(
        getErrorMessage(error) ||
          this.#translate.instant(isDirectory ? 'XP.Files.DeleteFolderFailed' : 'XP.Files.DeleteFileFailed', {
            Default: isDirectory ? 'Failed to delete folder' : 'Failed to delete file'
          })
      )
    }
  }

  private async reloadRootTree(rootId: string) {
    const filesLoader = this.filesLoader()
    if (!filesLoader) {
      this.resetState()
      return
    }

    const requestToken = ++this.#treeRequestToken
    this.document.reset()
    this.treeLoading.set(true)
    this.fileTree.set([])

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
          this.#translate.instant('XP.Files.LoadFilesFailed', { Default: 'Failed to load files' })
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
          this.#translate.instant('XP.Files.LoadFilesFailed', { Default: 'Failed to load files' })
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
      if (
        this.rootId() !== rootId ||
        (options.requestToken != null && options.requestToken !== this.#treeRequestToken)
      ) {
        return
      }

      this.fileTree.update((state) =>
        updateFileTreeNode(state, filePath, (node) => {
          const nextChildren = prepareFileTree(files ?? [])
          const children = options.merge
            ? mergeFileTreeState(Array.isArray(node.children) ? (node.children as FileTreeNode[]) : [], nextChildren)
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
          this.#translate.instant('XP.Files.LoadFolderFailed', { Default: 'Failed to load folder' })
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
    this.document.reset()
    this.treeLoading.set(false)
    this.fileLoading.set(false)
    this.saving.set(false)
    this.uploading.set(false)
    this.fileTreeLoadingPaths.set(new Set())
    this.downloadingPaths.set(new Set())
    this.deletingPaths.set(new Set())
    this.fileTree.set([])
    this.treeSearchQuery.set('')
    this.selectedTreeItem.set(null)
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
}
