import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  viewChild
} from '@angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { Observable, firstValueFrom, isObservable } from 'rxjs'
import { getErrorMessage, injectToastr, TFile, TFileDirectory } from '../../../@core'
import { FileTreeComponent } from '../tree/tree.component'
import {
  FileTreeNode,
  findPreferredFile,
  prepareFileTree,
  updateFileTreeNode
} from '../tree/tree.utils'
import { type FileTreeSizeVariants } from '../tree/tree.component.variants'
import { FilePanelMode, FileViewerComponent } from '../viewer/viewer.component'

type DirtyDialogAction = 'save' | 'discard' | 'cancel'
export type FileWorkbenchTreeItem = FileTreeNode

type AsyncValue<T> = T | Promise<T> | Observable<T>

export type FileWorkbenchFilesLoader = (path?: string) => AsyncValue<TFileDirectory[] | null | undefined>
export type FileWorkbenchFileLoader = (path: string) => AsyncValue<TFile | null | undefined>
export type FileWorkbenchFileSaver = (path: string, content: string) => AsyncValue<TFile>

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
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FileWorkbenchComponent {
  readonly #dialog = inject(Dialog)
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)

  readonly rootId = input<string | null | undefined>(null)
  readonly rootLabel = input<string | null | undefined>(null)
  readonly filesLoader = input<FileWorkbenchFilesLoader | null>(null)
  readonly fileLoader = input<FileWorkbenchFileLoader | null>(null)
  readonly fileSaver = input<FileWorkbenchFileSaver | null>(null)
  readonly editableExtensions = input<string[]>(DEFAULT_EDITABLE_EXTENSIONS)
  readonly markdownExtensions = input<string[]>(DEFAULT_MARKDOWN_EXTENSIONS)
  readonly treeSize = input<FileTreeSizeVariants>('default')
  readonly reloadKey = input<unknown>(null)
  readonly mobilePane = model<'tree' | 'file'>('tree')

  readonly unsavedChangesDialog = viewChild<TemplateRef<unknown>>('unsavedChangesDialog')

  readonly treeLoading = signal(false)
  readonly saving = signal(false)
  readonly fileLoading = signal(false)
  readonly fileTreeLoadingPaths = signal<Set<string>>(new Set())
  readonly fileTree = signal<FileTreeNode[]>([])
  readonly activeFilePath = signal<string | null>(null)
  readonly activeFile = signal<TFile | null>(null)
  readonly draftContent = signal('')
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
    return !!this.fileSaver() && !!path && this.fileReadable() && this.isEditableFile(path)
  })
  readonly isMarkdownFile = computed(() => {
    const path = this.activeFilePath()
    return !!path && this.#markdownExtensionSet().has(fileExtension(path))
  })
  readonly dirty = computed(() => this.isActiveFileEditable() && this.draftContent() !== (this.activeFile()?.contents ?? ''))

  #dirtyDialogRef: any = null
  #pendingNavigationAction: (() => Promise<void>) | null = null
  #treeRequestToken = 0
  #fileRequestToken = 0

  readonly #reloadRootEffect = effect(
    () => {
      const rootId = this.rootId()
      this.reloadKey()

      if (!rootId) {
        this.resetState()
        return
      }

      void this.reloadRootTree(rootId)
    },
    { allowSignalWrites: true }
  )

  isEditableFile(filePath: string | null | undefined) {
    return !!filePath && this.#editableExtensionSet().has(fileExtension(filePath))
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

  private async loadDirectoryChildren(filePath: string) {
    const filesLoader = this.filesLoader()
    const rootId = this.rootId()
    if (!filesLoader || !rootId) {
      return
    }

    this.fileTreeLoadingPaths.update((paths) => new Set(paths).add(filePath))
    try {
      const files = await resolveAsyncValue(filesLoader(filePath))
      if (this.rootId() !== rootId) {
        return
      }

      this.fileTree.update((state) =>
        updateFileTreeNode(state, filePath, (node) => ({
          ...node,
          expanded: true,
          children: prepareFileTree(files ?? [])
        }))
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

      this.activeFilePath.set(file.filePath || filePath)
      this.activeFile.set(file)
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

  private resetState() {
    this.#treeRequestToken++
    this.#fileRequestToken++
    this.#pendingNavigationAction = null
    this.closeDirtyDialog()
    this.treeLoading.set(false)
    this.fileLoading.set(false)
    this.saving.set(false)
    this.fileTreeLoadingPaths.set(new Set())
    this.fileTree.set([])
    this.activeFilePath.set(null)
    this.activeFile.set(null)
    this.draftContent.set('')
    this.panelMode.set('view')
  }

  private closeDirtyDialog() {
    this.#dirtyDialogRef?.close()
    this.#dirtyDialogRef = null
  }
}

function fileExtension(filePath: string) {
  return filePath.split('.').pop()?.toLowerCase() ?? ''
}

async function resolveAsyncValue<T>(value: AsyncValue<T>): Promise<T> {
  if (isObservable(value)) {
    return firstValueFrom(value)
  }
  return Promise.resolve(value)
}
