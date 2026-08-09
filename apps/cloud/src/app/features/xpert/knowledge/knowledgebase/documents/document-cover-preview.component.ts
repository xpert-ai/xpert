import 'pdfjs-dist/build/pdf.worker.entry'

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  viewChild
} from '@angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { getDocument, type PDFDocumentLoadingTask, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'

/** Authenticated PDF.js source returned by the knowledge-document preview service. */
export type KnowledgeDocumentCoverSource = {
  url: string
  httpHeaders: Record<string, string>
  withCredentials: boolean
}

/**
 * Renders the complete first PDF page as a non-interactive document cover.
 *
 * Unlike the full file and analysis previews, this component has no scrolling,
 * zooming, page navigation, or text interaction. It uses the protected Range
 * endpoint only to create a lightweight visual identity for the selected file.
 */
@Component({
  standalone: true,
  selector: 'xp-knowledge-document-cover-preview',
  imports: [TranslateModule],
  template: `
    <div
      #host
      role="img"
      class="relative flex h-full w-full items-center justify-center overflow-hidden bg-muted/30 p-2"
      [attr.aria-label]="
        ('XP.Knowledgebase.DocumentCoverFor' | translate: { Default: 'Document cover for' }) + ' ' + fileName()
      "
    >
      <canvas
        #canvas
        class="block max-h-full max-w-full rounded-sm border border-border bg-background shadow-sm transition-opacity"
        [class.opacity-0]="loading() || !!error()"
      ></canvas>

      @if (loading()) {
        <div class="absolute inset-0 flex items-center justify-center text-text-tertiary">
          <i class="ri-loader-4-line animate-spin text-xl"></i>
        </div>
      }

      @if (error()) {
        <div class="absolute inset-0 flex flex-col items-center justify-center p-5 text-center">
          <i class="ri-file-warning-line text-2xl text-text-tertiary"></i>
          <span class="mt-2 text-sm text-text-tertiary">
            {{ 'XP.Knowledgebase.CoverUnavailable' | translate: { Default: 'Document cover is unavailable.' } }}
          </span>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class KnowledgeDocumentCoverPreviewComponent {
  readonly #destroyRef = inject(DestroyRef)
  readonly #translate = inject(TranslateService)

  readonly source = input.required<KnowledgeDocumentCoverSource>()
  readonly fileName = input('')

  readonly loading = signal(true)
  readonly error = signal<string | null>(null)
  readonly hostSize = signal({ width: 0, height: 0 })

  readonly host = viewChild<ElementRef<HTMLElement>>('host')
  readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas')

  #loadingTask: PDFDocumentLoadingTask | null = null
  #pdf: PDFDocumentProxy | null = null
  #renderTask: RenderTask | null = null
  #sourceKey: string | null = null
  #renderSerial = 0

  /** Keeps the page scaled to fit the thumbnail when the inspector changes size. */
  readonly #observeHostEffect = effect((onCleanup) => {
    const host = this.host()?.nativeElement
    if (!host || typeof ResizeObserver === 'undefined') {
      return
    }

    const updateSize = () => this.hostSize.set({ width: host.clientWidth, height: host.clientHeight })
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(host)
    onCleanup(() => observer.disconnect())
  })

  /** Re-renders only page one and always fits the entire page inside the cover card. */
  readonly #renderEffect = effect(() => {
    const source = this.source()
    const { width, height } = this.hostSize()
    const canvas = this.canvas()?.nativeElement
    if (!source?.url || !canvas || width <= 0 || height <= 0) {
      return
    }

    void this.renderCover(source, width, height, canvas)
  })

  constructor() {
    this.#destroyRef.onDestroy(() => this.destroyDocument())
  }

  private async renderCover(
    source: KnowledgeDocumentCoverSource,
    hostWidth: number,
    hostHeight: number,
    canvas: HTMLCanvasElement
  ) {
    const serial = ++this.#renderSerial
    this.loading.set(true)
    this.error.set(null)

    try {
      const pdf = await this.ensureDocument(source)
      const page = await pdf.getPage(1)
      if (serial !== this.#renderSerial) {
        page.cleanup()
        return
      }

      const baseViewport = page.getViewport({ scale: 1 })
      // Match the eight-pixel host padding so the page uses the full thumbnail
      // content box instead of reserving the same inset a second time.
      const availableWidth = Math.max(1, hostWidth - 16)
      const availableHeight = Math.max(1, hostHeight - 16)
      const scale = Math.min(availableWidth / baseViewport.width, availableHeight / baseViewport.height)
      const viewport = page.getViewport({ scale: Math.max(0.1, Math.min(scale, 2)) })
      const outputScale = Math.min(globalThis.devicePixelRatio || 1, 2)
      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error(
          this.#translate.instant('XP.Assistant.FilePreview.CanvasUnavailable', {
            Default: 'Canvas rendering context is unavailable.'
          })
        )
      }

      canvas.width = Math.max(1, Math.floor(viewport.width * outputScale))
      canvas.height = Math.max(1, Math.floor(viewport.height * outputScale))
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      context.clearRect(0, 0, canvas.width, canvas.height)

      this.cancelRenderTask()
      const renderTask = page.render({
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0]
      })
      this.#renderTask = renderTask
      try {
        await renderTask.promise
      } finally {
        if (this.#renderTask === renderTask) {
          this.#renderTask = null
        }
        page.cleanup()
      }
    } catch (error) {
      if (serial === this.#renderSerial) {
        this.error.set(error instanceof Error ? error.message : 'Document cover rendering failed')
      }
    } finally {
      if (serial === this.#renderSerial) {
        this.loading.set(false)
      }
    }
  }

  private async ensureDocument(source: KnowledgeDocumentCoverSource) {
    const sourceKey = createSourceKey(source)
    if (this.#pdf && this.#sourceKey === sourceKey) {
      return this.#pdf
    }

    this.destroyDocument()
    this.#sourceKey = sourceKey
    this.#loadingTask = getDocument({
      url: source.url,
      httpHeaders: source.httpHeaders,
      withCredentials: source.withCredentials
    })
    this.#pdf = await this.#loadingTask.promise
    return this.#pdf
  }

  private cancelRenderTask() {
    this.#renderTask?.cancel()
    this.#renderTask = null
  }

  private destroyDocument() {
    this.cancelRenderTask()
    const loadingTask = this.#loadingTask
    const pdf = this.#pdf
    this.#loadingTask = null
    this.#pdf = null
    this.#sourceKey = null

    if (pdf) {
      void pdf.destroy().catch(noop)
    } else {
      void loadingTask?.destroy().catch(noop)
    }
  }
}

/** Produces a stable identity without exposing request headers in UI state or logs. */
function createSourceKey(source: KnowledgeDocumentCoverSource) {
  return JSON.stringify([
    source.url,
    Object.entries(source.httpHeaders).sort(([left], [right]) => left.localeCompare(right)),
    source.withCredentials
  ])
}

function noop() {}
