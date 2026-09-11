import type {
  PptxAnimationEffect,
  PptxAnimationTrigger,
  PptxDeck,
  PptxParagraph,
  PptxRun,
  PptxShape,
  PptxTransition
} from './pptx-file.utils'

const EMU_PER_POINT = 12700

export type PptxInkTool = 'select' | 'pen' | 'highlighter' | 'eraser'
export type PptxPoint = { x: number; y: number }
export type PptxDragState = {
  mode: 'move' | 'resize'
  shapeId: string
  startPoint: PptxPoint
  x: number
  y: number
  width: number
  height: number
  historyPushed: boolean
}

export function createPptxDragState(
  mode: PptxDragState['mode'],
  shape: PptxShape,
  startPoint: PptxPoint
): PptxDragState {
  return {
    mode,
    shapeId: shape.id,
    startPoint,
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
    historyPushed: false
  }
}

export type PptxToolbarTab = '开始' | '插入' | '绘图' | '设计' | '切换' | '动画' | '幻灯片放映' | '审阅' | '视图'

export const PPTX_TOOLBAR_TABS: readonly PptxToolbarTab[] = [
  '开始',
  '插入',
  '绘图',
  '设计',
  '切换',
  '动画',
  '幻灯片放映',
  '审阅',
  '视图'
]

export const PPTX_TRANSITIONS: readonly { value: PptxTransition; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'morph', label: '平滑' },
  { value: 'fade', label: '淡入' },
  { value: 'push', label: '推入' },
  { value: 'wipe', label: '擦除' },
  { value: 'split', label: '分割' },
  { value: 'circle', label: '圆形' },
  { value: 'cover', label: '覆盖' },
  { value: 'pull', label: '揭开' },
  { value: 'dissolve', label: '溶解' },
  { value: 'zoom', label: '缩放' },
  { value: 'random', label: '随机' }
]

export const PPTX_ANIMATIONS: readonly { value: PptxAnimationEffect | 'none'; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'appear', label: '出现' },
  { value: 'fade', label: '淡入' },
  { value: 'flyIn', label: '飞入' },
  { value: 'wipe', label: '擦除' },
  { value: 'zoom', label: '缩放' },
  { value: 'pulse', label: '脉冲' },
  { value: 'spin', label: '旋转' },
  { value: 'disappear', label: '消失' },
  { value: 'fadeOut', label: '淡出' }
]

export const PPTX_ANIMATION_TRIGGERS: readonly { value: PptxAnimationTrigger; label: string }[] = [
  { value: 'onClick', label: '单击时' },
  { value: 'withPrev', label: '与上一动画同时' },
  { value: 'afterPrev', label: '上一动画之后' }
]

export const PPTX_THEME_PRESETS = [
  themePreset('office', 'Office', rgbColor(255, 255, 255), rgbColor(31, 41, 55), rgbColor(68, 114, 196), 'Aptos'),
  themePreset('ember', '红韵', rgbColor(255, 247, 247), rgbColor(69, 10, 10), rgbColor(185, 28, 28), 'Aptos'),
  themePreset('indigo', '靛蓝', rgbColor(248, 250, 252), rgbColor(30, 27, 75), rgbColor(67, 56, 202), 'Aptos'),
  themePreset('forest', '森绿', rgbColor(247, 254, 231), rgbColor(20, 83, 45), rgbColor(22, 101, 52), 'Aptos'),
  themePreset('cream', '米黄', rgbColor(255, 251, 235), rgbColor(69, 26, 3), rgbColor(180, 83, 9), 'Georgia'),
  themePreset('rose', '蔷薇', rgbColor(255, 241, 242), rgbColor(76, 5, 25), rgbColor(190, 24, 93), 'Aptos'),
  themePreset('graphite', '石墨', rgbColor(245, 245, 245), rgbColor(23, 23, 23), rgbColor(82, 82, 82), 'Arial'),
  themePreset('midnight', '午夜', rgbColor(15, 23, 42), rgbColor(248, 250, 252), rgbColor(56, 189, 248), 'Aptos')
] as const

export type PptxDeckEditCommand =
  | 'background'
  | 'theme'
  | 'slideSize'
  | 'transition'
  | 'transitionAll'
  | 'hidden'
  | 'animationEffect'
  | 'animationTrigger'
  | 'animationDuration'
  | 'animationDelay'

export function applyPptxDeckEdit(
  deck: PptxDeck,
  slideIndex: number,
  shapeId: string | null,
  command: PptxDeckEditCommand,
  value: string | number | boolean
) {
  const slide = deck.slides[slideIndex]
  if (!slide) return false
  if (command === 'background' && typeof value === 'string' && isColor(value)) {
    slide.background = value
    slide.backgroundDirty = true
    return true
  }
  if (command === 'theme' && typeof value === 'string') return applyTheme(deck, value)
  if (command === 'slideSize' && typeof value === 'string') return resizeDeck(deck, value)
  if ((command === 'transition' || command === 'transitionAll') && typeof value === 'string') {
    const transition = PPTX_TRANSITIONS.find((item) => item.value === value)?.value
    if (!transition) return false
    const slides = command === 'transitionAll' ? deck.slides : [slide]
    for (const target of slides) {
      target.transition = transition
      target.transitionDirty = true
    }
    return true
  }
  if (command === 'hidden' && typeof value === 'boolean') {
    slide.hidden = value
    slide.hiddenDirty = true
    return true
  }
  const shape = slide.shapes.find((item) => item.id === shapeId && item.editable && !item.deleted)
  if (!shape) return false
  if (command === 'animationEffect' && typeof value === 'string') {
    const effect = PPTX_ANIMATIONS.find((item) => item.value === value)?.value
    if (!effect) return false
    shape.animation = effect === 'none' ? null : { effect, trigger: 'onClick', durationMs: 700, delayMs: 0 }
  } else if (command === 'animationTrigger' && typeof value === 'string' && shape.animation) {
    const trigger = PPTX_ANIMATION_TRIGGERS.find((item) => item.value === value)?.value
    if (!trigger) return false
    shape.animation.trigger = trigger
  } else if ((command === 'animationDuration' || command === 'animationDelay') && shape.animation) {
    const milliseconds = Math.max(command === 'animationDuration' ? 100 : 0, Math.round(Number(value) * 1000))
    if (!Number.isFinite(milliseconds)) return false
    if (command === 'animationDuration') shape.animation.durationMs = milliseconds
    else shape.animation.delayMs = milliseconds
  } else return false
  shape.animationDirty = true
  slide.animationDirty = true
  return true
}

export function firstVisibleSlideIndex(deck: PptxDeck) {
  const index = deck.slides.findIndex((slide) => !slide.hidden)
  return index < 0 ? 0 : index
}

export function nextVisibleSlideIndex(deck: PptxDeck, current: number, offset: -1 | 1) {
  let index = current + offset
  while (index >= 0 && index < deck.slides.length && deck.slides[index]?.hidden) index += offset
  return Math.max(0, Math.min(deck.slides.length - 1, index))
}

export function pptxToolbarHint(tab: PptxToolbarTab) {
  if (tab === '设计') return '版式与背景'
  if (tab === '切换') return '切换效果将在放映时使用'
  if (tab === '动画') return '选择元素后可编辑内容'
  return '演示文稿工具'
}

export function cloneDeck(deck: PptxDeck): PptxDeck {
  return structuredClone(deck)
}

export function createEditorShape(
  id: string,
  options: Partial<
    Pick<
      PptxShape,
      'x' | 'y' | 'width' | 'height' | 'text' | 'fontSizePt' | 'textAlign' | 'geometry' | 'fill' | 'stroke'
    >
  >
): PptxShape {
  const text = options.text ?? ''
  const fontSizePt = options.fontSizePt ?? 24
  const textAlign = options.textAlign ?? 'left'
  const run: PptxRun = {
    text,
    fontSizePt,
    fontFamily: 'Arial',
    color: rgbColor(31, 41, 55),
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    superscript: false,
    subscript: false
  }
  return {
    id,
    name: id,
    kind: 'shape',
    text,
    paragraphs: text ? [{ text, runs: [run], align: textAlign, level: 0 }] : [],
    x: options.x ?? 1000000,
    y: options.y ?? 1000000,
    width: options.width ?? 4000000,
    height: options.height ?? 1000000,
    rotation: 0,
    flipH: false,
    flipV: false,
    fill: options.fill ?? null,
    stroke: options.stroke ?? null,
    strokeWidth: options.stroke ? 1 : 0,
    geometry: options.geometry ?? 'rect',
    imageSrc: null,
    imageCrop: null,
    textColor: rgbColor(31, 41, 55),
    fontSizePt,
    fontScale: 1,
    fontFamily: 'Arial',
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    superscript: false,
    subscript: false,
    textAlign,
    verticalAlign: 'middle',
    wrap: true,
    autoFit: 'shrink',
    margin: { left: 91440, right: 91440, top: 45720, bottom: 45720 },
    editable: true,
    table: null,
    sourceText: '',
    formatDirty: true,
    created: true
  }
}

export function createTextBoxShape(deck: PptxDeck) {
  return createEditorShape(`textbox-${Date.now()}`, {
    x: Math.round(deck.width * 0.12),
    y: Math.round(deck.height * 0.18),
    width: Math.round(deck.width * 0.55),
    height: Math.round(deck.height * 0.16),
    text: '输入文本',
    fontSizePt: 24,
    textAlign: 'left'
  })
}

export function createPresetShape(deck: PptxDeck, geometry: PptxShape['geometry']) {
  return createEditorShape(`shape-${Date.now()}`, {
    x: Math.round(deck.width * 0.2),
    y: Math.round(deck.height * 0.28),
    width: Math.round(deck.width * 0.28),
    height: Math.round(deck.height * 0.2),
    geometry,
    fill: rgbColor(219, 234, 254),
    stroke: rgbColor(37, 99, 235),
    text: ''
  })
}

export function createTableShape(deck: PptxDeck, rowCount: number, columnCount: number) {
  const rows = Array.from({ length: rowCount }, (_, row) =>
    Array.from({ length: columnCount }, (_, column) => ({
      text: row === 0 ? `列 ${column + 1}` : `单元格 ${row + 1},${column + 1}`,
      colSpan: 1,
      rowSpan: 1
    }))
  )
  const shape = createEditorShape(`table-${Date.now()}`, {
    x: Math.round(deck.width * 0.16),
    y: Math.round(deck.height * 0.24),
    width: Math.round(deck.width * 0.62),
    height: Math.round(deck.height * 0.3),
    fill: rgbColor(255, 255, 255),
    stroke: rgbColor(148, 163, 184)
  })
  shape.kind = 'table'
  shape.table = { columns: Array.from({ length: columnCount }, () => 1), rows }
  return shape
}

export function copyShapeForSlide(source: PptxShape, deck: PptxDeck) {
  const copy = structuredClone(source)
  copy.id = `${source.id}-copy-${Date.now()}`
  copy.sourceId = undefined
  copy.created = true
  copy.deleted = false
  copy.editable = true
  copy.x = Math.min(deck.width - copy.width, copy.x + Math.round(deck.width * 0.03))
  copy.y = Math.min(deck.height - copy.height, copy.y + Math.round(deck.height * 0.03))
  return copy
}

export function alignShape(
  shape: PptxShape,
  deck: PptxDeck,
  kind: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
) {
  if (kind === 'left') shape.x = 0
  if (kind === 'center') shape.x = Math.round((deck.width - shape.width) / 2)
  if (kind === 'right') shape.x = Math.max(0, deck.width - shape.width)
  if (kind === 'top') shape.y = 0
  if (kind === 'middle') shape.y = Math.round((deck.height - shape.height) / 2)
  if (kind === 'bottom') shape.y = Math.max(0, deck.height - shape.height)
}

export function moveShapeLayer(
  shapes: PptxShape[],
  shape: PptxShape,
  direction: 'forward' | 'backward' | 'front' | 'back'
) {
  const index = shapes.indexOf(shape)
  if (index < 0) return false
  shapes.splice(index, 1)
  const target =
    direction === 'front'
      ? shapes.length
      : direction === 'back'
        ? 0
        : direction === 'forward'
          ? Math.min(shapes.length, index + 1)
          : Math.max(0, index - 1)
  shapes.splice(target, 0, shape)
  return true
}

export function createSlideCopy(deck: PptxDeck, source: PptxDeck['slides'][number], blank: boolean) {
  const copy = cloneDeck({ width: deck.width, height: deck.height, slides: [source] }).slides[0]
  copy.path = `ppt/slides/editor-slide-${Date.now()}.xml`
  copy.sourcePath = source.path
  copy.created = true
  copy.shapes = copy.shapes.map((shape) => ({ ...shape, deleted: blank, created: false }))
  if (blank) {
    copy.background = rgbColor(255, 255, 255)
    copy.backgroundDirty = true
  }
  return copy
}

export function pickImageDataUrl() {
  if (typeof document === 'undefined') return Promise.resolve<string | null>(null)
  return new Promise<string | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp,image/svg+xml'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    }
    input.click()
  })
}

export function paragraphsForShapeText(shape: PptxShape, value: string): PptxParagraph[] {
  return value.split(/\n/).map((text) => ({
    text,
    level: 0,
    align: shape.textAlign,
    runs: [
      {
        text,
        fontSizePt: shape.fontSizePt,
        fontFamily: shape.fontFamily,
        color: shape.textColor,
        bold: shape.bold,
        italic: shape.italic,
        underline: shape.underline,
        strike: shape.strike,
        superscript: shape.superscript,
        subscript: shape.subscript
      }
    ]
  }))
}

export function slidePointFromBounds(clientX: number, clientY: number, bounds: DOMRect, deck: PptxDeck): PptxPoint {
  return {
    x: Math.max(0, Math.min(deck.width, ((clientX - bounds.left) / Math.max(1, bounds.width)) * deck.width)),
    y: Math.max(0, Math.min(deck.height, ((clientY - bounds.top) / Math.max(1, bounds.height)) * deck.height))
  }
}

export function findInkAtPoint(shapes: PptxShape[], point: PptxPoint) {
  return [...shapes]
    .reverse()
    .find(
      (shape) =>
        shape.editorKind === 'ink' &&
        !shape.deleted &&
        point.x >= shape.x &&
        point.x <= shape.x + shape.width &&
        point.y >= shape.y &&
        point.y <= shape.y + shape.height
    )
}

export function createInkShape(
  points: PptxPoint[],
  tool: 'pen' | 'highlighter',
  strokeWidth: number,
  color: string,
  deck: PptxDeck
) {
  if (points.length < 2 || typeof btoa === 'undefined') return null
  const padding = strokeWidth * 2
  const left = Math.max(0, Math.min(...points.map((point) => point.x)) - padding)
  const top = Math.max(0, Math.min(...points.map((point) => point.y)) - padding)
  const right = Math.min(deck.width, Math.max(...points.map((point) => point.x)) + padding)
  const bottom = Math.min(deck.height, Math.max(...points.map((point) => point.y)) + padding)
  const width = Math.max(1, right - left)
  const height = Math.max(1, bottom - top)
  const relativePoints = points.map((point) => `${point.x - left},${point.y - top}`).join(' ')
  const opacity = tool === 'highlighter' ? '0.35' : '1'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><polyline points="${relativePoints}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/></svg>`
  const timestamp = Date.now()
  const shape = createEditorShape(`ink-${timestamp}`, { x: left, y: top, width, height })
  shape.name = `Ink ${timestamp}`
  shape.kind = 'image'
  shape.editorKind = 'ink'
  shape.imageSrc = `data:image/svg+xml;base64,${btoa(svg)}`
  shape.paragraphs = []
  shape.text = ''
  shape.fill = null
  shape.stroke = null
  return shape
}

export function textFitScale(shape: PptxShape) {
  if (!shape.text || shape.width <= 0 || shape.height <= 0) return 1
  const availableWidth = Math.max(1, shape.width - shape.margin.left - shape.margin.right)
  const availableHeight = Math.max(1, shape.height - shape.margin.top - shape.margin.bottom)
  const paragraphs = shape.paragraphs.length
    ? shape.paragraphs
    : shape.text.split('\n').map((text) => ({ text, runs: [], align: shape.textAlign, level: 0 }))
  let contentHeight = 0
  let widestLine = 0

  for (const paragraph of paragraphs) {
    const runs = paragraph.runs.length ? paragraph.runs : [{ text: paragraph.text, fontSizePt: shape.fontSizePt }]
    let lineWidth = 0
    let lineHeight = shape.fontSizePt * shape.fontScale * EMU_PER_POINT * 1.2
    let hasContent = false
    const commitLine = () => {
      widestLine = Math.max(widestLine, lineWidth)
      contentHeight += lineHeight
      lineWidth = 0
      lineHeight = shape.fontSizePt * shape.fontScale * EMU_PER_POINT * 1.2
      hasContent = false
    }

    for (const run of runs) {
      const fontEmu = run.fontSizePt * shape.fontScale * EMU_PER_POINT
      for (const character of run.text) {
        if (character === '\n') {
          commitLine()
          continue
        }
        const glyphWidth = fontEmu * glyphWidthFactor(character)
        if (shape.wrap && hasContent && lineWidth + glyphWidth > availableWidth) commitLine()
        lineWidth += glyphWidth
        lineHeight = Math.max(lineHeight, fontEmu * 1.2)
        hasContent = true
      }
    }
    commitLine()
  }

  const heightScale = availableHeight / Math.max(1, contentHeight)
  const widthScale = shape.wrap ? 1 : availableWidth / Math.max(1, widestLine)
  return Math.max(0.35, Math.min(1, heightScale, widthScale))
}

export function effectiveFontSizePt(shape: PptxShape) {
  const size = shape.fontSizePt * shape.fontScale * textFitScale(shape)
  return Math.max(1, Math.round(size * 2) / 2)
}

export function rgbColor(red: number, green: number, blue: number) {
  return `#${[red, green, blue].map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0')).join('')}`
}

function themePreset(id: string, name: string, background: string, text: string, accent: string, fontFamily: string) {
  return { id, name, background, text, accent, fontFamily }
}

function applyTheme(deck: PptxDeck, id: string) {
  const theme = PPTX_THEME_PRESETS.find((item) => item.id === id)
  if (!theme) return false
  for (const slide of deck.slides) {
    slide.background = theme.background
    slide.backgroundDirty = true
    for (const shape of slide.shapes) {
      if (!shape.editable || shape.deleted || !shape.text) continue
      shape.fontFamily = theme.fontFamily
      shape.textColor = theme.text
      shape.formatDirty = true
      for (const run of shape.paragraphs.flatMap((paragraph) => paragraph.runs)) {
        run.fontFamily = theme.fontFamily
        run.color = theme.text
      }
    }
  }
  return true
}

function resizeDeck(deck: PptxDeck, size: string) {
  const dimensions = size === '16:9' ? [12192000, 6858000] : size === '4:3' ? [9144000, 6858000] : null
  if (!dimensions) return false
  const [width, height] = dimensions
  const scaleX = width / deck.width
  const scaleY = height / deck.height
  for (const shape of deck.slides.flatMap((slide) => slide.shapes)) {
    shape.x = Math.round(shape.x * scaleX)
    shape.y = Math.round(shape.y * scaleY)
    shape.width = Math.round(shape.width * scaleX)
    shape.height = Math.round(shape.height * scaleY)
  }
  deck.width = width
  deck.height = height
  return true
}

function isColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value)
}

export function clampInteger(value: string | number, minimum: number, maximum: number, fallback: number) {
  const parsed = Math.round(Number(value))
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback
}

function glyphWidthFactor(character: string) {
  const code = character.codePointAt(0) ?? 0
  if (
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    code > 0xffff
  )
    return 1
  if (/\s/.test(character)) return 0.32
  if (/[A-Z0-9]/.test(character)) return 0.62
  if (/[.,:;!?'"`|ijlI]/.test(character)) return 0.32
  return 0.52
}
