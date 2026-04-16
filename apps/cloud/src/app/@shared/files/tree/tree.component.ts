import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core'
import { cx, mergeClasses, ZardButtonComponent, ZardLoaderComponent } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { FILE_TREE_SIZE_PRESETS, type FileTreeSizeVariants } from './tree.component.variants'
import { FileTreeNode, flattenFileTree } from './tree.utils'

@Component({
  standalone: true,
  selector: 'pac-file-tree',
  templateUrl: './tree.component.html',
  styleUrls: ['./tree.component.css'],
  imports: [CommonModule, TranslateModule, ZardButtonComponent, ZardLoaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-size]': 'zSize()'
  }
})
export class FileTreeComponent {
  cx = cx
  readonly zSize = input<FileTreeSizeVariants>('default')
  readonly title = input<string>('File Tree')
  readonly subtitle = input<string | null>(null)
  readonly hasContext = input(false)
  readonly items = input<FileTreeNode[]>([])
  readonly activePath = input<string | null>(null)
  readonly loading = input(false)
  readonly loadingPaths = input<Set<string>>(new Set())
  readonly canDownload = input(false)
  readonly canDelete = input(false)
  readonly canUpload = input(false)
  readonly uploadDisabled = input(false)
  readonly uploading = input(false)
  readonly uploadTargetHint = input<string | null>(null)
  readonly downloadingPaths = input<Set<string>>(new Set())
  readonly deletingPaths = input<Set<string>>(new Set())

  readonly emptyTitle = input<string>('No files found yet.')
  readonly emptyHint = input<string>(
    'This item does not expose any files at the current root, or the tree is still loading.'
  )
  readonly selectTitle = input<string>('Select an item')
  readonly selectHint = input<string>('Choose an item to load its file tree.')

  readonly flatItems = computed(() => flattenFileTree(this.items() ?? []))
  readonly sizePreset = computed(() => FILE_TREE_SIZE_PRESETS[this.zSize()])
  readonly headerClasses = computed(() =>
    mergeClasses('xp-pane-header flex items-start justify-between gap-3', this.sizePreset().headerPadding)
  )
  readonly bodyClasses = computed(() =>
    mergeClasses('xp-pane-body min-h-0 flex-1 overflow-auto', this.sizePreset().bodyPadding)
  )
  readonly titleClasses = computed(() => mergeClasses('font-semibold text-text-primary', this.sizePreset().titleText))
  readonly subtitleClasses = computed(() => mergeClasses('truncate text-text-tertiary', this.sizePreset().subtitleText))
  readonly toggleClasses = computed(() =>
    mergeClasses(
      'flex shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-hover-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20',
      this.sizePreset().controlSize
    )
  )
  readonly togglePlaceholderClasses = computed(() =>
    mergeClasses('block shrink-0', this.sizePreset().controlSize)
  )
  readonly itemContentClasses = computed(() =>
    mergeClasses('flex min-w-0 flex-1 items-center text-left', this.sizePreset().contentGap)
  )
  readonly itemIconClasses = computed(() =>
    mergeClasses('shrink-0 text-text-tertiary', this.sizePreset().itemText)
  )
  readonly itemActionClasses = computed(() =>
    mergeClasses(
      'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60',
      this.sizePreset().subtitleText
    )
  )
  readonly emptyTitleClasses = computed(() =>
    mergeClasses('font-semibold text-text-primary', this.sizePreset().emptyTitleText)
  )
  readonly emptyHintClasses = computed(() => mergeClasses('text-text-tertiary', this.sizePreset().emptyHintText))

  readonly fileSelect = output<FileTreeNode>()
  readonly directoryToggle = output<FileTreeNode>()
  readonly fileDownload = output<FileTreeNode>()
  readonly fileDelete = output<FileTreeNode>()
  readonly uploadRequest = output<void>()

  isActiveItem(item: FileTreeNode) {
    return this.activePath() === (item.fullPath || item.filePath)
  }

  itemRowClasses(item: FileTreeNode) {
    return mergeClasses(
      'group flex items-center rounded-lg border border-transparent transition-colors',
      this.sizePreset().rowSpacing,
      this.isActiveItem(item) ? 'border-divider-regular bg-background-default-subtle' : ''
    )
  }

  itemLabelClasses(item: FileTreeNode) {
    return mergeClasses(
      'truncate transition-colors',
      this.sizePreset().itemText,
      this.isActiveItem(item) ? 'font-medium text-text-primary' : 'text-text-secondary group-hover:text-text-primary'
    )
  }

  isDirectoryLoading(filePath: string | null | undefined) {
    return !!filePath && this.loadingPaths().has(filePath)
  }

  isDownloading(filePath: string | null | undefined) {
    return !!filePath && this.downloadingPaths().has(filePath)
  }

  isDeleting(filePath: string | null | undefined) {
    return !!filePath && this.deletingPaths().has(filePath)
  }

  showActions(item: FileTreeNode) {
    return !item.hasChildren && (this.canDownload() || this.canDelete())
  }

  onItemClick(item: FileTreeNode) {
    this.fileSelect.emit(item)
  }

  onDirectoryToggle(event: MouseEvent, item: FileTreeNode) {
    event.stopPropagation()
    this.directoryToggle.emit(item)
  }

  onFileDownload(event: MouseEvent, item: FileTreeNode) {
    event.stopPropagation()
    this.fileDownload.emit(item)
  }

  onFileDelete(event: MouseEvent, item: FileTreeNode) {
    event.stopPropagation()
    this.fileDelete.emit(item)
  }

  onUploadClick() {
    this.uploadRequest.emit()
  }
}
