import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core'
import { SafePipe } from '@xpert-ai/core'
import { NgmSpinComponent, NgmTableComponent } from '@xpert-ai/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
import { FileEditorSelection } from '../editor/editor.component'
import { FilePreviewKind, SpreadsheetPreview } from './file-preview.utils'
import { clamp, inferTextPreviewSelection, toSelectionElement } from './preview-selection.utils'

type FilePreviewReferenceSelection = {
  left: number
  top: number
  selection: FileEditorSelection
}

@Component({
  standalone: true,
  selector: 'pac-file-preview-content',
  templateUrl: './file-preview-content.component.html',
  imports: [TranslateModule, MarkdownModule, SafePipe, NgmSpinComponent, NgmTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FilePreviewContentComponent {
  readonly #destroyRef = inject(DestroyRef)

  readonly previewKind = input<FilePreviewKind>('unsupported')
  readonly content = input<string | null>(null)
  readonly documentHtml = input<string | null>(null)
  readonly downloadable = input(false)
  readonly error = input<string | null>(null)
  readonly fileName = input<string>('')
  readonly loading = input(false)
  readonly referenceable = input(false)
  readonly spreadsheet = input<SpreadsheetPreview | null>(null)
  readonly url = input<string | null>(null)

  readonly download = output<void>()
  readonly referenceSelection = output<FileEditorSelection>()

  readonly htmlPreviewUrl = signal<string | null>(null)
  readonly hasDocumentHtml = computed(() => this.previewKind() === 'document' && !!this.documentHtml())
  readonly documentPreviewReferenceable = computed(
    () => this.referenceable() && this.previewKind() === 'document' && !this.loading()
  )
  readonly selectedSheetIndex = signal(0)
  readonly documentPreviewSelection = signal<FilePreviewReferenceSelection | null>(null)
  readonly activeSheet = computed(() => this.spreadsheet()?.sheets[this.selectedSheetIndex()] ?? null)
  readonly showUnsupportedState = computed(
    () =>
      !this.loading() &&
      (this.previewKind() === 'unsupported' ||
        !!this.error() ||
        (this.previewKind() === 'spreadsheet' && !this.activeSheet()))
  )

  readonly #resetSheetSelectionEffect = effect(() => {
    this.spreadsheet()
    this.selectedSheetIndex.set(0)
  })

  readonly #resetDocumentSelectionEffect = effect(() => {
    this.previewKind()
    this.content()
    this.documentHtml()
    this.loading()
    this.referenceable()
    this.documentPreviewSelection.set(null)
  })

  readonly #htmlPreviewUrlEffect = effect((onCleanup) => {
    const previewKind = this.previewKind()
    const url = this.url()
    const content = this.content()
    const objectUrl =
      previewKind === 'html' && !url && typeof content === 'string' ? createHtmlPreviewObjectUrl(content) : null

    this.htmlPreviewUrl.set(previewKind === 'html' ? url || objectUrl : null)

    onCleanup(() => {
      if (objectUrl) {
        revokePreviewObjectUrl(objectUrl)
      }
    })
  })

  private readonly documentPreviewHost = viewChild<ElementRef<HTMLElement>>('documentPreviewHost')
  private readonly documentPreviewBody = viewChild<ElementRef<HTMLElement>>('documentPreviewBody')

  constructor() {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return
    }

    const selectionHandler = () => this.updateDocumentPreviewSelection()
    const clearHandler = () => this.clearDocumentPreviewSelection()

    document.addEventListener('selectionchange', selectionHandler)
    window.addEventListener('resize', clearHandler)
    window.addEventListener('scroll', clearHandler, true)

    this.#destroyRef.onDestroy(() => {
      document.removeEventListener('selectionchange', selectionHandler)
      window.removeEventListener('resize', clearHandler)
      window.removeEventListener('scroll', clearHandler, true)
    })
  }

  emitDocumentReferenceSelection() {
    const selection = this.documentPreviewSelection()?.selection
    if (!selection) {
      return
    }

    this.referenceSelection.emit(selection)
    this.clearBrowserSelection()
    this.clearDocumentPreviewSelection()
  }

  private updateDocumentPreviewSelection() {
    if (!this.documentPreviewReferenceable() || typeof document === 'undefined') {
      this.clearDocumentPreviewSelection()
      return
    }

    const host = this.documentPreviewHost()?.nativeElement
    const body = this.documentPreviewBody()?.nativeElement
    const selection = document.getSelection()
    if (!host || !body || !selection || selection.isCollapsed || selection.rangeCount === 0) {
      this.clearDocumentPreviewSelection()
      return
    }

    const text = selection.toString().trim()
    if (!text) {
      this.clearDocumentPreviewSelection()
      return
    }

    const anchorElement = toSelectionElement(selection.anchorNode)
    const focusElement = toSelectionElement(selection.focusNode)
    if (!anchorElement || !focusElement || !body.contains(anchorElement) || !body.contains(focusElement)) {
      this.clearDocumentPreviewSelection()
      return
    }

    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    if (!rect.width && !rect.height) {
      this.clearDocumentPreviewSelection()
      return
    }

    const referenceText = this.resolveDocumentReferenceText(body)
    const inferredSelection = inferTextPreviewSelection(referenceText, text)
    if (!inferredSelection) {
      this.clearDocumentPreviewSelection()
      return
    }

    const hostRect = host.getBoundingClientRect()
    const left = clamp(
      rect.left + rect.width / 2 - hostRect.left + host.scrollLeft,
      88,
      Math.max(88, host.clientWidth - 88)
    )
    const top = Math.max(48, rect.top - hostRect.top + host.scrollTop - 8)

    this.documentPreviewSelection.set({
      left,
      top,
      selection: inferredSelection
    })
  }

  private resolveDocumentReferenceText(body: HTMLElement) {
    const content = this.content()
    if (content?.trim()) {
      return content
    }

    return body.innerText || body.textContent || ''
  }

  private clearDocumentPreviewSelection() {
    this.documentPreviewSelection.set(null)
  }

  private clearBrowserSelection() {
    if (typeof document === 'undefined') {
      return
    }

    const selection = document.getSelection()
    if (selection && typeof selection.removeAllRanges === 'function') {
      selection.removeAllRanges()
    }
  }
}

function createHtmlPreviewObjectUrl(content: string) {
  if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return `data:text/html;charset=utf-8,${encodeURIComponent(content)}`
  }

  return URL.createObjectURL(
    new Blob([content], {
      type: 'text/html;charset=utf-8'
    })
  )
}

function revokePreviewObjectUrl(url: string) {
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function' || !url.startsWith('blob:')) {
    return
  }

  URL.revokeObjectURL(url)
}
