import { HttpClient } from '@angular/common/http'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  viewChild
} from '@angular/core'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { ZardSegmentedComponent, ZardSegmentedItemComponent } from '@xpert-ai/headless-ui'
import { MarkdownModule } from 'ngx-markdown'
import { firstValueFrom } from 'rxjs'
import { TFile } from '@xpert-ai/contracts'
import { FileEditorComponent, FileEditorSelection } from '../editor/editor.component'
import { FormsModule } from '@angular/forms'
import { FilePreviewContentComponent } from '../preview/file-preview-content.component'
import { createFilePreviewState, toFilePreviewSource } from '../preview/file-preview.utils'

export type FilePanelMode = 'view' | 'edit'

type FileViewerPreviewSelection = {
  left: number
  top: number
  selection: FileEditorSelection
}

@Component({
  standalone: true,
  selector: 'pac-file-viewer',
  templateUrl: './viewer.component.html',
  styleUrls: ['./viewer.component.css'],
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MarkdownModule,
    NgmSpinComponent,
    ZardSegmentedComponent,
    ZardSegmentedItemComponent,
    FileEditorComponent,
    FilePreviewContentComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FileViewerComponent {
  readonly #httpClient = inject(HttpClient)
  readonly #destroyRef = inject(DestroyRef)

  readonly file = input<TFile | null>(null)
  readonly filePath = input<string | null>(null)
  readonly content = input<string>('')
  readonly loading = input(false)
  readonly saving = input(false)
  readonly readable = input(false)
  readonly editable = input(false)
  readonly markdown = input(false)
  readonly dirty = input(false)
  readonly downloadable = input(false)
  readonly referenceable = input(false)
  readonly previewUrl = input<string | null>(null)
  readonly mode = model<FilePanelMode>('view')
  readonly readOnlyHint = input(
    'This file is shown in read-only mode. Only markdown, code, and selected text formats can be edited.'
  )
  readonly unsupportedPreviewTitle = input('This file cannot be previewed here.')
  readonly unsupportedPreviewHint = input(
    'This file is not a text-based format. Download it to inspect the original contents in another app.'
  )

  readonly displayFileName = computed(() => fileNameFromPath(this.filePath()))
  readonly canReferenceFile = computed(() => this.referenceable() && this.readable() && !!this.filePath())
  readonly previewMode = signal<'preview' | 'code'>('preview')
  readonly previewSource = computed(() =>
    toFilePreviewSource({
      ...(this.file() ?? {}),
      contents:
        this.readable() || this.mode() === 'edit'
          ? this.content()
          : typeof this.file()?.contents === 'string'
            ? this.file()?.contents
            : null,
      filePath: this.filePath() || this.file()?.filePath || null,
      name: this.filePath() || this.file()?.filePath || null,
      url: this.previewUrl() || this.file()?.url || null,
      fileUrl: this.previewUrl() || this.file()?.fileUrl || null
    })
  )
  readonly previewState = createFilePreviewState(this.previewSource, (url) =>
    firstValueFrom(this.#httpClient.get(url, { responseType: 'text' }))
  )
  readonly previewKind = this.previewState.previewKind
  readonly previewData = this.previewState.previewData
  readonly previewLoading = this.previewState.previewLoading
  readonly canTogglePreview = this.previewState.canTogglePreview
  readonly isPreviewMode = computed(
    () => this.mode() === 'view' && (!this.canTogglePreview() || this.previewMode() === 'preview')
  )
  readonly showEnhancedPreview = computed(
    () => this.isPreviewMode() && this.previewKind() !== 'unsupported' && !this.markdown()
  )
  readonly editorReferenceable = computed(
    () => this.referenceable() && this.readable() && (this.mode() === 'edit' || !this.isPreviewMode())
  )
  readonly markdownPreviewReferenceable = computed(
    () => this.referenceable() && this.readable() && this.markdown() && this.isPreviewMode()
  )
  readonly #markdownPreviewSelection = signal<FileViewerPreviewSelection | null>(null)
  readonly markdownPreviewReference = computed(() =>
    this.markdownPreviewReferenceable() ? this.#markdownPreviewSelection() : null
  )
  private readonly markdownPreviewHost = viewChild<ElementRef<HTMLElement>>('markdownPreviewHost')

  readonly contentChange = output<string>()
  readonly discard = output<void>()
  readonly save = output<void>()
  readonly back = output<void>()
  readonly download = output<void>()
  readonly referenceFile = output<void>()
  readonly referenceSelection = output<FileEditorSelection>()

  readonly #resetPreviewSelectionEffect = effect(() => {
    this.filePath()
    this.content()
    this.mode()
    this.markdown()
    this.previewKind()
    this.referenceable()
    this.#markdownPreviewSelection.set(null)
  })

  readonly #resetPreviewModeEffect = effect(() => {
    this.filePath()
    this.mode()
    this.previewKind()
    this.previewMode.set('preview')
  })

  constructor() {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return
    }

    const selectionHandler = () => this.updateMarkdownPreviewSelection()
    const clearHandler = () => this.clearMarkdownPreviewSelection()

    document.addEventListener('selectionchange', selectionHandler)
    window.addEventListener('resize', clearHandler)
    window.addEventListener('scroll', clearHandler, true)

    this.#destroyRef.onDestroy(() => {
      document.removeEventListener('selectionchange', selectionHandler)
      window.removeEventListener('resize', clearHandler)
      window.removeEventListener('scroll', clearHandler, true)
    })
  }

  emitFileReference() {
    if (!this.canReferenceFile()) {
      return
    }

    this.referenceFile.emit()
  }

  emitMarkdownPreviewReference() {
    const selection = this.#markdownPreviewSelection()?.selection
    if (!selection) {
      return
    }

    this.referenceSelection.emit(selection)
    this.clearBrowserSelection()
    this.clearMarkdownPreviewSelection()
  }

  private updateMarkdownPreviewSelection() {
    if (!this.markdownPreviewReferenceable() || typeof document === 'undefined' || typeof window === 'undefined') {
      this.clearMarkdownPreviewSelection()
      return
    }

    const previewHost = this.markdownPreviewHost()?.nativeElement
    const selection = document.getSelection()
    if (!previewHost || !selection || selection.isCollapsed || selection.rangeCount === 0) {
      this.clearMarkdownPreviewSelection()
      return
    }

    const text = selection.toString().trim()
    if (!text) {
      this.clearMarkdownPreviewSelection()
      return
    }

    const anchorElement = toSelectionElement(selection.anchorNode)
    const focusElement = toSelectionElement(selection.focusNode)
    if (!anchorElement || !focusElement || !previewHost.contains(anchorElement) || !previewHost.contains(focusElement)) {
      this.clearMarkdownPreviewSelection()
      return
    }

    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    if (!rect.width && !rect.height) {
      this.clearMarkdownPreviewSelection()
      return
    }

    const inferredSelection = inferMarkdownPreviewSelection(this.content(), text)
    if (!inferredSelection) {
      this.clearMarkdownPreviewSelection()
      return
    }

    const previewRect = previewHost.getBoundingClientRect()
    const left = clamp(
      rect.left + rect.width / 2 - previewRect.left + previewHost.scrollLeft,
      88,
      Math.max(88, previewHost.clientWidth - 88)
    )
    const top = Math.max(48, rect.top - previewRect.top + previewHost.scrollTop - 8)

    this.#markdownPreviewSelection.set({
      left,
      top,
      selection: inferredSelection
    })
  }

  private clearMarkdownPreviewSelection() {
    this.#markdownPreviewSelection.set(null)
  }

  private clearBrowserSelection() {
    if (typeof document === 'undefined') {
      return
    }

    document.getSelection()?.removeAllRanges()
  }

  updatePreviewMode(mode: unknown) {
    this.previewMode.set(mode === 'code' ? 'code' : 'preview')
  }
}

function fileNameFromPath(filePath?: string | null) {
  const normalized = (filePath ?? '').trim()
  return normalized.split('/').pop() || normalized
}

export function inferMarkdownPreviewSelection(content: string, selectedText: string): FileEditorSelection | null {
  const text = selectedText.trim()
  if (!text) {
    return null
  }

  const directMatch = buildSelectionFromIndexRange(content, text, content.indexOf(text))
  if (directMatch) {
    return directMatch
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) {
    return null
  }

  const startIndex = content.indexOf(lines[0])
  if (startIndex === -1) {
    return buildSelectionFromIndexRange(content, text, 0)
  }

  const lastLine = lines.length > 1 ? lines[lines.length - 1] : lines[0]
  const endLineSearchFrom = lines.length > 1 ? startIndex + lines[0].length : startIndex
  const endIndex = content.indexOf(lastLine, endLineSearchFrom)

  if (endIndex === -1) {
    return buildSelectionFromIndexRange(content, text, startIndex)
  }

  return buildSelectionFromIndexRange(content, text, startIndex, endIndex + lastLine.length)
}

function buildSelectionFromIndexRange(content: string, text: string, startIndex: number, endIndex?: number) {
  if (startIndex < 0) {
    return null
  }

  const normalizedEndIndex = Math.max(startIndex, endIndex ?? startIndex + text.length)
  const startLine = countLines(content.slice(0, startIndex))
  const endLine = countLines(content.slice(0, normalizedEndIndex))

  return {
    text,
    startLine,
    endLine
  }
}

function countLines(value: string) {
  return value ? value.split(/\r?\n/).length : 1
}

function toSelectionElement(node: Node | null): HTMLElement | null {
  if (!node) {
    return null
  }

  if (node instanceof HTMLElement) {
    return node
  }

  return node.parentElement
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
