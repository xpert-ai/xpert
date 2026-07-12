import 'pdfjs-dist/build/pdf.worker.entry'

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild
} from '@angular/core'
import {
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask
} from 'pdfjs-dist'

import type { WorkbenchOpenFileEvidenceBox } from './workbench-file-open-client-command'

type PageSize = {
  width: number
  height: number
}

type MarkerStyle = {
  left: number
  top: number
  width: number
  height: number
}

@Component({
  standalone: true,
  selector: 'xp-workbench-pdf-evidence-preview',
  template: `
    <div #scrollHost class="relative h-full min-h-0 overflow-auto bg-components-panel-bg px-6 py-5">
      @if (loading()) {
        <div class="absolute inset-0 z-20 flex items-center justify-center bg-components-panel-bg/70">
          <div
            class="flex items-center gap-2 rounded-xl border border-divider-regular bg-components-card-bg px-3 py-2 text-sm text-text-secondary shadow-sm"
          >
            <i class="ri-loader-4-line animate-spin text-base"></i>
            <span>正在渲染证据页…</span>
          </div>
        </div>
      }

      @if (error(); as message) {
        <div class="flex h-full min-h-[360px] items-center justify-center">
          <div
            class="max-w-md rounded-2xl border border-divider-regular bg-components-card-bg p-5 text-center shadow-sm"
          >
            <div
              class="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-background-default-subtle text-text-secondary"
            >
              <i class="ri-file-warning-line text-xl"></i>
            </div>
            <h3 class="mt-3 text-sm font-semibold text-text-primary">证据页无法预览</h3>
            <p class="mt-2 text-sm leading-6 text-text-tertiary">{{ message }}</p>
          </div>
        </div>
      } @else {
        <div class="mx-auto w-fit pb-8">
          <div class="mb-3 flex items-center justify-between gap-3 text-xs text-text-tertiary">
            <span class="truncate">{{ fileName() || 'PDF document' }}</span>
            <span class="shrink-0">
              P{{ renderedPage() || requestedPage() }}
              @if (pageCount()) {
                / {{ pageCount() }}
              }
            </span>
          </div>

          <div
            class="relative overflow-hidden rounded-sm border border-divider-regular bg-background-default shadow-sm"
            [style.width.px]="pageSize()?.width || 0"
            [style.height.px]="pageSize()?.height || 0"
          >
            <canvas #canvasRef class="block h-full w-full"></canvas>

            @if (markerStyle(); as marker) {
              <div
                class="pointer-events-none absolute z-10 border-2 border-text-destructive bg-status-error-bg shadow-[0_0_0_9999px_color-mix(in_oklab,var(--color-status-error-bg)_16%,transparent)]"
                [style.left.px]="marker.left"
                [style.top.px]="marker.top"
                [style.width.px]="marker.width"
                [style.height.px]="marker.height"
              >
                <span
                  class="absolute -top-6 left-0 rounded bg-text-destructive px-1.5 py-0.5 text-xs font-medium leading-5 text-components-button-primary-text shadow"
                >
                  证据
                </span>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkbenchPdfEvidencePreviewComponent {
  readonly #destroyRef = inject(DestroyRef)

  readonly url = input.required<string>()
  readonly fileName = input('')
  readonly page = input<number | null | undefined>(null)
  readonly box = input<WorkbenchOpenFileEvidenceBox | null>(null)

  readonly loading = signal(false)
  readonly error = signal<string | null>(null)
  readonly pageSize = signal<PageSize | null>(null)
  readonly pageCount = signal<number | null>(null)
  readonly renderedPage = signal<number | null>(null)
  readonly viewportWidth = signal(0)

  readonly requestedPage = computed(() => {
    const page = this.page()
    return Number.isInteger(page) && Number(page) > 0 ? Number(page) : 1
  })

  readonly markerStyle = computed<MarkerStyle | null>(() => {
    const box = this.box()
    const pageSize = this.pageSize()
    if (!box || !pageSize) {
      return null
    }

    return {
      left: box.x * pageSize.width,
      top: box.y * pageSize.height,
      width: box.width * pageSize.width,
      height: box.height * pageSize.height
    }
  })

  private readonly scrollHost = viewChild<ElementRef<HTMLElement>>('scrollHost')
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvasRef')

  #loadedUrl: string | null = null
  #loadingTask: PDFDocumentLoadingTask | null = null
  #pdf: PDFDocumentProxy | null = null
  #renderTask: RenderTask | null = null
  #renderSerial = 0
  #lastScrollTarget: string | null = null

  readonly #observeSizeEffect = effect((onCleanup) => {
    const host = this.scrollHost()?.nativeElement
    if (!host || typeof ResizeObserver === 'undefined') {
      return
    }

    const updateWidth = () => this.viewportWidth.set(host.clientWidth)
    updateWidth()

    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updateWidth)
    })
    observer.observe(host)

    onCleanup(() => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    })
  })

  readonly #renderEffect = effect(() => {
    const url = this.url()
    const page = this.requestedPage()
    const width = this.viewportWidth()
    const canvas = this.canvasRef()?.nativeElement

    if (!url || !canvas || width <= 0) {
      return
    }

    void this.render(url, page, width, canvas)
  })

  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.cancelRenderTask()
      this.destroyDocument()
    })
  }

  private async render(url: string, page: number, hostWidth: number, canvas: HTMLCanvasElement) {
    const serial = ++this.#renderSerial
    this.loading.set(true)
    this.error.set(null)

    try {
      const pdf = await this.ensureDocument(url)
      if (serial !== this.#renderSerial) {
        return
      }

      this.pageCount.set(pdf.numPages)
      const pageNumber = clampInteger(page, 1, pdf.numPages)
      const pdfPage = await pdf.getPage(pageNumber)
      if (serial !== this.#renderSerial) {
        pdfPage.cleanup()
        return
      }

      await this.renderPage(pdfPage, pageNumber, hostWidth, canvas)
      if (serial !== this.#renderSerial) {
        return
      }

      this.scrollMarkerIntoView(url, pageNumber)
    } catch (error) {
      if (serial === this.#renderSerial) {
        this.error.set(error instanceof Error ? error.message : 'Unknown PDF preview error')
        this.pageSize.set(null)
      }
    } finally {
      if (serial === this.#renderSerial) {
        this.loading.set(false)
      }
    }
  }

  private async ensureDocument(url: string) {
    if (this.#pdf && this.#loadedUrl === url) {
      return this.#pdf
    }

    this.destroyDocument()
    this.#loadedUrl = url
    this.#loadingTask = getDocument({ url })
    this.#pdf = await this.#loadingTask.promise
    return this.#pdf
  }

  private async renderPage(pdfPage: PDFPageProxy, pageNumber: number, hostWidth: number, canvas: HTMLCanvasElement) {
    this.cancelRenderTask()

    const baseViewport = pdfPage.getViewport({ scale: 1 })
    const availableWidth = Math.max(320, hostWidth - 48)
    const viewportScale = clampNumber(availableWidth / baseViewport.width, 0.35, 3)
    const viewport = pdfPage.getViewport({ scale: viewportScale })
    const outputScale = Math.min(globalThis.devicePixelRatio || 1, 2)
    const canvasContext = canvas.getContext('2d')
    if (!canvasContext) {
      throw new Error('Canvas rendering context is unavailable.')
    }

    const viewportWidth = Math.floor(viewport.width)
    const viewportHeight = Math.floor(viewport.height)
    canvas.width = Math.max(1, Math.floor(viewport.width * outputScale))
    canvas.height = Math.max(1, Math.floor(viewport.height * outputScale))
    canvas.style.width = `${viewportWidth}px`
    canvas.style.height = `${viewportHeight}px`
    canvasContext.clearRect(0, 0, canvas.width, canvas.height)

    this.pageSize.set({
      width: viewportWidth,
      height: viewportHeight
    })
    this.renderedPage.set(pageNumber)

    const transform = outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0]
    const renderTask = pdfPage.render({
      canvasContext,
      viewport,
      transform
    })
    this.#renderTask = renderTask

    try {
      await renderTask.promise
    } finally {
      if (this.#renderTask === renderTask) {
        this.#renderTask = null
      }
      pdfPage.cleanup()
    }
  }

  private scrollMarkerIntoView(url: string, pageNumber: number) {
    const marker = this.markerStyle()
    const host = this.scrollHost()?.nativeElement
    if (!marker || !host) {
      return
    }

    const targetKey = `${url}:${pageNumber}:${marker.left}:${marker.top}:${marker.width}:${marker.height}`
    if (this.#lastScrollTarget === targetKey) {
      return
    }
    this.#lastScrollTarget = targetKey

    requestAnimationFrame(() => {
      const centerLeft = marker.left + marker.width / 2
      const centerTop = marker.top + marker.height / 2
      host.scrollTo({
        left: Math.max(0, centerLeft - host.clientWidth / 2),
        top: Math.max(0, centerTop - host.clientHeight / 2),
        behavior: 'smooth'
      })
    })
  }

  private cancelRenderTask() {
    if (!this.#renderTask) {
      return
    }

    this.#renderTask.cancel()
    this.#renderTask = null
  }

  private destroyDocument() {
    this.cancelRenderTask()

    const loadingTask = this.#loadingTask
    const pdf = this.#pdf
    this.#loadingTask = null
    this.#pdf = null
    this.#loadedUrl = null

    if (pdf) {
      void pdf.destroy().catch(noop)
      return
    }

    void loadingTask?.destroy().catch(noop)
  }
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min
  }

  return Math.min(max, Math.max(min, value))
}

function noop() {}
