import { ChangeDetectionStrategy, Component, ElementRef, effect, input, output, signal, viewChild } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { loadPdfPreviewRuntime } from './pdf-preview-runtime'

@Component({
  standalone: true,
  selector: 'xp-file-pdf-preview',
  imports: [TranslateModule],
  templateUrl: './file-pdf-preview.component.html',
  host: { class: 'flex h-full min-h-0 flex-col' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FilePdfPreviewComponent {
  readonly url = input<string | null>(null)
  readonly fileName = input('')
  readonly downloadable = input(false)
  readonly download = output<void>()
  readonly pageCount = signal(0)
  readonly pageNumber = signal(1)
  readonly zoom = signal(1)
  readonly loading = signal(false)
  readonly rendering = signal(false)
  readonly failed = signal(false)
  readonly retryCount = signal(0)
  private readonly pdf = signal<PDFDocumentProxy | null>(null)
  private readonly width = signal(0)
  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport')
  private readonly pageHost = viewChild<ElementRef<HTMLElement>>('pageHost')

  readonly resizeEffect = effect((onCleanup) => {
    const viewport = this.viewport()?.nativeElement
    if (!viewport) return
    const measure = () => this.width.set(Math.max(1, viewport.clientWidth - 32))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    onCleanup(() => observer.disconnect())
  })

  readonly loadEffect = effect((onCleanup) => {
    const url = this.url()
    this.retryCount()
    this.pdf.set(null)
    this.pageCount.set(0)
    this.pageNumber.set(1)
    this.zoom.set(1)
    this.failed.set(!url)
    this.loading.set(!!url)
    if (!url) return

    let active = true
    let task: PDFDocumentLoadingTask | undefined
    void (async () => {
      try {
        const runtime = await loadPdfPreviewRuntime()
        if (!active) return
        task = runtime.getDocument({ url, isEvalSupported: false })
        const pdf = await task.promise
        if (!active) return
        this.pageCount.set(pdf.numPages)
        this.pdf.set(pdf)
      } catch {
        if (active) this.failed.set(true)
      } finally {
        if (active) this.loading.set(false)
      }
    })()
    onCleanup(() => {
      active = false
      void task?.destroy().catch(() => undefined)
    })
  })

  readonly renderEffect = effect((onCleanup) => {
    const pdf = this.pdf()
    const pageNumber = this.pageNumber()
    const width = this.width()
    const zoom = this.zoom()
    const host = this.pageHost()?.nativeElement
    if (!host) return
    host.replaceChildren()
    this.rendering.set(false)
    if (!pdf || !width) return

    let active = true
    let task: RenderTask | undefined
    this.rendering.set(true)
    this.failed.set(false)
    // Each render owns its canvas, so cancelled resize/page requests cannot paint over the latest page.
    const canvas = document.createElement('canvas')
    canvas.className = 'block mx-auto shadow-sm'
    host.append(canvas)
    void (async () => {
      const page = await pdf.getPage(pageNumber)
      try {
        if (!active) return
        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: (width / base.width) * zoom })
        const density = Math.min(
          window.devicePixelRatio || 1,
          2,
          16384 / viewport.width,
          16384 / viewport.height,
          Math.sqrt(16_000_000 / (viewport.width * viewport.height))
        )
        canvas.width = Math.max(1, Math.floor(viewport.width * density))
        canvas.height = Math.max(1, Math.floor(viewport.height * density))
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        const canvasContext = canvas.getContext('2d')
        if (!canvasContext) throw new Error('Canvas unavailable')
        task = page.render({ canvasContext, viewport, transform: [density, 0, 0, density, 0, 0] })
        await task.promise
      } finally {
        page.cleanup()
      }
    })()
      .catch(() => {
        if (active) this.failed.set(true)
      })
      .finally(() => {
        if (active) this.rendering.set(false)
      })
    onCleanup(() => {
      active = false
      task?.cancel()
      canvas.remove()
    })
  })

  changePage(offset: number) {
    this.pageNumber.update((page) => Math.max(1, Math.min(this.pageCount(), page + offset)))
    this.viewport()?.nativeElement.scrollTo({ top: 0, left: 0 })
  }

  changeZoom(offset: number) {
    this.zoom.update((zoom) => Math.max(0.5, Math.min(3, Math.round((zoom + offset) * 100) / 100)))
  }
}
