import { NgClass } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild
} from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardComboboxComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import type { KnowledgeWikiGraph, KnowledgeWikiPageDetail, KnowledgeWikiPageType } from '@xpert-ai/contracts'
import { firstValueFrom, Subject, takeUntil } from 'rxjs'
import cytoscape from 'cytoscape'
import { KnowledgeWikiService, getErrorMessage } from '../../../../../@core'

const PAGE_TYPE_STYLE: Record<KnowledgeWikiPageType, { token: string; dotClass: string }> = {
  summary: { token: '--primary', dotClass: 'bg-primary' },
  entity: { token: '--color-text-success', dotClass: 'bg-text-success' },
  concept: { token: '--color-text-warning', dotClass: 'bg-text-warning' },
  index: { token: '--color-text-tertiary', dotClass: 'bg-text-tertiary' }
}

@Component({
  standalone: true,
  selector: 'xp-wiki-graph',
  imports: [NgClass, TranslateModule, ZardButtonComponent, ZardComboboxComponent, ZardIconComponent],
  host: { class: 'relative block min-h-96 min-w-0 flex-1 overflow-hidden bg-background' },
  templateUrl: './wiki-graph.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WikiGraphComponent {
  readonly id = input.required<string>()
  readonly active = input(true)
  readonly focusPageId = input<string | null>(null)
  readonly openPage = output<string>()
  readonly service = inject(KnowledgeWikiService)
  readonly zone = inject(NgZone)
  readonly canvas = viewChild<ElementRef<HTMLDivElement>>('canvas')
  readonly graph = signal<KnowledgeWikiGraph | null>(null)
  readonly detail = signal<KnowledgeWikiPageDetail | null>(null)
  readonly loading = signal(false)
  readonly detailLoading = signal(false)
  readonly error = signal('')
  readonly detailError = signal('')
  readonly neighborhoodPageId = linkedSignal<string | null>(() => {
    this.id()
    return null
  })
  readonly neighborhood = computed(() => this.neighborhoodPageId() !== null)
  readonly depth = signal(1)
  readonly includeIndex = signal(false)
  readonly showArrows = signal(true)
  readonly pageType = signal<KnowledgeWikiPageType | undefined>(undefined)
  readonly types = ['summary', 'entity', 'concept', 'index'] as const
  readonly typeStyles = PAGE_TYPE_STYLE
  readonly selectedId = signal<string | null>(null)
  readonly selected = computed(() => this.graph()?.nodes.find((node) => node.id === this.selectedId()))
  readonly pageOptions = computed(
    () => this.graph()?.nodes.map((node) => ({ value: node.id, label: node.title })) ?? []
  )
  #request = 0
  #detailRequest = 0
  #loadedQuery: string | null = null
  readonly #cancelGraph = new Subject<void>()
  readonly #cancelDetail = new Subject<void>()
  #cy?: cytoscape.Core
  #resize?: ResizeObserver
  #theme?: MutationObserver

  constructor() {
    effect(() => {
      const id = this.id(),
        focus = this.neighborhoodPageId(),
        depth = this.depth(),
        includeIndex = this.includeIndex(),
        pageType = this.pageType(),
        active = this.active()
      untracked(() => {
        if (!active) {
          this.cancelRequests()
        } else if (this.#loadedQuery !== JSON.stringify([id, focus, depth, includeIndex, pageType])) {
          void this.refresh(id, focus, depth, includeIndex, pageType)
        }
      })
    })
    effect(() => {
      const graph = this.graph(),
        canvas = this.canvas()?.nativeElement,
        active = this.active()
      untracked(() => {
        this.destroy()
        if (graph?.nodes.length && canvas && active) this.zone.runOutsideAngular(() => this.mount(canvas, graph))
      })
    })
    effect(() => {
      const shape = this.showArrows() ? 'triangle' : 'none'
      this.#cy?.edges().style('target-arrow-shape', shape)
    })
    inject(DestroyRef).onDestroy(() => {
      this.cancelRequests()
      this.#cancelGraph.complete()
      this.#cancelDetail.complete()
      this.destroy()
    })
  }

  private cancelRequests() {
    this.#request++
    this.#detailRequest++
    this.#cancelGraph.next()
    this.#cancelDetail.next()
    this.loading.set(false)
    if (this.detailLoading()) this.clearSelection()
  }

  async refresh(
    id = this.id(),
    focus = this.neighborhoodPageId(),
    depth = this.depth(),
    includeIndex = this.includeIndex(),
    pageType = this.pageType()
  ) {
    if (!this.active()) return
    this.#cancelGraph.next()
    const request = ++this.#request
    this.#loadedQuery = null
    this.loading.set(true)
    this.error.set('')
    this.graph.set(null)
    this.destroy()
    this.clearSelection()
    try {
      const graph = await firstValueFrom(
        this.service
          .getGraph(id, { focusPageId: focus ?? undefined, depth, take: 150, includeIndex, pageType })
          .pipe(takeUntil(this.#cancelGraph)),
        { defaultValue: null }
      )
      if (graph && request === this.#request) {
        this.#loadedQuery = JSON.stringify([id, focus, depth, includeIndex, pageType])
        this.graph.set(graph)
      }
    } catch (error) {
      if (request === this.#request) this.error.set(getErrorMessage(error))
    } finally {
      if (request === this.#request) this.loading.set(false)
    }
  }

  filterType(type: KnowledgeWikiPageType) {
    this.pageType.set(this.pageType() === type ? undefined : type)
    if (type === 'index') this.includeIndex.set(true)
  }

  toggleIndexes() {
    this.includeIndex.update((value) => !value)
    if (!this.includeIndex() && this.pageType() === 'index') this.pageType.set(undefined)
  }

  showNeighborhood() {
    const focus = this.selectedId() ?? this.focusPageId()
    if (focus) this.neighborhoodPageId.set(focus)
  }

  clearSelection() {
    this.#detailRequest++
    this.#cancelDetail.next()
    this.selectedId.set(null)
    this.detail.set(null)
    this.detailError.set('')
    this.detailLoading.set(false)
    this.#cy?.elements().unselect()
  }

  async select(id: unknown) {
    if (!this.active()) return
    if (id === null) return this.clearSelection()
    if (typeof id !== 'string' || !this.graph()?.nodes.some((node) => node.id === id)) return
    this.#cancelDetail.next()
    this.selectedId.set(id)
    this.detail.set(null)
    this.detailError.set('')
    this.detailLoading.set(true)
    this.#cy?.elements().unselect()
    const node = this.#cy?.getElementById(id)
    node?.select()
    if (node) this.#cy?.animate({ center: { eles: node }, duration: 200 })
    const request = ++this.#detailRequest
    try {
      const detail = await firstValueFrom(this.service.getPage(this.id(), id).pipe(takeUntil(this.#cancelDetail)), {
        defaultValue: null
      })
      if (request === this.#detailRequest) this.detail.set(detail)
    } catch (error) {
      if (request === this.#detailRequest) this.detailError.set(getErrorMessage(error))
    } finally {
      if (request === this.#detailRequest) this.detailLoading.set(false)
    }
  }

  fit() {
    this.#cy?.fit(undefined, 64)
  }

  zoom(factor: number) {
    if (!this.#cy) return
    this.#cy.zoom({
      level: this.#cy.zoom() * factor,
      renderedPosition: { x: this.#cy.width() / 2, y: this.#cy.height() / 2 }
    })
  }

  layout() {
    this.#cy?.layout({ name: 'cose', animate: false, padding: 64, nodeDimensionsIncludeLabels: true }).run()
  }

  private mount(container: HTMLElement, graph: KnowledgeWikiGraph) {
    // A cached graph tab can be hidden during rendering. Wait for its real canvas size before laying out nodes.
    const resize = () => {
      const { width, height } = container.getBoundingClientRect()
      if (width <= 0 || height <= 0) return
      if (!this.#cy) this.render(container, graph)
      else this.#cy.resize()
    }
    this.#resize = new ResizeObserver(resize)
    this.#resize.observe(container)
    resize()
  }

  private render(container: HTMLElement, graph: KnowledgeWikiGraph) {
    const degree = new Map<string, number>()
    for (const edge of graph.edges) {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
    }
    this.#cy = cytoscape({
      container,
      elements: [
        ...graph.nodes.map((node) => ({
          data: {
            id: node.id,
            label: node.title,
            pageType: node.pageType,
            size: 20 + Math.min(degree.get(node.id) ?? 0, 8) * 2
          }
        })),
        ...graph.edges.map((edge) => ({ data: edge }))
      ],
      style: this.styles(),
      layout: { name: 'cose', animate: false, padding: 64, nodeDimensionsIncludeLabels: true },
      minZoom: 0.08,
      maxZoom: 3
    })
    if (this.selectedId()) this.#cy.getElementById(this.selectedId()).select()
    this.#cy.on('tap', 'node', (event) => this.zone.run(() => void this.select(event.target.id())))
    this.#cy.on('tap', (event) => {
      if (event.target === this.#cy) this.zone.run(() => this.clearSelection())
    })
    this.#theme = new MutationObserver(() => this.#cy?.style(this.styles()).update())
    this.#theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
  }

  private styles(): cytoscape.StylesheetJson {
    const text = this.color('--color-text-secondary'),
      border = this.color('--border'),
      background = this.color('--background')
    return [
      {
        selector: 'node',
        style: {
          color: text,
          label: 'data(label)',
          width: 'data(size)',
          height: 'data(size)',
          'border-color': background,
          'border-width': 2,
          'font-size': 11,
          'font-family': getComputedStyle(document.body).fontFamily,
          'text-valign': 'bottom',
          'text-margin-y': 6,
          'text-wrap': 'ellipsis',
          'text-max-width': '140px'
        }
      },
      ...this.types.map((type) => ({
        selector: `node[pageType = "${type}"]`,
        style: { 'background-color': this.color(PAGE_TYPE_STYLE[type].token) }
      })),
      {
        selector: 'edge',
        style: {
          width: 1,
          'line-color': border,
          'target-arrow-color': border,
          'target-arrow-shape': this.showArrows() ? 'triangle' : 'none',
          'arrow-scale': 0.7,
          'curve-style': 'bezier'
        }
      },
      {
        selector: 'node:selected',
        style: { 'border-color': this.color('--primary'), 'border-width': 3, 'border-style': 'dashed' }
      }
    ]
  }

  private color(name: string) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return value
    context.fillStyle = value
    context.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
    return `rgba(${r},${g},${b},${a / 255})`
  }

  private destroy() {
    this.#resize?.disconnect()
    this.#theme?.disconnect()
    this.#cy?.destroy()
    this.#cy = undefined
  }
}
