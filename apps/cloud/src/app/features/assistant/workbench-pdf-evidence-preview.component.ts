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
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import type { WorkbenchOpenFileEvidenceBox } from '@xpert-ai/contracts'
import {
  getDocument,
  Util,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask
} from 'pdfjs-dist'

import {
  normalizePdfEvidenceRotation,
  resolvePdfEvidenceViewportRotation,
  rotateNormalizedEvidenceBox,
  type PdfEvidenceRotation
} from './workbench-pdf-evidence-rotation'

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

type PdfTextContentItem = Awaited<ReturnType<PDFPageProxy['getTextContent']>>['items'][number]
type PdfTextItem = Extract<PdfTextContentItem, { str: string }>

@Component({
  standalone: true,
  selector: 'xp-workbench-pdf-evidence-preview',
  imports: [TranslateModule],
  template: `
    <div #scrollHost class="relative h-full min-h-0 overflow-auto bg-components-panel-bg px-6 py-5">
      @if (loading()) {
        <div class="absolute inset-0 z-20 flex items-center justify-center bg-components-panel-bg/70">
          <div
            class="flex items-center gap-2 rounded-xl border border-divider-regular bg-components-card-bg px-3 py-2 text-sm text-text-secondary shadow-sm"
          >
            <i class="ri-loader-4-line animate-spin text-base"></i>
            <span>
              {{
                'PAC.Assistant.FilePreview.RenderingEvidencePage' | translate: { Default: 'Rendering evidence page…' }
              }}
            </span>
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
            <h3 class="mt-3 text-sm font-semibold text-text-primary">
              {{
                'PAC.Assistant.FilePreview.EvidencePageUnavailable'
                  | translate: { Default: 'Evidence page unavailable' }
              }}
            </h3>
            <p class="mt-2 text-sm leading-6 text-text-tertiary">{{ message }}</p>
          </div>
        </div>
      } @else {
        <div class="mx-auto w-fit pb-8">
          <div class="mb-3 flex items-center justify-between gap-3 text-xs text-text-tertiary">
            <span class="truncate">
              {{ fileName() || ('PAC.Assistant.FilePreview.PdfDocument' | translate: { Default: 'PDF document' }) }}
            </span>
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
                  {{ 'PAC.Assistant.FilePreview.Evidence' | translate: { Default: 'Evidence' } }}
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
  readonly #translate = inject(TranslateService)

  readonly url = input.required<string>()
  readonly fileName = input('')
  readonly page = input<number | null | undefined>(null)
  readonly box = input<WorkbenchOpenFileEvidenceBox | null>(null)
  readonly rotation = input<number | null | undefined>(0)
  readonly searchTerms = input<readonly string[]>([])

  readonly loading = signal(false)
  readonly error = signal<string | null>(null)
  readonly pageSize = signal<PageSize | null>(null)
  readonly pageCount = signal<number | null>(null)
  readonly renderedPage = signal<number | null>(null)
  readonly viewportWidth = signal(0)
  readonly textMarkerStyle = signal<MarkerStyle | null>(null)

  readonly requestedPage = computed(() => {
    const page = this.page()
    return Number.isInteger(page) && Number(page) > 0 ? Number(page) : 1
  })
  readonly displayRotation = computed(() => normalizePdfEvidenceRotation(this.rotation()))

  readonly normalizedMarkerStyle = computed<MarkerStyle | null>(() => {
    const box = this.box()
    const pageSize = this.pageSize()
    if (!box || !pageSize) {
      return null
    }

    const rotatedBox = rotateNormalizedEvidenceBox(box, this.displayRotation())
    return {
      left: rotatedBox.x * pageSize.width,
      top: rotatedBox.y * pageSize.height,
      width: rotatedBox.width * pageSize.width,
      height: rotatedBox.height * pageSize.height
    }
  })
  readonly markerStyle = computed<MarkerStyle | null>(() => this.textMarkerStyle() ?? this.normalizedMarkerStyle())

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
    const rotation = this.displayRotation()
    const searchTerms = this.searchTerms()
    const canvas = this.canvasRef()?.nativeElement

    if (!url || !canvas || width <= 0) {
      return
    }

    void this.render(url, page, width, canvas, rotation, searchTerms)
  })

  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.cancelRenderTask()
      this.destroyDocument()
    })
  }

  private async render(
    url: string,
    page: number,
    hostWidth: number,
    canvas: HTMLCanvasElement,
    recognitionRotation: PdfEvidenceRotation,
    searchTerms: readonly string[]
  ) {
    const serial = ++this.#renderSerial
    this.loading.set(true)
    this.error.set(null)
    this.textMarkerStyle.set(null)

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

      await this.renderPage(pdfPage, pageNumber, hostWidth, canvas, recognitionRotation, searchTerms)
      if (serial !== this.#renderSerial) {
        return
      }

      this.scrollMarkerIntoView(url, pageNumber)
    } catch (error) {
      if (serial === this.#renderSerial) {
        this.error.set(
          error instanceof Error
            ? error.message
            : this.#translate.instant('PAC.Assistant.FilePreview.UnknownPdfPreviewError', {
                Default: 'Unknown PDF preview error'
              })
        )
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

  private async renderPage(
    pdfPage: PDFPageProxy,
    pageNumber: number,
    hostWidth: number,
    canvas: HTMLCanvasElement,
    recognitionRotation: PdfEvidenceRotation,
    searchTerms: readonly string[]
  ) {
    this.cancelRenderTask()

    const viewportRotation = resolvePdfEvidenceViewportRotation(pdfPage.rotate, recognitionRotation)
    const baseViewport = pdfPage.getViewport({ scale: 1, rotation: viewportRotation })
    const availableWidth = Math.max(320, hostWidth - 48)
    const viewportScale = clampNumber(availableWidth / baseViewport.width, 0.35, 3)
    const viewport = pdfPage.getViewport({ scale: viewportScale, rotation: viewportRotation })
    const outputScale = Math.min(globalThis.devicePixelRatio || 1, 2)
    const canvasContext = canvas.getContext('2d')
    if (!canvasContext) {
      throw new Error(
        this.#translate.instant('PAC.Assistant.FilePreview.CanvasUnavailable', {
          Default: 'Canvas rendering context is unavailable.'
        })
      )
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
      this.textMarkerStyle.set(await resolveTextMarker(pdfPage, viewport, searchTerms, this.normalizedMarkerStyle()))
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

async function resolveTextMarker(
  pdfPage: PDFPageProxy,
  viewport: ReturnType<PDFPageProxy['getViewport']>,
  searchTerms: readonly string[],
  fallback: MarkerStyle | null
): Promise<MarkerStyle | null> {
  const terms = searchTerms
    .map(normalizeSearchText)
    .filter((term, index, values) => term.length >= 2 && values.indexOf(term) === index)
  if (!terms.length) {
    return null
  }

  const content = await pdfPage.getTextContent()
  const textItems = content.items.filter(isPdfTextItem)

  for (const term of terms) {
    const candidates = textItems
      .filter((item) => {
        const itemText = normalizeSearchText(item.str)
        return itemText.includes(term) || (itemText.length >= 4 && term.includes(itemText))
      })
      .map((item) => textItemMarker(item, viewport))
      .filter((marker): marker is MarkerStyle => marker !== null)

    if (candidates.length) {
      return closestMarker(candidates, fallback, viewport.width, viewport.height)
    }
  }

  return null
}

function textItemMarker(
  item: { str: string; transform: number[]; width: number; height: number },
  viewport: ReturnType<PDFPageProxy['getViewport']>
): MarkerStyle | null {
  const transform = Util.transform(viewport.transform, item.transform)
  const angle = Math.atan2(transform[1], transform[0])
  if (Math.abs(angle) > 0.12) {
    return null
  }

  const textHeight = Math.max(2, Math.hypot(transform[2], transform[3]))
  const textWidth = Math.max(2, Math.abs(item.width * viewport.scale))
  const padding = Math.max(2, Math.min(6, textHeight * 0.2))
  return clampMarker(
    {
      left: transform[4] - padding,
      top: transform[5] - textHeight - padding,
      width: textWidth + padding * 2,
      height: textHeight + padding * 2
    },
    viewport.width,
    viewport.height
  )
}

function closestMarker(
  candidates: MarkerStyle[],
  fallback: MarkerStyle | null,
  pageWidth: number,
  pageHeight: number
): MarkerStyle {
  if (!fallback || candidates.length === 1) {
    return candidates[0]
  }
  const fallbackX = (fallback.left + fallback.width / 2) / pageWidth
  const fallbackY = (fallback.top + fallback.height / 2) / pageHeight
  return candidates.reduce((closest, candidate) => {
    const distance = normalizedDistance(candidate, fallbackX, fallbackY, pageWidth, pageHeight)
    const closestDistance = normalizedDistance(closest, fallbackX, fallbackY, pageWidth, pageHeight)
    return distance < closestDistance ? candidate : closest
  })
}

function normalizedDistance(
  marker: MarkerStyle,
  targetX: number,
  targetY: number,
  pageWidth: number,
  pageHeight: number
) {
  const x = (marker.left + marker.width / 2) / pageWidth - targetX
  const y = (marker.top + marker.height / 2) / pageHeight - targetY
  return x * x + y * y
}

function clampMarker(marker: MarkerStyle, pageWidth: number, pageHeight: number): MarkerStyle {
  const left = Math.max(0, Math.min(pageWidth, marker.left))
  const top = Math.max(0, Math.min(pageHeight, marker.top))
  return {
    left,
    top,
    width: Math.max(1, Math.min(marker.width, pageWidth - left)),
    height: Math.max(1, Math.min(marker.height, pageHeight - top))
  }
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase()
}

function isPdfTextItem(item: PdfTextContentItem): item is PdfTextItem {
  return 'str' in item && Boolean(item.str.trim())
}
