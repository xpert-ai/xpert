import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { XpSpinComponent } from '@xpert-ai/headless-ui'
import { createPptxFile, parsePptx, savePptx, type PptxDeck, type PptxShape } from './pptx-file.utils'
import {
  alignShape,
  applyPptxDeckEdit,
  clampInteger,
  cloneDeck,
  copyShapeForSlide,
  createPptxDragState,
  createEditorShape,
  createInkShape,
  createPresetShape,
  createSlideCopy,
  createTableShape,
  createTextBoxShape,
  effectiveFontSizePt,
  findInkAtPoint,
  firstVisibleSlideIndex,
  moveShapeLayer,
  nextVisibleSlideIndex,
  paragraphsForShapeText,
  pickImageDataUrl,
  PPTX_ANIMATIONS,
  PPTX_ANIMATION_TRIGGERS,
  PPTX_THEME_PRESETS,
  PPTX_TOOLBAR_TABS,
  PPTX_TRANSITIONS,
  rgbColor,
  slidePointFromBounds,
  type PptxDragState,
  type PptxInkTool,
  type PptxDeckEditCommand,
  type PptxPoint,
  type PptxToolbarTab
} from './pptx-editor-model.utils'
import {
  pptxAnimationClasses,
  pptxAnimationTime,
  pptxImageStyle,
  pptxRunFontSize,
  pptxRunTextDecoration,
  pptxSelectionFrameStyle,
  pptxShapeStyle,
  pptxTextPadding,
  pptxThumbnailShapeStyle,
  pptxTransitionClasses
} from './pptx-editor-view.utils'
import { PptxEditHistory } from './pptx-editor-history.utils'
import { PptxPolygonComponent } from './pptx-polygon.component'
import { PptxTableCellEditStart, PptxTableComponent } from './pptx-table.component'
type PptxInkState = { points: PptxPoint[]; tool: 'pen' | 'highlighter'; width: number }
@Component({
  standalone: true,
  selector: 'xp-pptx-editor',
  templateUrl: './pptx-editor.component.html',
  styleUrls: ['./pptx-editor.component.css'],
  imports: [CommonModule, FormsModule, TranslateModule, XpSpinComponent, PptxTableComponent, PptxPolygonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PptxEditorComponent implements OnDestroy {
  readonly documentBuffer = input<ArrayBuffer | null>(null)
  readonly fileName = input('presentation.pptx')
  readonly editable = input(true)
  readonly dirtyChange = output<boolean>()
  readonly editorError = output<Error>()
  readonly saveRequest = output<void>()
  readonly deck = signal<PptxDeck | null>(null)
  readonly selectedSlideIndex = signal(0)
  readonly selectedShapeId = signal<string | null>(null)
  readonly editingShapeId = signal<string | null>(null)
  readonly autoSave = signal(false)
  readonly activeToolbarTab = signal<PptxToolbarTab>('开始')
  readonly toolbarTabs = PPTX_TOOLBAR_TABS
  readonly transitions = PPTX_TRANSITIONS
  readonly animations = PPTX_ANIMATIONS
  readonly animationTriggers = PPTX_ANIMATION_TRIGGERS
  readonly themePresets = PPTX_THEME_PRESETS
  readonly shapeStyle = pptxShapeStyle
  readonly selectionFrameStyle = pptxSelectionFrameStyle
  readonly thumbnailShapeStyle = pptxThumbnailShapeStyle
  readonly textPadding = pptxTextPadding
  readonly runFontSize = pptxRunFontSize
  readonly runTextDecoration = pptxRunTextDecoration
  readonly imageStyle = pptxImageStyle
  readonly animationClasses = pptxAnimationClasses
  readonly animationTime = pptxAnimationTime
  readonly transitionClasses = pptxTransitionClasses
  readonly lineStrokeWidth = (shape: PptxShape, thumbnail = false) =>
    Math.max(thumbnail ? 0.6 : 0.75, shape.strokeWidth || 1)
  readonly defaultFillColor = rgbColor(255, 255, 255)
  readonly defaultStrokeColor = rgbColor(100, 116, 139)
  readonly tableRows = signal(3)
  readonly tableColumns = signal(3)
  readonly shapeClipboard = signal<PptxShape | null>(null)
  readonly drawingTool = signal<PptxInkTool>('select')
  readonly drawingColor = signal(rgbColor(37, 99, 235))
  readonly drawingWidth = signal(2)
  readonly inkPreview = signal<PptxPoint[]>([])
  readonly inkPreviewPoints = computed(() =>
    this.inkPreview()
      .map((point) => `${point.x},${point.y}`)
      .join(' ')
  )
  readonly slideshowSlideIndex = signal<number | null>(null)
  readonly canPasteShape = computed(() => !!this.shapeClipboard() && this.editable())
  readonly loading = signal(false)
  readonly error = signal<string | null>(null)
  readonly dirty = signal(false)
  readonly zoom = signal(1)
  readonly showThumbnails = signal(true)
  readonly showGrid = signal(false)
  readonly showGuides = signal(false)
  readonly viewportSize = signal({ width: 0, height: 0 })
  readonly historyRevision = signal(0)
  readonly canvasSize = computed(() => {
    const deck = this.deck()
    const viewport = this.viewportSize()
    if (!deck || !viewport.width || !viewport.height) return { width: 960, height: 540 }
    const ratio = deck.width / deck.height
    const fitWidth = Math.min(viewport.width - 64, (viewport.height - 64) * ratio, 1280)
    const width = Math.max(320, fitWidth * this.zoom())
    return { width, height: width / ratio }
  })
  readonly zoomLabel = computed(() => `${Math.round(this.zoom() * 100)}%`)
  readonly selectedShape = computed(() => {
    const slide = this.selectedSlide()
    const id = this.selectedShapeId()
    return id ? (slide?.shapes.find((shape) => !shape.deleted && shape.id === id) ?? null) : null
  })
  readonly selectedFontSize = computed(() => {
    const deck = this.deck()
    const shapeId = this.selectedShapeId()
    const shape = shapeId
      ? (deck?.slides[this.selectedSlideIndex()]?.shapes.find((item) => !item.deleted && item.id === shapeId) ?? null)
      : null
    return shape ? effectiveFontSizePt(shape) : 18
  })
  readonly selectedSlideBackground = computed(() => this.selectedSlide()?.background ?? rgbColor(255, 255, 255))
  readonly canUndo = computed(() => this.historyRevision() >= 0 && this.#editHistory.canUndo)
  readonly canRedo = computed(() => this.historyRevision() >= 0 && this.#editHistory.canRedo)
  readonly slideshowSlide = computed(() => {
    const index = this.slideshowSlideIndex()
    return index == null ? null : (this.deck()?.slides[index] ?? null)
  })
  readonly inkCount = computed(
    () => this.selectedSlide()?.shapes.filter((shape) => !shape.deleted && shape.editorKind === 'ink').length ?? 0
  )
  #sourceBuffer: ArrayBuffer | null = null
  #loadRevision = 0
  #resizeObserver: ResizeObserver | null = null
  #editHistory = new PptxEditHistory()
  #autoSaveTimer: ReturnType<typeof setTimeout> | null = null
  #textEditHistoryShapeId: string | null = null
  #dragState: PptxDragState | null = null
  #inkState: PptxInkState | null = null
  readonly stageHost = viewChild<ElementRef<HTMLElement>>('stageHost')
  constructor() {
    effect(() => {
      const element = this.stageHost()?.nativeElement
      if (!element || typeof ResizeObserver === 'undefined') return

      this.#resizeObserver?.disconnect()
      this.#resizeObserver = new ResizeObserver(([entry]) => {
        if (entry) this.viewportSize.set({ width: entry.contentRect.width, height: entry.contentRect.height })
      })
      this.#resizeObserver.observe(element)
    })
    effect(() => {
      const buffer = this.documentBuffer()
      this.fileName()
      if (buffer && buffer !== this.#sourceBuffer) {
        void this.load(buffer)
      } else if (!buffer) {
        this.#sourceBuffer = null
        this.deck.set(null)
        this.setDirty(false)
      }
    })
  }
  ngOnDestroy() {
    this.#resizeObserver?.disconnect()
    this.#resizeObserver = null
    if (this.#autoSaveTimer) clearTimeout(this.#autoSaveTimer)
    this.#autoSaveTimer = null
  }
  readonly selectedSlide = () => this.deck()?.slides[this.selectedSlideIndex()] ?? null

  selectSlide(index: number) {
    const total = this.deck()?.slides.length ?? 0
    this.selectedSlideIndex.set(Math.max(0, Math.min(index, total - 1)))
    this.selectedShapeId.set(null)
    this.editingShapeId.set(null)
  }
  selectShape(shape: PptxShape, event?: Event) {
    event?.stopPropagation()
    if (!this.editable() || !shape.editable) return
    this.selectedShapeId.set(shape.id)
    if (this.editingShapeId() !== shape.id) this.editingShapeId.set(null)
  }
  beginTextEdit(shape: PptxShape, event?: Event) {
    event?.stopPropagation()
    if (!this.editable() || !shape.editable || shape.kind === 'image' || shape.kind === 'line') return
    this.selectedShapeId.set(shape.id)
    this.editingShapeId.set(shape.id)
  }
  beginTableCellEdit(shape: PptxShape, cellPosition: PptxTableCellEditStart) {
    if (!this.editable() || !shape.editable || shape.kind !== 'table') return
    this.selectedShapeId.set(shape.id)
    this.editingShapeId.set(shape.id)
    this.#textEditHistoryShapeId = null
    setTimeout(() => {
      const currentTable = this.stageHost()?.nativeElement.querySelector(`.xp-pptx-editor__shape.is-selected table`)
      const currentRow = currentTable?.querySelectorAll('tr').item(cellPosition.rowIndex)
      const currentCell = currentRow?.querySelectorAll('td').item(cellPosition.cellIndex)
      if (currentCell) {
        ;(currentCell as HTMLElement).tabIndex = 0
        ;(currentCell as HTMLElement).focus()
      }
    }, 0)
  }
  finishTextEdit(shape: PptxShape) {
    if (this.editingShapeId() === shape.id) {
      this.editingShapeId.set(null)
      this.#textEditHistoryShapeId = null
    }
  }
  clearSelection(event?: Event) {
    event?.stopPropagation()
    this.selectedShapeId.set(null)
    this.editingShapeId.set(null)
  }
  selectToolbarTab(tab: PptxToolbarTab) {
    this.activeToolbarTab.set(tab)
    if (tab !== '绘图') this.drawingTool.set('select')
  }
  setDrawingTool(tool: PptxInkTool) {
    this.drawingTool.set(tool)
    if (tool === 'pen' && this.drawingWidth() > 5) this.drawingWidth.set(2)
    if (tool === 'highlighter' && this.drawingWidth() < 6) this.drawingWidth.set(10)
  }
  setDrawingColor(value: string) {
    if (/^#[0-9a-f]{6}$/i.test(value)) this.drawingColor.set(value)
  }

  setDrawingWidth(value: string | number) {
    const width = Number(value)
    if (Number.isFinite(width)) this.drawingWidth.set(Math.min(20, Math.max(1, width)))
  }
  clearInk() {
    const deck = this.deck()
    const slide = this.selectedSlide()
    if (!deck || !slide || !this.editable() || !this.inkCount()) return
    this.pushHistory(deck)
    slide.shapes = slide.shapes.filter((shape) => shape.editorKind !== 'ink' || !shape.created)
    for (const shape of slide.shapes) if (shape.editorKind === 'ink') shape.deleted = true
    this.deck.set({ ...deck })
    this.setDirty(true)
  }
  applyDeckEdit(command: PptxDeckEditCommand, value: string | number | boolean) {
    const deck = this.deck()
    if (!deck || !this.editable()) return
    const previous = cloneDeck(deck)
    if (!applyPptxDeckEdit(deck, this.selectedSlideIndex(), this.selectedShapeId(), command, value)) return
    this.pushHistory(previous)
    this.deck.set({ ...deck })
    this.setDirty(true)
  }

  addTextBox() {
    const deck = this.deck()
    const slide = this.selectedSlide()
    if (!deck || !slide || !this.editable()) return
    this.pushHistory(deck)
    const shape = createTextBoxShape(deck)
    slide.shapes.push(shape)
    this.deck.set({ ...deck })
    this.selectedShapeId.set(shape.id)
    this.editingShapeId.set(shape.id)
    this.setDirty(true)
  }

  addShape(geometry: PptxShape['geometry'] = 'roundRect') {
    const deck = this.deck()
    const slide = this.selectedSlide()
    if (!deck || !slide || !this.editable()) return
    this.pushHistory(deck)
    const shape = createPresetShape(deck, geometry)
    slide.shapes.push(shape)
    this.deck.set({ ...deck })
    this.selectedShapeId.set(shape.id)
    this.setDirty(true)
  }

  setTableRows(value: string | number) {
    this.tableRows.set(clampInteger(value, 1, 20, 3))
  }

  setTableColumns(value: string | number) {
    this.tableColumns.set(clampInteger(value, 1, 20, 3))
  }

  addTable(rowsInput = this.tableRows(), columnsInput = this.tableColumns()) {
    const deck = this.deck()
    const slide = this.selectedSlide()
    if (!deck || !slide || !this.editable()) return
    this.pushHistory(deck)
    const rowCount = clampInteger(rowsInput, 1, 20, 3)
    const columnCount = clampInteger(columnsInput, 1, 20, 3)
    const shape = createTableShape(deck, rowCount, columnCount)
    slide.shapes.push(shape)
    this.deck.set({ ...deck })
    this.selectedShapeId.set(shape.id)
    this.setDirty(true)
  }

  updateTableCell(shape: PptxShape, rowIndex: number, cellIndex: number, value: string) {
    if (!this.editable() || !shape.editable || !shape.table) return
    const cell = shape.table.rows[rowIndex]?.[cellIndex]
    if (!cell || cell.text === value) return
    const deck = this.deck()
    if (!deck) return
    if (this.#textEditHistoryShapeId !== `${shape.id}:${rowIndex}:${cellIndex}`) {
      this.pushHistory(deck)
      this.#textEditHistoryShapeId = `${shape.id}:${rowIndex}:${cellIndex}`
    }
    cell.text = value
    shape.tableDirty = true
    this.setDirty(true)
  }

  finishTableCellEdit(shape: PptxShape) {
    this.#textEditHistoryShapeId = null
    if (this.editingShapeId() === shape.id) this.editingShapeId.set(null)
  }

  async insertImage() {
    if (!this.editable()) return
    const imageSrc = await pickImageDataUrl()
    const deck = this.deck()
    const slide = this.selectedSlide()
    if (!imageSrc || !deck || !slide) return
    this.pushHistory(deck)
    const shape = createEditorShape(`image-${Date.now()}`, {
      x: Math.round(deck.width * 0.2),
      y: Math.round(deck.height * 0.2),
      width: Math.round(deck.width * 0.45),
      height: Math.round(deck.height * 0.3)
    })
    Object.assign(shape, { kind: 'image', imageSrc, paragraphs: [], text: '', fill: null, stroke: null })
    slide.shapes.push(shape)
    this.deck.set({ ...deck })
    this.selectedShapeId.set(shape.id)
    this.setDirty(true)
  }
  setShapeFill(value: string) {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return
    this.patchSelectedShape((shape) => (shape.fill = value), false, true)
  }
  setShapeStroke(value: string) {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return
    // strokeWidth is stored in CSS pixels in the editor model.  The OOXML
    // serializer converts it back to EMUs, so never assign an EMU value here.
    this.patchSelectedShape(
      (shape) => {
        shape.stroke = value
        shape.strokeWidth = Math.max(1, shape.strokeWidth || 1)
      },
      false,
      true
    )
  }
  clearShapeStroke() {
    this.patchSelectedShape(
      (shape) => {
        shape.stroke = null
        shape.strokeWidth = 0
      },
      false,
      true
    )
  }

  setVerticalAlign(verticalAlign: PptxShape['verticalAlign']) {
    this.patchSelectedShape((shape) => (shape.verticalAlign = verticalAlign), true)
  }

  toggleTextWrap() {
    this.patchSelectedShape((shape) => (shape.wrap = !shape.wrap), true)
  }

  rotateSelected(degrees: number) {
    this.patchSelectedShape((shape) => (shape.rotation = (((shape.rotation + degrees) % 360) + 360) % 360))
  }

  flipSelected(axis: 'horizontal' | 'vertical') {
    this.patchSelectedShape((shape) => {
      if (axis === 'horizontal') shape.flipH = !shape.flipH
      else shape.flipV = !shape.flipV
    })
  }

  alignSelected(kind: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') {
    const deck = this.deck()
    const slide = this.selectedSlide()
    const shape = this.selectedShape()
    if (!deck || !slide || !shape || !this.editable()) return
    this.pushHistory(deck)
    alignShape(shape, deck, kind)
    this.deck.set({ ...deck })
    this.setDirty(true)
  }

  moveSelectedLayer(direction: 'forward' | 'backward' | 'front' | 'back') {
    const deck = this.deck()
    const slide = this.selectedSlide()
    const shape = this.selectedShape()
    if (!deck || !slide || !shape || !this.editable()) return
    if (slide.shapes.indexOf(shape) < 0) return
    this.pushHistory(deck)
    moveShapeLayer(slide.shapes, shape, direction)
    this.deck.set({ ...deck })
    this.setDirty(true)
  }

  duplicateSelectedShape() {
    const source = this.selectedShape()
    if (source) this.insertShapeCopy(source)
  }

  copySelectedShape() {
    const source = this.selectedShape()
    if (!source || !this.editable()) return
    this.shapeClipboard.set(structuredClone(source))
  }

  cutSelectedShape() {
    const source = this.selectedShape()
    if (!source || !this.editable()) return
    this.shapeClipboard.set(structuredClone(source))
    this.deleteSelectedShape()
  }

  pasteCopiedShape() {
    const source = this.shapeClipboard()
    if (source) this.insertShapeCopy(source)
  }

  private insertShapeCopy(source: PptxShape) {
    const deck = this.deck()
    const slide = this.selectedSlide()
    if (!deck || !slide || !this.editable()) return
    this.pushHistory(deck)
    const copy = copyShapeForSlide(source, deck)
    slide.shapes.push(copy)
    if (copy.animation) slide.animationDirty = true
    this.deck.set({ ...deck })
    this.selectedShapeId.set(copy.id)
    this.setDirty(true)
  }

  deleteSelectedShape() {
    const deck = this.deck()
    const slide = this.selectedSlide()
    const shape = this.selectedShape()
    if (!deck || !slide || !shape || !this.editable()) return
    this.pushHistory(deck)
    if (shape.animation) slide.animationDirty = true
    if (shape.created) {
      slide.shapes = slide.shapes.filter((item) => item.id !== shape.id)
    } else {
      shape.deleted = true
    }
    this.deck.set({ ...deck })
    this.selectedShapeId.set(null)
    this.editingShapeId.set(null)
    this.setDirty(true)
  }

  deleteCurrentSlide() {
    const deck = this.deck()
    if (!deck || deck.slides.length <= 1 || !this.editable()) return
    this.pushHistory(deck)
    deck.slides.splice(this.selectedSlideIndex(), 1)
    this.selectedSlideIndex.set(Math.max(0, Math.min(this.selectedSlideIndex(), deck.slides.length - 1)))
    this.selectedShapeId.set(null)
    this.deck.set({ ...deck })
    this.setDirty(true)
  }

  moveCurrentSlide(offset: -1 | 1) {
    const deck = this.deck()
    const current = this.selectedSlideIndex()
    const target = current + offset
    if (!deck || !this.editable() || target < 0 || target >= deck.slides.length) return
    this.pushHistory(deck)
    const [slide] = deck.slides.splice(current, 1)
    deck.slides.splice(target, 0, slide)
    this.selectedSlideIndex.set(target)
    this.selectedShapeId.set(null)
    this.editingShapeId.set(null)
    this.deck.set({ ...deck })
    this.setDirty(true)
  }

  onShapePointerDown(shape: PptxShape, event: PointerEvent) {
    if (!this.editable() || !shape.editable || event.button !== 0) return
    if (this.editingShapeId() === shape.id && (event.target as HTMLElement)?.closest('textarea')) return
    const deck = this.deck()
    const point = deck ? this.slidePointFromEvent(event, deck) : null
    if (!deck || !point) return
    event.stopPropagation()
    this.selectedShapeId.set(shape.id)
    this.editingShapeId.set(null)
    this.#dragState = createPptxDragState('move', shape, point)
    ;(event.currentTarget as HTMLElement)?.setPointerCapture?.(event.pointerId)
  }

  onInkPointerDown(event: PointerEvent) {
    const tool = this.drawingTool()
    const deck = this.deck()
    const point = deck ? this.slidePointFromEvent(event, deck) : null
    if (!this.editable() || !deck || !point || tool === 'select' || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    if (tool === 'eraser') {
      this.eraseInkAt(point)
      return
    }
    const canvas = this.stageHost()?.nativeElement.querySelector('.xp-pptx-editor__canvas') as HTMLElement | null
    const scale = canvas ? canvas.getBoundingClientRect().width / deck.width : 0
    const width = this.drawingWidth() / Math.max(scale, 0.01)
    this.#inkState = { points: [point], tool, width }
    this.inkPreview.set([point])
    ;(event.currentTarget as SVGElement)?.setPointerCapture?.(event.pointerId)
  }

  inkPreviewStrokeWidth() {
    return this.#inkState?.width ?? 1
  }

  private slidePointFromEvent(event: PointerEvent, deck: PptxDeck): PptxPoint | null {
    const canvas = this.stageHost()?.nativeElement.querySelector('.xp-pptx-editor__canvas') as HTMLElement | null
    if (!canvas) return null
    return slidePointFromBounds(event.clientX, event.clientY, canvas.getBoundingClientRect(), deck)
  }

  onInkPointerMove(event: PointerEvent) {
    const ink = this.#inkState
    const deck = this.deck()
    if (!ink || !deck) return
    event.preventDefault()
    this.appendInkPoint(event, ink, deck)
  }

  onInkPointerUp() {
    if (this.#inkState) this.commitInkStroke()
  }

  private appendInkPoint(event: PointerEvent, ink: PptxInkState, deck: PptxDeck) {
    const point = this.slidePointFromEvent(event, deck)
    const previous = ink.points.at(-1)
    if (point && (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > ink.width * 0.35)) {
      ink.points.push(point)
      this.inkPreview.set([...ink.points])
    }
  }

  private eraseInkAt(point: PptxPoint) {
    const deck = this.deck()
    const slide = this.selectedSlide()
    if (!deck || !slide) return
    const shape = findInkAtPoint(slide.shapes, point)
    if (!shape) return
    this.pushHistory(deck)
    if (shape.created) slide.shapes = slide.shapes.filter((candidate) => candidate.id !== shape.id)
    else shape.deleted = true
    this.deck.set({ ...deck })
    this.setDirty(true)
  }

  private commitInkStroke() {
    const ink = this.#inkState
    this.#inkState = null
    this.inkPreview.set([])
    const deck = this.deck()
    const slide = this.selectedSlide()
    if (!ink || !deck || !slide) return
    const shape = createInkShape(ink.points, ink.tool, ink.width, this.drawingColor(), deck)
    if (!shape) return
    this.pushHistory(deck)
    slide.shapes.push(shape)
    this.deck.set({ ...deck })
    this.setDirty(true)
  }

  onResizePointerDown(shape: PptxShape, event: PointerEvent) {
    if (!this.editable() || !shape.editable || event.button !== 0) return
    const deck = this.deck()
    const point = deck ? this.slidePointFromEvent(event, deck) : null
    if (!deck || !point) return
    event.preventDefault()
    event.stopPropagation()
    this.selectedShapeId.set(shape.id)
    this.#dragState = createPptxDragState('resize', shape, point)
    ;(event.currentTarget as HTMLElement)?.setPointerCapture?.(event.pointerId)
  }

  @HostListener('document:pointermove', ['$event'])
  onPointerMove(event: PointerEvent) {
    const ink = this.#inkState
    const inkDeck = this.deck()
    if (ink && inkDeck) {
      this.appendInkPoint(event, ink, inkDeck)
      return
    }
    const drag = this.#dragState
    const deck = this.deck()
    const shape =
      drag && deck ? deck.slides[this.selectedSlideIndex()]?.shapes.find((item) => item.id === drag.shapeId) : null
    if (!drag || !deck || !shape) return
    const point = this.slidePointFromEvent(event, deck)
    if (!point) return
    event.preventDefault()
    const dx = point.x - drag.startPoint.x
    const dy = point.y - drag.startPoint.y
    if (!drag.historyPushed && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
      this.pushHistory(deck)
      drag.historyPushed = true
    }
    if (drag.mode === 'move') {
      shape.x = Math.round(Math.max(0, Math.min(deck.width - shape.width, drag.x + dx)))
      shape.y = Math.round(Math.max(0, Math.min(deck.height - shape.height, drag.y + dy)))
    } else {
      shape.width = Math.round(Math.max(120000, Math.min(deck.width - shape.x, drag.width + dx)))
      shape.height = Math.round(Math.max(80000, Math.min(deck.height - shape.y, drag.height + dy)))
    }
    this.deck.set({ ...deck })
    this.setDirty(true)
  }

  @HostListener('document:pointerup')
  @HostListener('document:pointercancel')
  onPointerUp() {
    this.onInkPointerUp()
    this.#dragState = null
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    const deck = this.deck()
    if (deck && this.slideshowSlideIndex() != null) {
      if (event.key === 'Escape') this.closeSlideshow()
      else if (event.key === 'ArrowLeft' || event.key === 'PageUp') this.stepSlideshow(-1)
      else if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') this.stepSlideshow(1)
      else return
      event.preventDefault()
      return
    }
    const shape = this.selectedShape()
    if (!deck || !this.editable()) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      this.requestSave()
      return
    }
    if (event.key === 'F5') {
      event.preventDefault()
      this.startSlideshow(!event.shiftKey)
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      event.shiftKey ? this.redo() : this.undo()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault()
      this.redo()
      return
    }
    if (this.editingShapeId()) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && shape) {
      event.preventDefault()
      this.copySelectedShape()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'x' && shape) {
      event.preventDefault()
      this.cutSelectedShape()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v' && this.canPasteShape()) {
      event.preventDefault()
      this.pasteCopiedShape()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && shape) {
      event.preventDefault()
      this.duplicateSelectedShape()
      return
    }
    if (!shape) return
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      this.deleteSelectedShape()
      return
    }
    const step = event.shiftKey ? 100000 : 25000
    const delta =
      event.key === 'ArrowLeft'
        ? [-step, 0]
        : event.key === 'ArrowRight'
          ? [step, 0]
          : event.key === 'ArrowUp'
            ? [0, -step]
            : event.key === 'ArrowDown'
              ? [0, step]
              : null
    if (!delta) return
    event.preventDefault()
    this.pushHistory(deck)
    shape.x = Math.max(0, Math.min(deck.width - shape.width, shape.x + delta[0]))
    shape.y = Math.max(0, Math.min(deck.height - shape.height, shape.y + delta[1]))
    this.deck.set({ ...deck })
    this.setDirty(true)
  }

  duplicateCurrentSlide() {
    const deck = this.deck()
    const source = this.selectedSlide()
    if (!deck || !source || !this.editable()) return
    this.pushHistory(deck)
    const copy = createSlideCopy(deck, source, false)
    const index = this.selectedSlideIndex() + 1
    deck.slides.splice(index, 0, copy)
    this.deck.set({ ...deck })
    this.selectedSlideIndex.set(index)
    this.selectedShapeId.set(null)
    this.setDirty(true)
  }

  addBlankSlide() {
    const deck = this.deck()
    const source = this.selectedSlide()
    if (!deck || !source || !this.editable()) return
    this.pushHistory(deck)
    const index = this.selectedSlideIndex() + 1
    const blank = createSlideCopy(deck, source, true)
    deck.slides.splice(index, 0, blank)
    this.deck.set({ ...deck })
    this.selectedSlideIndex.set(index)
    this.selectedShapeId.set(null)
    this.setDirty(true)
  }

  startSlideshow(fromStart = false) {
    const deck = this.deck()
    if (deck) this.slideshowSlideIndex.set(fromStart ? firstVisibleSlideIndex(deck) : this.selectedSlideIndex())
  }

  closeSlideshow() {
    this.slideshowSlideIndex.set(null)
  }

  stepSlideshow(offset: -1 | 1) {
    const deck = this.deck()
    const current = this.slideshowSlideIndex()
    if (!deck || current == null) return
    this.slideshowSlideIndex.set(nextVisibleSlideIndex(deck, current, offset))
  }

  requestSave() {
    if (this.dirty()) this.saveRequest.emit()
  }

  async pasteText() {
    const shape = this.selectedShape()
    if (!shape || !shape.editable || typeof navigator === 'undefined' || !navigator.clipboard?.readText) return
    try {
      const text = await navigator.clipboard.readText()
      if (text) this.updateShape(shape, shape.text ? `${shape.text}\n${text}` : text)
    } catch {
      // Clipboard access can be denied by the browser; keep the editor usable.
    }
  }

  findReplace() {
    const deck = this.deck()
    if (!deck || typeof window === 'undefined') return
    const find = window.prompt('Find text')
    if (!find) return
    const replace = window.prompt('Replace with', '')
    if (replace == null) return
    const matches = deck.slides
      .flatMap((slide) => slide.shapes)
      .filter((shape) => shape.editable && shape.text.includes(find))
    if (!matches.length) return
    this.pushHistory(deck)
    for (const shape of matches) {
      shape.text = shape.text.split(find).join(replace)
      shape.paragraphs = paragraphsForShapeText(shape, shape.text)
    }
    this.deck.set({ ...deck })
    this.setDirty(true)
  }

  updateShape(shape: PptxShape, value: string) {
    if (!this.editable() || !shape.editable) return
    const deck = this.deck()
    if (!deck) return
    if (this.#textEditHistoryShapeId !== shape.id) {
      this.pushHistory(deck)
      this.#textEditHistoryShapeId = shape.id
    }
    shape.text = value
    shape.paragraphs = paragraphsForShapeText(shape, value)
    this.deck.set({ ...deck })
    this.setDirty(true)
  }

  toggleAutoSave() {
    this.autoSave.update((value) => !value)
    if (this.autoSave() && this.dirty()) this.setDirty(true)
  }

  undo() {
    const current = this.deck()
    if (!current) return
    const previous = this.#editHistory.undo(current)
    if (!previous) return
    this.deck.set(previous)
    this.historyRevision.update((value) => value + 1)
    this.setDirty(this.#editHistory.dirty)
  }

  redo() {
    const current = this.deck()
    if (!current) return
    const next = this.#editHistory.redo(current)
    if (!next) return
    this.deck.set(next)
    this.historyRevision.update((value) => value + 1)
    this.setDirty(this.#editHistory.dirty)
  }

  setFontFamily(value: string) {
    const family = value.trim()
    if (!family) return
    this.patchSelectedShape((shape) => {
      shape.fontFamily = family
      for (const run of shape.paragraphs.flatMap((paragraph) => paragraph.runs)) run.fontFamily = family
    }, true)
  }

  setFontSize(value: string | number) {
    const size = Number(value)
    if (!Number.isFinite(size)) return
    this.patchSelectedShape((shape) => {
      shape.fontSizePt = Math.min(144, Math.max(1, size))
      for (const run of shape.paragraphs.flatMap((paragraph) => paragraph.runs)) run.fontSizePt = shape.fontSizePt
    }, true)
  }

  adjustFontSize(delta: number) {
    const shape = this.selectedShape()
    if (shape) this.setFontSize(shape.fontSizePt + delta)
  }

  toggleTextFormat(kind: 'bold' | 'italic' | 'underline' | 'strike' | 'superscript' | 'subscript') {
    this.patchSelectedShape((shape) => {
      const value = !shape[kind]
      shape[kind] = value
      for (const run of shape.paragraphs.flatMap((paragraph) => paragraph.runs)) run[kind] = value
    }, true)
  }

  setTextColor(value: string) {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return
    this.patchSelectedShape((shape) => {
      shape.textColor = value
      for (const run of shape.paragraphs.flatMap((paragraph) => paragraph.runs)) run.color = value
    }, true)
  }

  setTextAlign(align: PptxShape['textAlign']) {
    this.patchSelectedShape((shape) => {
      shape.textAlign = align
      for (const paragraph of shape.paragraphs) paragraph.align = align
    }, true)
  }

  private patchSelectedShape(patch: (shape: PptxShape) => void, textFormatDirty = false, shapeStyleDirty = false) {
    if (!this.editable()) return
    const deck = this.deck()
    const shape = this.selectedShape()
    if (!deck || !shape || !shape.editable) return
    this.pushHistory(deck)
    patch(shape)
    if (textFormatDirty) shape.formatDirty = true
    if (shapeStyleDirty) shape.shapeStyleDirty = true
    this.deck.set({ ...deck })
    this.setDirty(true)
  }

  private pushHistory(deck: PptxDeck) {
    this.#editHistory.push(deck)
    this.historyRevision.update((value) => value + 1)
  }

  updateZoom(value: string | number) {
    const percent = Number(value)
    if (Number.isFinite(percent)) this.zoom.set(Math.min(2, Math.max(0.5, percent / 100)))
  }

  resetZoom() {
    this.zoom.set(1)
  }

  async save() {
    const deck = this.deck()
    const sourceBuffer = this.#sourceBuffer
    if (!deck || !sourceBuffer) return null

    try {
      const buffer = await savePptx(deck, sourceBuffer)
      return createPptxFile(buffer, this.fileName())
    } catch (error) {
      this.emitError(error)
      return null
    }
  }

  reload() {
    if (this.#sourceBuffer) void this.load(this.#sourceBuffer)
  }

  markSaved() {
    this.#editHistory.markSaved()
    this.setDirty(false)
  }

  private async load(buffer: ArrayBuffer) {
    const revision = ++this.#loadRevision
    this.loading.set(true)
    this.error.set(null)
    try {
      const deck = await parsePptx(buffer)
      if (revision !== this.#loadRevision) return
      this.#sourceBuffer = buffer
      this.deck.set(deck)
      this.selectedSlideIndex.set(0)
      this.selectedShapeId.set(null)
      this.editingShapeId.set(null)
      this.slideshowSlideIndex.set(null)
      this.#editHistory.reset()
      this.historyRevision.update((value) => value + 1)
      this.setDirty(false)
    } catch (error) {
      if (revision !== this.#loadRevision) return
      this.error.set('Unable to open this presentation.')
      this.emitError(error)
    } finally {
      if (revision === this.#loadRevision) this.loading.set(false)
    }
  }

  private setDirty(value: boolean) {
    this.dirty.set(value)
    this.dirtyChange.emit(value)
    if (!value) {
      if (this.#autoSaveTimer) clearTimeout(this.#autoSaveTimer)
      this.#autoSaveTimer = null
    } else if (this.autoSave()) {
      if (this.#autoSaveTimer) clearTimeout(this.#autoSaveTimer)
      this.#autoSaveTimer = setTimeout(() => {
        this.#autoSaveTimer = null
        this.saveRequest.emit()
      }, 1500)
    }
  }

  private emitError(error: unknown) {
    this.editorError.emit(error instanceof Error ? error : new Error(String(error)))
  }
}
