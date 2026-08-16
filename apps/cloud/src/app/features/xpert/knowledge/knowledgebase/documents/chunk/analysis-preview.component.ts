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
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import {
  DocumentAnalysisBlockType,
  KnowledgeDocumentAnalysisBlock,
  KnowledgeDocumentAnalysisPage,
  KnowledgeDocumentAnalysisPreview
} from '@xpert-ai/contracts'
import { XpSpinComponent } from '@xpert-ai/headless-ui'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { NgxJsonViewerModule } from 'ngx-json-viewer'
import { MarkdownModule } from 'ngx-markdown'
import { getDocument, type PDFDocumentLoadingTask, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
import { finalize, Subscription } from 'rxjs'
import { KnowledgeDocumentService } from '../../../../../../@core'
import {
  analysisScrollTopForLocation,
  resolveAnalysisScrollLocation,
  type AnalysisPageMetric,
  type AnalysisScrollLocation
} from './analysis-preview-scroll'

type AvailableAnalysisPreview = Extract<KnowledgeDocumentAnalysisPreview, { available: true }>
type AnalysisTab = 'markdown' | 'structure' | 'tables' | 'images' | 'json'
type MobilePane = 'source' | 'result'
type ScrollPane = MobilePane

const ANALYSIS_PREVIEW_I18N = 'XP.Knowledgebase.AnalysisPreview'

const TYPE_LABELS: Record<DocumentAnalysisBlockType, { icon: string; labelKey: string }> = {
  text: { icon: 'ri-text', labelKey: `${ANALYSIS_PREVIEW_I18N}.BlockTypes.Text` },
  title: { icon: 'ri-heading', labelKey: `${ANALYSIS_PREVIEW_I18N}.BlockTypes.Title` },
  table: { icon: 'ri-table-line', labelKey: `${ANALYSIS_PREVIEW_I18N}.BlockTypes.Table` },
  image: { icon: 'ri-image-line', labelKey: `${ANALYSIS_PREVIEW_I18N}.BlockTypes.Image` },
  formula: { icon: 'ri-function-line', labelKey: `${ANALYSIS_PREVIEW_I18N}.BlockTypes.Formula` },
  header: { icon: 'ri-layout-top-line', labelKey: `${ANALYSIS_PREVIEW_I18N}.BlockTypes.Header` },
  footer: { icon: 'ri-layout-bottom-line', labelKey: `${ANALYSIS_PREVIEW_I18N}.BlockTypes.Footer` },
  footnote: { icon: 'ri-footprint-line', labelKey: `${ANALYSIS_PREVIEW_I18N}.BlockTypes.Footnote` },
  'page-number': { icon: 'ri-hashtag', labelKey: `${ANALYSIS_PREVIEW_I18N}.BlockTypes.PageNumber` },
  seal: { icon: 'ri-stamp-line', labelKey: `${ANALYSIS_PREVIEW_I18N}.BlockTypes.Seal` },
  other: { icon: 'ri-shapes-line', labelKey: `${ANALYSIS_PREVIEW_I18N}.BlockTypes.Other` }
}

@Component({
  standalone: true,
  selector: 'xp-knowledge-document-analysis-asset',
  imports: [TranslateModule, XpSpinComponent],
  template: `
    @if (loading()) {
      <xp-spin class="flex min-h-32 items-center justify-center" />
    } @else if (url()) {
      <img
        class="max-h-[420px] max-w-full rounded-lg border border-divider-subtle object-contain"
        [src]="url()"
        [alt]="alt() || ('XP.Knowledgebase.AnalysisPreview.ParsedImage' | translate)"
      />
    } @else {
      <div class="rounded-lg bg-background-default-subtle px-3 py-6 text-center text-sm text-text-tertiary">
        {{ error() || ('XP.Knowledgebase.AnalysisPreview.ImageAssetUnavailable' | translate) }}
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class KnowledgeDocumentAnalysisAssetComponent {
  readonly #service = inject(KnowledgeDocumentService)
  readonly documentId = input.required<string>()
  readonly assetId = input.required<string>()
  readonly alt = input('')
  readonly loading = signal(false)
  readonly error = signal<string | null>(null)
  readonly url = signal<string | null>(null)

  readonly #loadEffect = effect((onCleanup) => {
    const documentId = this.documentId()
    const assetId = this.assetId()
    let objectUrl: string | null = null
    this.url.set(null)
    this.loading.set(true)
    this.error.set(null)
    const subscription = this.#service
      .getAnalysisPreviewAsset(documentId, assetId)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (blob) => {
          objectUrl = URL.createObjectURL(blob)
          this.url.set(objectUrl)
        },
        error: (error) => this.error.set(error instanceof Error ? error.message : null)
      })
    onCleanup(() => {
      subscription.unsubscribe()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    })
  })
}

@Component({
  standalone: true,
  selector: 'xp-knowledge-document-analysis-preview',
  templateUrl: './analysis-preview.component.html',
  styleUrls: ['./analysis-preview.component.scss'],
  imports: [
    FormsModule,
    TranslateModule,
    MarkdownModule,
    NgxJsonViewerModule,
    XpSpinComponent,
    KnowledgeDocumentAnalysisAssetComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class KnowledgeDocumentAnalysisPreviewComponent {
  readonly #service = inject(KnowledgeDocumentService)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly #destroyRef = inject(DestroyRef)
  readonly #translate = inject(TranslateService)

  readonly documentId = input.required<string>()
  readonly fileName = input('')
  readonly preview = input.required<AvailableAnalysisPreview>()

  readonly page = signal(1)
  readonly selectedBlockId = signal<string | null>(null)
  readonly selectedBlockPage = signal<number | null>(null)
  readonly tab = signal<AnalysisTab>('markdown')
  readonly zoom = signal(1)
  readonly enabledTypes = signal<Set<DocumentAnalysisBlockType>>(new Set())
  readonly pdfLoading = signal(false)
  readonly pdfError = signal<string | null>(null)
  readonly viewportWidth = signal(0)
  readonly splitPercent = signal(50)
  readonly mobilePane = signal<MobilePane>('source')
  readonly pageDataByPage = signal<ReadonlyMap<number, KnowledgeDocumentAnalysisPage>>(new Map())
  readonly loadingPages = signal<ReadonlySet<number>>(new Set())
  readonly pageErrors = signal<ReadonlyMap<number, string>>(new Map())
  readonly rawPages = signal<ReadonlyMap<number, Array<Record<string, unknown>>>>(new Map())
  readonly rawLoadingPages = signal<ReadonlySet<number>>(new Set())
  readonly canvasSizes = signal<ReadonlyMap<number, { width: number; height: number }>>(new Map())
  readonly overlayCompatiblePages = signal<ReadonlySet<number>>(new Set())
  readonly renderingPages = signal<ReadonlySet<number>>(new Set())
  readonly pdfPageErrors = signal<ReadonlyMap<number, string>>(new Map())

  readonly pageData = computed(() => this.pageDataByPage().get(this.page()))
  readonly loading = computed(() => this.loadingPages().has(this.page()))
  readonly pageError = computed(() => this.pageErrors().get(this.page()) ?? null)
  readonly blocks = computed(() => this.pageData()?.blocks ?? [])
  readonly pageTypes = computed(() => [
    ...new Set([...this.pageDataByPage().values()].flatMap((page) => page.blocks.map((block) => block.type)))
  ])
  /** Keeps PDF rendering bounded while page metadata is prefetched around the active page. */
  readonly renderPages = computed(() => {
    const pages = this.preview().pages
    const index = pages.indexOf(this.page())
    return new Set(pages.slice(Math.max(0, index - 2), index + 3))
  })
  readonly isPdf = computed(
    () => this.preview().sourceType?.toLowerCase() === 'pdf' || this.preview().sourceMimeType === 'application/pdf'
  )

  private readonly viewerHost = viewChild<ElementRef<HTMLElement>>('viewerHost')
  private readonly resultHost = viewChild<ElementRef<HTMLElement>>('resultHost')
  private readonly analysisShell = viewChild<ElementRef<HTMLElement>>('analysisShell')
  #loadingTask: PDFDocumentLoadingTask | null = null
  #pdf: PDFDocumentProxy | null = null
  #pdfPromise: Promise<PDFDocumentProxy> | null = null
  readonly #renderTasks = new Map<number, RenderTask>()
  readonly #renderSerial = new Map<number, number>()
  readonly #pageSubscriptions = new Map<number, Subscription>()
  readonly #rawSubscriptions = new Map<number, Subscription>()
  readonly #scrollFrames: Partial<Record<ScrollPane, number>> = {}
  /** Programmatic writes are recorded so the mirrored scroll event cannot take over as leader. */
  readonly #suppressedScrollTops: Partial<Record<ScrollPane, number>> = {}
  #scrollLeader: ScrollPane = 'source'
  #initialized = false
  #initialPositioned = false
  #resizeCleanup: (() => void) | null = null

  readonly #initializeEffect = effect(() => {
    const preview = this.preview()
    if (this.#initialized || !preview.pages.length) return
    const requestedPage = Number(this.#route.snapshot.queryParamMap.get('page'))
    const initialPage = preview.pages.includes(requestedPage) ? requestedPage : preview.pages[0]
    this.page.set(initialPage)
    const blockId = this.#route.snapshot.queryParamMap.get('block')
    this.selectedBlockId.set(blockId)
    this.selectedBlockPage.set(blockId ? initialPage : null)
    this.loadAround(initialPage)
    this.#initialized = true
  })

  readonly #initialPositionEffect = effect(() => {
    const source = this.viewerHost()?.nativeElement
    const result = this.resultHost()?.nativeElement
    const current = this.page()
    if (!this.#initialized || this.#initialPositioned || !source || !result) return
    this.#initialPositioned = true
    requestAnimationFrame(() => this.scrollBothToPage(current))
  })

  readonly #observeSizeEffect = effect((onCleanup) => {
    const host = this.viewerHost()?.nativeElement
    if (!host || typeof ResizeObserver === 'undefined') return
    const update = () => this.viewportWidth.set(host.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(host)
    onCleanup(() => observer.disconnect())
  })

  readonly #renderEffect = effect(() => {
    const host = this.viewerHost()?.nativeElement
    const pageData = this.pageDataByPage()
    const pages = this.renderPages()
    const width = this.viewportWidth()
    const zoom = this.zoom()
    if (!host || !this.isPdf() || width <= 0) return

    for (const [page, task] of this.#renderTasks) {
      if (!pages.has(page)) {
        task.cancel()
        this.#renderTasks.delete(page)
      }
    }

    const frame = requestAnimationFrame(() => {
      for (const page of pages) {
        const analysisPage = pageData.get(page)
        const canvas = host.querySelector<HTMLCanvasElement>(`canvas[data-pdf-page="${page}"]`)
        if (analysisPage && canvas) void this.renderPdfPage(canvas, analysisPage, width, zoom)
      }
    })
    return () => cancelAnimationFrame(frame)
  })

  readonly #selectionEffect = effect(() => {
    const blockId = this.selectedBlockId()
    const blockPage = this.selectedBlockPage()
    this.pageDataByPage()
    if (!blockId || !blockPage) return
    requestAnimationFrame(() => {
      document
        .getElementById(`analysis-result-${blockPage}-${blockId}`)
        ?.scrollIntoView({ behavior: this.prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' })
    })
  })

  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.#resizeCleanup?.()
      this.#pageSubscriptions.forEach((subscription) => subscription.unsubscribe())
      this.#rawSubscriptions.forEach((subscription) => subscription.unsubscribe())
      Object.values(this.#scrollFrames).forEach((frame) => cancelAnimationFrame(frame))
      this.destroyPdf()
    })
  }

  typeLabel(type: DocumentAnalysisBlockType) {
    return TYPE_LABELS[type]
  }

  typeLabelText(type: DocumentAnalysisBlockType) {
    return this.#translate.instant(TYPE_LABELS[type].labelKey)
  }

  blockAriaLabel(block: KnowledgeDocumentAnalysisBlock) {
    return `${this.typeLabelText(block.type)}: ${block.markdown.slice(0, 40)}`
  }

  isTypeEnabled(type: DocumentAnalysisBlockType) {
    const enabled = this.enabledTypes()
    return !enabled.size || enabled.has(type)
  }

  toggleType(type: DocumentAnalysisBlockType) {
    this.enabledTypes.update((current) => {
      const next = new Set(current.size ? current : this.pageTypes())
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next.size === this.pageTypes().length ? new Set() : next
    })
  }

  pageDataFor(page: number) {
    return this.pageDataByPage().get(page)
  }

  isPageLoading(page: number) {
    return this.loadingPages().has(page)
  }

  pageErrorFor(page: number) {
    return this.pageErrors().get(page) ?? null
  }

  pdfPageErrorFor(page: number) {
    return this.pdfPageErrors().get(page) ?? null
  }

  isPageRendering(page: number) {
    return this.renderingPages().has(page)
  }

  isPageInRenderWindow(page: number) {
    return this.renderPages().has(page)
  }

  blocksForPage(page: number) {
    return this.pageDataFor(page)?.blocks ?? []
  }

  visibleBlocksForPage(page: number) {
    const blocks = this.blocksForPage(page)
    const enabled = this.enabledTypes()
    return enabled.size ? blocks.filter((block) => enabled.has(block.type)) : blocks
  }

  filteredBlocksForPage(page: number) {
    const blocks = this.blocksForPage(page)
    if (this.tab() === 'tables') return blocks.filter((block) => block.type === 'table')
    if (this.tab() === 'images') return blocks.filter((block) => block.type === 'image')
    return blocks
  }

  rawPageFor(page: number) {
    return this.rawPages().get(page)
  }

  isRawPageLoading(page: number) {
    return this.rawLoadingPages().has(page)
  }

  isOverlayCompatible(page: number) {
    return !this.canvasSizes().has(page) || this.overlayCompatiblePages().has(page)
  }

  canvasSizeFor(page: number) {
    const rendered = this.canvasSizes().get(page)
    if (rendered) return rendered
    const analysisPage = this.pageDataFor(page)
    const width = Math.round(Math.max(320, this.viewportWidth() - 32) * this.zoom())
    const ratio = analysisPage?.width && analysisPage?.height ? analysisPage.width / analysisPage.height : 1 / 1.414
    return { width, height: Math.round(width / ratio) }
  }

  setTab(tab: AnalysisTab) {
    const leaderPane = this.#scrollLeader
    const location = this.currentLeaderLocation()
    this.tab.set(tab)
    if (tab === 'json') this.loadRawPage(this.page())
    requestAnimationFrame(() => (location ? this.restoreSynchronizedLocation(leaderPane, location) : undefined))
  }

  setMobilePane(pane: MobilePane) {
    this.mobilePane.set(pane)
    requestAnimationFrame(() => this.scrollPaneToPage(pane, this.page(), 0))
  }

  onPaneScroll(pane: ScrollPane, event: Event) {
    const host = event.currentTarget as HTMLElement
    const suppressedTop = this.#suppressedScrollTops[pane]
    if (suppressedTop != null) {
      delete this.#suppressedScrollTops[pane]
      if (Math.abs(host.scrollTop - suppressedTop) <= 2) return
    }

    // Coalesce high-frequency scroll events and synchronize once per animation frame.
    const pendingFrame = this.#scrollFrames[pane]
    if (pendingFrame) cancelAnimationFrame(pendingFrame)
    this.#scrollFrames[pane] = requestAnimationFrame(() => {
      delete this.#scrollFrames[pane]
      const location = this.scrollLocation(host)
      if (!location) return
      this.#scrollLeader = pane
      this.activatePage(location.page)
      this.syncPaneScroll(pane, location)
    })
  }

  startResize(event: PointerEvent) {
    if (event.button !== 0) return
    const shell = this.analysisShell()?.nativeElement
    if (!shell) return
    event.preventDefault()
    this.#resizeCleanup?.()
    const move = (moveEvent: PointerEvent) => {
      const bounds = shell.getBoundingClientRect()
      if (!bounds.width) return
      const percent = ((moveEvent.clientX - bounds.left) / bounds.width) * 100
      this.splitPercent.set(Math.min(72, Math.max(28, percent)))
    }
    const stop = () => {
      this.#resizeCleanup?.()
      requestAnimationFrame(() => this.resyncFromLeader())
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
    this.#resizeCleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      this.#resizeCleanup = null
    }
  }

  resizeByKeyboard(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    this.splitPercent.update((value) => Math.min(72, Math.max(28, value + (event.key === 'ArrowLeft' ? -2 : 2))))
  }

  selectBlock(block: KnowledgeDocumentAnalysisBlock, page = this.page()) {
    this.activatePage(page, false)
    this.selectedBlockId.set(block.id)
    this.selectedBlockPage.set(page)
    void this.#router.navigate([], {
      relativeTo: this.#route,
      queryParams: { page, block: block.id },
      queryParamsHandling: 'merge',
      replaceUrl: true
    })
  }

  previousPage() {
    this.movePage(-1)
  }

  nextPage() {
    this.movePage(1)
  }

  goToPage(value: unknown) {
    const requested = Number(value)
    if (!Number.isInteger(requested)) return
    const pages = this.preview().pages
    const target = pages.includes(requested)
      ? requested
      : pages.reduce((nearest, page) => (Math.abs(page - requested) < Math.abs(nearest - requested) ? page : nearest))
    this.setPage(target)
  }

  zoomIn() {
    this.updateZoom((value) => Math.min(3, Number((value + 0.2).toFixed(2))))
  }

  zoomOut() {
    this.updateZoom((value) => Math.max(0.5, Number((value - 0.2).toFixed(2))))
  }

  fitWidth() {
    this.updateZoom(() => 1)
  }

  polygonPoints(block: KnowledgeDocumentAnalysisBlock) {
    return block.polygon?.map((point) => `${point.x},${point.y}`).join(' ') ?? ''
  }

  private movePage(delta: number) {
    const pages = this.preview().pages
    const index = pages.indexOf(this.page())
    const target = pages[index + delta]
    if (target) this.setPage(target)
  }

  private setPage(page: number) {
    this.activatePage(page)
    requestAnimationFrame(() => this.scrollBothToPage(page))
  }

  private activatePage(page: number, clearSelection = true) {
    if (!this.preview().pages.includes(page)) return
    const changed = page !== this.page()
    if (changed) this.page.set(page)
    if (changed && clearSelection) {
      this.selectedBlockId.set(null)
      this.selectedBlockPage.set(null)
    }
    this.loadAround(page)
    if (this.tab() === 'json') this.loadRawPage(page)
    if (!changed) return
    void this.#router.navigate([], {
      relativeTo: this.#route,
      queryParams: { page, block: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    })
  }

  private loadAround(page: number) {
    const pages = this.preview().pages
    const index = pages.indexOf(page)
    pages.slice(Math.max(0, index - 2), index + 3).forEach((candidate) => this.loadPage(candidate))
  }

  private loadPage(page: number) {
    if (this.pageDataByPage().has(page) || this.#pageSubscriptions.has(page)) return
    this.loadingPages.update((current) => new Set(current).add(page))
    this.pageErrors.update((current) => {
      const next = new Map(current)
      next.delete(page)
      return next
    })
    const subscription = this.#service
      .getAnalysisPreviewPage(this.documentId(), page)
      .pipe(
        finalize(() => {
          this.#pageSubscriptions.delete(page)
          this.loadingPages.update((current) => {
            const next = new Set(current)
            next.delete(page)
            return next
          })
        })
      )
      .subscribe({
        next: (value) => {
          const leaderPane = this.#scrollLeader
          const location = this.currentLeaderLocation()
          this.pageDataByPage.update((current) => new Map(current).set(page, value))
          requestAnimationFrame(() =>
            location ? this.restoreSynchronizedLocation(leaderPane, location) : this.resyncFromLeader()
          )
        },
        error: () => {
          this.pageErrors.update((current) =>
            new Map(current).set(
              page,
              this.#translate.instant(`${ANALYSIS_PREVIEW_I18N}.PageResultUnavailable`, { page })
            )
          )
        }
      })
    this.#pageSubscriptions.set(page, subscription)
  }

  private loadRawPage(page: number) {
    // Raw provider JSON is intentionally fetched only after the JSON tab is opened for this page.
    if (this.rawPages().has(page) || this.#rawSubscriptions.has(page)) return
    this.rawLoadingPages.update((current) => new Set(current).add(page))
    const subscription = this.#service
      .getAnalysisPreviewRawPage(this.documentId(), page)
      .pipe(
        finalize(() => {
          this.#rawSubscriptions.delete(page)
          this.rawLoadingPages.update((current) => {
            const next = new Set(current)
            next.delete(page)
            return next
          })
        })
      )
      .subscribe({
        next: (value) => {
          const leaderPane = this.#scrollLeader
          const location = this.currentLeaderLocation()
          this.rawPages.update((current) => new Map(current).set(page, value))
          requestAnimationFrame(() =>
            location ? this.restoreSynchronizedLocation(leaderPane, location) : this.resyncFromLeader()
          )
        },
        error: () => this.rawPages.update((current) => new Map(current).set(page, []))
      })
    this.#rawSubscriptions.set(page, subscription)
  }

  private scrollLocation(host: HTMLElement): AnalysisScrollLocation | null {
    // A shallow viewport anchor changes the toolbar page number shortly after a page enters view.
    const anchorOffset = Math.min(host.clientHeight * 0.22, 180)
    return resolveAnalysisScrollLocation(this.pageMetrics(host), host.scrollTop + anchorOffset, host.scrollTop)
  }

  private pageMetrics(host: HTMLElement): AnalysisPageMetric[] {
    const hostTop = host.getBoundingClientRect().top
    return Array.from(host.querySelectorAll<HTMLElement>('[data-analysis-page]')).map((element) => ({
      page: Number(element.dataset['analysisPage']),
      top: element.getBoundingClientRect().top - hostTop + host.scrollTop,
      height: element.offsetHeight
    }))
  }

  private syncPaneScroll(sourcePane: ScrollPane, location: AnalysisScrollLocation) {
    const targetPane: ScrollPane = sourcePane === 'source' ? 'result' : 'source'
    const targetHost = this.paneHost(targetPane)
    if (!targetHost || !targetHost.clientHeight) return
    const targetMetric = this.pageMetrics(targetHost).find((metric) => metric.page === location.page)
    if (!targetMetric) return
    const top = analysisScrollTopForLocation(location, targetMetric)
    this.setPaneScrollTop(targetPane, targetHost, top)
  }

  private resyncFromLeader() {
    const leader = this.paneHost(this.#scrollLeader)
    if (!leader) return
    const location = this.scrollLocation(leader)
    if (location) this.syncPaneScroll(this.#scrollLeader, location)
  }

  private currentLeaderLocation() {
    const leader = this.paneHost(this.#scrollLeader)
    return leader ? this.scrollLocation(leader) : null
  }

  private restoreSynchronizedLocation(pane: ScrollPane, location: AnalysisScrollLocation) {
    this.scrollPaneToPage(pane, location.page, location.progress)
    this.syncPaneScroll(pane, location)
  }

  private updateZoom(update: (value: number) => number) {
    const leaderPane = this.#scrollLeader
    const location = this.currentLeaderLocation()
    this.zoom.update(update)
    requestAnimationFrame(() => (location ? this.restoreSynchronizedLocation(leaderPane, location) : undefined))
  }

  private scrollBothToPage(page: number) {
    this.scrollPaneToPage('source', page, 0)
    this.scrollPaneToPage('result', page, 0)
  }

  private scrollPaneToPage(pane: ScrollPane, page: number, progress: number) {
    const host = this.paneHost(pane)
    if (!host || !host.clientHeight) return
    const metric = this.pageMetrics(host).find((item) => item.page === page)
    if (!metric) return
    const top = analysisScrollTopForLocation({ page, progress }, metric)
    this.setPaneScrollTop(pane, host, top)
  }

  private setPaneScrollTop(pane: ScrollPane, host: HTMLElement, requestedTop: number) {
    const top = Math.max(0, Math.min(requestedTop, host.scrollHeight - host.clientHeight))
    if (Math.abs(host.scrollTop - top) <= 1) return
    // Mark the exact mirrored position before assignment to prevent a source/target feedback loop.
    this.#suppressedScrollTops[pane] = top
    host.scrollTop = top
  }

  private paneHost(pane: ScrollPane) {
    return pane === 'source' ? this.viewerHost()?.nativeElement : this.resultHost()?.nativeElement
  }

  private prefersReducedMotion() {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  private async renderPdfPage(
    canvas: HTMLCanvasElement,
    analysisPage: KnowledgeDocumentAnalysisPage,
    hostWidth: number,
    zoom: number
  ) {
    const page = analysisPage.page
    const serial = (this.#renderSerial.get(page) ?? 0) + 1
    this.#renderSerial.set(page, serial)
    this.renderingPages.update((current) => new Set(current).add(page))
    this.pdfPageErrors.update((current) => {
      const next = new Map(current)
      next.delete(page)
      return next
    })
    try {
      const pdf = await this.ensurePdf()
      if (page > pdf.numPages) {
        throw new Error(
          this.#translate.instant(`${ANALYSIS_PREVIEW_I18N}.PdfPageOutOfRange`, {
            actual: pdf.numPages,
            target: page
          })
        )
      }
      const pdfPage = await pdf.getPage(page)
      if (serial !== this.#renderSerial.get(page)) {
        pdfPage.cleanup()
        return
      }
      this.#renderTasks.get(page)?.cancel()
      const baseViewport = pdfPage.getViewport({ scale: 1 })
      const availableWidth = Math.max(320, hostWidth - 32)
      const scale = Math.max(0.25, Math.min(4, (availableWidth / baseViewport.width) * zoom))
      const viewport = pdfPage.getViewport({ scale })
      const outputScale = Math.min(globalThis.devicePixelRatio || 1, 2)
      const context = canvas.getContext('2d')
      if (!context) throw new Error(this.#translate.instant(`${ANALYSIS_PREVIEW_I18N}.PdfCanvasUnavailable`))
      canvas.width = Math.max(1, Math.floor(viewport.width * outputScale))
      canvas.height = Math.max(1, Math.floor(viewport.height * outputScale))
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      this.canvasSizes.update((current) =>
        new Map(current).set(page, { width: Math.floor(viewport.width), height: Math.floor(viewport.height) })
      )
      const pdfRatio = viewport.width / viewport.height
      const analysisRatio = analysisPage.width / analysisPage.height
      const rotation = ((baseViewport.rotation % 360) + 360) % 360
      // Do not draw plausible-looking but incorrect boxes when page geometry cannot be aligned safely.
      const overlayCompatible = rotation === 0 && Math.abs(pdfRatio - analysisRatio) / analysisRatio <= 0.03
      this.overlayCompatiblePages.update((current) => {
        const next = new Set(current)
        if (overlayCompatible) next.add(page)
        else next.delete(page)
        return next
      })
      const renderTask = pdfPage.render({
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0]
      })
      this.#renderTasks.set(page, renderTask)
      try {
        await renderTask.promise
      } finally {
        if (this.#renderTasks.get(page) === renderTask) this.#renderTasks.delete(page)
        pdfPage.cleanup()
      }
    } catch (error) {
      if (
        serial === this.#renderSerial.get(page) &&
        !(error instanceof Error && error.name === 'RenderingCancelledException')
      ) {
        this.pdfPageErrors.update((current) =>
          new Map(current).set(
            page,
            error instanceof Error
              ? error.message
              : this.#translate.instant(`${ANALYSIS_PREVIEW_I18N}.PdfPageLoadFailed`)
          )
        )
      }
    } finally {
      if (serial === this.#renderSerial.get(page)) {
        this.renderingPages.update((current) => {
          const next = new Set(current)
          next.delete(page)
          return next
        })
      }
    }
  }

  private async ensurePdf() {
    if (this.#pdf) return this.#pdf
    if (this.#pdfPromise) return this.#pdfPromise
    this.pdfLoading.set(true)
    this.pdfError.set(null)
    const source = this.#service.originalFilePreviewSource(this.documentId())
    this.#loadingTask = getDocument(source)
    this.#pdfPromise = this.#loadingTask.promise
      .then((pdf) => {
        this.#pdf = pdf
        return pdf
      })
      .catch((error) => {
        this.pdfError.set(
          error instanceof Error ? error.message : this.#translate.instant(`${ANALYSIS_PREVIEW_I18N}.PdfFileLoadFailed`)
        )
        throw error
      })
      .finally(() => this.pdfLoading.set(false))
    return this.#pdfPromise
  }

  private destroyPdf() {
    this.#renderTasks.forEach((task) => task.cancel())
    this.#renderTasks.clear()
    void this.#pdf?.destroy()
    this.#pdf = null
    void this.#loadingTask?.destroy()
    this.#loadingTask = null
    this.#pdfPromise = null
  }
}
