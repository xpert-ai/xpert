import {
  DocumentAnalysisBlockType,
  KnowledgeDocumentAnalysisBlock,
  KnowledgeDocumentAnalysisPage
} from '@xpert-ai/contracts'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const OVERLAY_SELECTOR = 'svg[data-analysis-docx-overlay]'

const BLOCK_COLORS: Record<DocumentAnalysisBlockType, string> = {
  text: 'var(--sys-info)',
  title: 'var(--sys-primary)',
  table: 'var(--sys-success)',
  image: 'var(--sys-warning)',
  formula: 'var(--sys-danger)',
  header: 'var(--sys-info)',
  footer: 'var(--sys-info)',
  footnote: 'var(--sys-warning)',
  'page-number': 'var(--sys-info)',
  seal: 'var(--sys-danger)',
  other: 'var(--color-text-tertiary)'
}

export type DocxAnalysisOverlayOptions = {
  host: HTMLElement
  pages: ReadonlyMap<number, KnowledgeDocumentAnalysisPage>
  enabledTypes: ReadonlySet<DocumentAnalysisBlockType>
  selectedBlockId: string | null
  selectedBlockPage: number | null
  blockAriaLabel: (block: KnowledgeDocumentAnalysisBlock) => string
  onSelect: (block: KnowledgeDocumentAnalysisBlock, page: number) => void
}

/** Projects transformer page coordinates onto docx-preview pages without attempting text matching. */
export function renderDocxAnalysisOverlays(options: DocxAnalysisOverlayOptions) {
  const cleanups: Array<() => void> = []
  options.host.querySelectorAll<SVGSVGElement>(OVERLAY_SELECTOR).forEach((overlay) => overlay.remove())

  options.host
    .querySelectorAll<HTMLElement>('xp-file-docx-preview section.docx[data-analysis-page]')
    .forEach((section) => {
      const pageNumber = Number(section.dataset['analysisPage'])
      const page = options.pages.get(pageNumber)
      if (!page || !validPageSize(page)) return

      const visibleBlocks = page.blocks.filter(
        (block) => (!options.enabledTypes.size || options.enabledTypes.has(block.type)) && hasGeometry(block)
      )
      if (!visibleBlocks.length) return

      const previousPosition = section.style.position
      section.style.position = 'relative'
      const overlay = createOverlay(page)

      visibleBlocks.forEach((block) => {
        const shape = createShape(block, page)
        if (!shape) return
        const selected = options.selectedBlockPage === pageNumber && options.selectedBlockId === block.id
        const color = BLOCK_COLORS[block.type]
        shape.dataset['analysisDocxBlockId'] = block.id
        shape.dataset['analysisDocxBlockType'] = block.type
        shape.setAttribute('tabindex', '0')
        shape.setAttribute('role', 'button')
        shape.setAttribute('aria-label', options.blockAriaLabel(block))
        shape.setAttribute('vector-effect', 'non-scaling-stroke')
        shape.style.cursor = 'pointer'
        shape.style.pointerEvents = 'all'
        setShapeAppearance(shape, color, selected, false)

        const activate = (event: Event) => {
          event.preventDefault()
          event.stopPropagation()
          options.onSelect(block, pageNumber)
        }
        const enter = () => setShapeAppearance(shape, color, selected, true)
        const leave = () => setShapeAppearance(shape, color, selected, false)
        const keydown = (event: Event) => {
          if (event instanceof KeyboardEvent && (event.key === 'Enter' || event.key === ' ')) activate(event)
        }
        shape.addEventListener('click', activate)
        shape.addEventListener('pointerenter', enter)
        shape.addEventListener('pointerleave', leave)
        shape.addEventListener('focus', enter)
        shape.addEventListener('blur', leave)
        shape.addEventListener('keydown', keydown)

        const title = document.createElementNS(SVG_NAMESPACE, 'title')
        title.textContent = options.blockAriaLabel(block)
        shape.appendChild(title)
        overlay.appendChild(shape)
      })

      if (!overlay.childElementCount) {
        section.style.position = previousPosition
        return
      }

      section.appendChild(overlay)
      cleanups.push(() => {
        overlay.remove()
        section.style.position = previousPosition
      })
    })

  return () => cleanups.forEach((cleanup) => cleanup())
}

function createOverlay(page: KnowledgeDocumentAnalysisPage) {
  const overlay = document.createElementNS(SVG_NAMESPACE, 'svg')
  overlay.dataset['analysisDocxOverlay'] = `${page.page}`
  overlay.setAttribute('viewBox', `0 0 ${page.width} ${page.height}`)
  overlay.setAttribute('preserveAspectRatio', 'none')
  overlay.style.position = 'absolute'
  overlay.style.inset = '0'
  overlay.style.zIndex = '4'
  overlay.style.width = '100%'
  overlay.style.height = '100%'
  overlay.style.overflow = 'hidden'
  overlay.style.pointerEvents = 'none'
  return overlay
}

function createShape(block: KnowledgeDocumentAnalysisBlock, page: KnowledgeDocumentAnalysisPage) {
  if (block.polygon?.length) {
    const points = block.polygon
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      .map((point) => `${clamp(point.x, 0, page.width)},${clamp(point.y, 0, page.height)}`)
    if (points.length < 3) return null
    const polygon = document.createElementNS(SVG_NAMESPACE, 'polygon')
    polygon.setAttribute('points', points.join(' '))
    return polygon
  }

  if (!block.bounds || block.bounds.width <= 0 || block.bounds.height <= 0) return null
  const left = clamp(block.bounds.x, 0, page.width)
  const top = clamp(block.bounds.y, 0, page.height)
  const right = clamp(block.bounds.x + block.bounds.width, 0, page.width)
  const bottom = clamp(block.bounds.y + block.bounds.height, 0, page.height)
  if (right <= left || bottom <= top) return null

  const rectangle = document.createElementNS(SVG_NAMESPACE, 'rect')
  rectangle.setAttribute('x', `${left}`)
  rectangle.setAttribute('y', `${top}`)
  rectangle.setAttribute('width', `${right - left}`)
  rectangle.setAttribute('height', `${bottom - top}`)
  return rectangle
}

function setShapeAppearance(shape: SVGElement, color: string, selected: boolean, hovered: boolean) {
  const emphasized = selected || hovered
  shape.style.fill = `color-mix(in srgb, ${color} ${selected ? 18 : hovered ? 13 : 6}%, transparent)`
  shape.style.stroke = color
  shape.style.strokeWidth = selected ? '3' : hovered ? '2.5' : '1.25'
  shape.style.strokeDasharray = emphasized ? 'none' : '5 3'
}

function validPageSize(page: KnowledgeDocumentAnalysisPage) {
  return Number.isFinite(page.width) && page.width > 0 && Number.isFinite(page.height) && page.height > 0
}

function hasGeometry(block: KnowledgeDocumentAnalysisBlock) {
  return Boolean(block.polygon?.length || block.bounds)
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}
