import { textFitScale } from './pptx-editor-model.utils'
import type { PptxDeck, PptxLineEnd, PptxRun, PptxShape, PptxTransition } from './pptx-file.utils'

export function pptxShapeStyle(shape: PptxShape, presentation: PptxDeck) {
  const polygon = isPolygonGeometry(shape.geometry)
  const fontSize = `${(shape.fontSizePt * shape.fontScale * textFitScale(shape) * 12700 * 100) / presentation.width}cqw`
  const transform = [
    shape.rotation ? `rotate(${shape.rotation}deg)` : '',
    shape.flipH ? 'scaleX(-1)' : '',
    shape.flipV ? 'scaleY(-1)' : ''
  ]
    .filter(Boolean)
    .join(' ')
  return {
    left: `${(shape.x / presentation.width) * 100}%`,
    top: `${(shape.y / presentation.height) * 100}%`,
    width: shape.kind === 'line' && shape.width <= 0 ? '1px' : `${(shape.width / presentation.width) * 100}%`,
    height: shape.kind === 'line' && shape.height <= 0 ? '1px' : `${(shape.height / presentation.height) * 100}%`,
    background: shape.fillCss || shape.fill || 'transparent',
    borderColor: shape.stroke || 'transparent',
    borderWidth: polygon || shape.kind === 'line' ? '0' : shape.stroke ? `${Math.max(1, shape.strokeWidth)}px` : '0',
    color: shape.textColor,
    opacity: shape.kind === 'image' ? (shape.opacity ?? 1) : 1,
    borderRadius: roundedGeometry(shape),
    fontSize,
    fontFamily: shape.fontFamily || 'Arial, sans-serif',
    fontWeight: shape.bold ? '700' : '400',
    fontStyle: shape.italic ? 'italic' : 'normal',
    textDecoration:
      [shape.underline ? 'underline' : '', shape.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none',
    textAlign: shape.textAlign,
    whiteSpace: shape.wrap ? 'pre-wrap' : 'pre',
    overflow: 'hidden',
    clipPath: polygon
      ? `polygon(${polygonClipPoints(shape.geometry, shape.geometryAdjust, shape.width, shape.height)})`
      : 'none',
    transform: transform || 'none'
  }
}

export function pptxSlideBackground(slide: PptxDeck['slides'][number]) {
  return slide.backgroundCss || slide.background || 'Canvas'
}

/**
 * Returns an SVG path in a 0..100 local viewBox for every connector preset.
 * Keeping the path local means the same output can be used by the slide canvas,
 * thumbnails and slideshow while CSS still applies the source rotation/flips.
 */
export function pptxConnectorPath(shape: PptxShape) {
  const geometry = shape.geometry || 'line'
  const points = connectorPoints(shape)
  if (points.length < 4) return 'M 0 0 L 100 100'
  const path = [`M ${points[0]} ${points[1]}`]
  if (/^curvedConnector/.test(geometry) && points.length >= 6) {
    for (let index = 2; index < points.length; index += 2) {
      const x0 = points[index - 2] ?? 0
      const y0 = points[index - 1] ?? 0
      const x1 = points[index] ?? 0
      const y1 = points[index + 1] ?? 0
      const prevX = points[index - 4] ?? x0
      const prevY = points[index - 3] ?? y0
      const nextX = points[index + 2] ?? x1
      const nextY = points[index + 3] ?? y1
      path.push(
        `C ${x0 + (x1 - prevX) / 6} ${y0 + (y1 - prevY) / 6}, ${x1 - (nextX - x0) / 6} ${y1 - (nextY - y0) / 6}, ${x1} ${y1}`
      )
    }
  } else {
    for (let index = 2; index < points.length; index += 2) path.push(`L ${points[index]} ${points[index + 1]}`)
  }
  return path.join(' ')
}

export function pptxLineMarkerId(shape: PptxShape, side: 'start' | 'end') {
  return `xp-pptx-marker-${shape.id.replace(/[^a-zA-Z0-9_-]/g, '_')}-${side}`
}

export function pptxLineMarkerUrl(shape: PptxShape, side: 'start' | 'end') {
  return lineEnd(shape, side) === 'none' ? null : `url(#${pptxLineMarkerId(shape, side)})`
}

export function pptxLineMarkerPath(shape: PptxShape, side: 'start' | 'end') {
  switch (lineEnd(shape, side)) {
    case 'diamond':
      return 'M 0 3 L 3 0 L 6 3 L 3 6 Z'
    case 'oval':
      return 'M 6 3 A 3 3 0 1 1 0 3 A 3 3 0 1 1 6 3 Z'
    case 'open':
      return 'M 6 0 L 0 3 L 6 6'
    case 'stealth':
      return 'M 6 3 L 0 0 L 1.5 3 L 0 6 Z'
    case 'triangle':
    default:
      return 'M 6 3 L 0 0 L 0 6 Z'
  }
}

export function pptxLineDashArray(shape: PptxShape) {
  switch (shape.lineDash) {
    case 'dash':
    case 'dashStyle':
      return '8 5'
    case 'dot':
      return '2 4'
    case 'dashDot':
      return '8 4 2 4'
    case 'lgDash':
      return '14 6'
    case 'lgDashDot':
      return '14 5 2 5'
    case 'lgDashDotDot':
      return '14 5 2 5 2 5'
    case 'sysDash':
      return '8 4'
    case 'sysDot':
      return '2 3'
    case 'sysDashDot':
      return '8 4 2 4'
    case 'sysDashDotDot':
      return '8 4 2 4 2 4'
    default:
      return null
  }
}

function lineEnd(shape: PptxShape, side: 'start' | 'end'): PptxLineEnd {
  return (side === 'start' ? shape.lineHeadEnd : shape.lineTailEnd) ?? 'none'
}

function connectorPoints(shape: PptxShape) {
  const geometry = shape.geometry || 'line'
  const width = shape.width > 0 ? 100 : 0
  const height = shape.height > 0 ? 100 : 0
  const clamp = (value: number, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value))
  const fraction = (name: string, fallback: number) => clamp((shape.geometryAdjust?.[name] ?? fallback) / 100000)
  if (/^bentConnector|^curvedConnector/.test(geometry)) {
    const count = Number(geometry.slice(-1)) || 2
    if (count <= 2) return [0, 0, width, 0, width, height]
    if (count === 3) {
      const x = width * fraction('adj1', 50000)
      return [0, 0, x, 0, x, height, width, height]
    }
    if (count === 4) {
      const x = width * fraction('adj1', 50000)
      const y = height * fraction('adj2', 50000)
      return [0, 0, x, 0, x, y, width, y, width, height]
    }
    const x1 = width * fraction('adj1', 33300)
    const y = height * fraction('adj2', 50000)
    const x2 = width * fraction('adj3', 66700)
    return [0, 0, x1, 0, x1, y, x2, y, x2, height, width, height]
  }
  // A zero-width or zero-height OOXML xfrm is meaningful: it represents a
  // vertical or horizontal connector rather than a diagonal fallback.
  return [0, 0, width, height]
}

export function pptxSelectionFrameStyle(shape: PptxShape, presentation: PptxDeck) {
  return {
    left: `${(shape.x / presentation.width) * 100}%`,
    top: `${(shape.y / presentation.height) * 100}%`,
    width: `${(shape.width / presentation.width) * 100}%`,
    height: `${(shape.height / presentation.height) * 100}%`,
    transform: shape.rotation ? `rotate(${shape.rotation}deg)` : 'none'
  }
}

export function pptxThumbnailShapeStyle(shape: PptxShape, presentation: PptxDeck) {
  return {
    ...pptxShapeStyle(shape, presentation),
    background: shape.fillCss || shape.fill || 'transparent',
    borderWidth: isPolygonGeometry(shape.geometry) || shape.kind === 'line' ? '0' : shape.stroke ? '0.5px' : '0'
  }
}

export function isPolygonGeometry(geometry: PptxShape['geometry']) {
  return new Set([
    'diamond',
    'flowChartDecision',
    'triangle',
    'rtTriangle',
    'hexagon',
    'parallelogram',
    'trapezoid',
    'pentagon',
    'octagon',
    'plus',
    'cross',
    'star5',
    'star6',
    'star8',
    'rightArrow',
    'leftArrow',
    'upArrow',
    'downArrow',
    'notchedRightArrow',
    'leftRightArrow',
    'upDownArrow',
    'upArrowCallout',
    'downArrowCallout',
    'leftArrowCallout',
    'rightArrowCallout',
    'chevron',
    'homePlate',
    'heart',
    'teardrop',
    'cloud',
    'snip1Rect',
    'snip2SameRect',
    'snip2DiagRect',
    'halfFrame',
    'corner',
    'diagStripe',
    'lightningBolt',
    'flowChartPreparation',
    'flowChartManualInput',
    'flowChartManualOperation',
    'flowChartOffpageConnector',
    'flowChartExtract',
    'flowChartMerge',
    'flowChartCollate',
    'gear6',
    'gear9',
    'quadArrow',
    'bentArrow'
  ]).has(geometry)
}

/** Normalized points for the common preset geometries. The SVG viewBox stretches these
 * points to the shape box, which also keeps the outline aligned at every zoom level. */
export function pptxPolygonPoints(
  geometry: PptxShape['geometry'],
  adjust?: Record<string, number>,
  boxWidth = 100,
  boxHeight = 100
) {
  const shortSide = Math.min(boxWidth, boxHeight)
  const fraction = (name: string, fallback: number) => Math.min(1, Math.max(0, (adjust?.[name] ?? fallback) / 100000))
  const normalized = (points: number[]) => {
    const values: string[] = []
    for (let index = 0; index < points.length; index += 2) {
      values.push(
        `${Math.round(((points[index] ?? 0) / Math.max(1, boxWidth)) * 10000) / 100},${Math.round(((points[index + 1] ?? 0) / Math.max(1, boxHeight)) * 10000) / 100}`
      )
    }
    return values.join(' ')
  }
  switch (geometry) {
    case 'diamond':
    case 'flowChartDecision':
      return '50,1 99,50 50,99 1,50'
    case 'triangle':
      return `${Math.round(fraction('adj', 50000) * 100)},1 99,99 1,99`
    case 'rtTriangle':
      return '1,1 99,99 1,99'
    case 'hexagon': {
      const inset = Math.round(((shortSide * fraction('adj', 25000)) / Math.max(1, boxWidth)) * 10000) / 100
      return `${inset},0 ${100 - inset},0 100,50 ${100 - inset},100 ${inset},100 0,50`
    }
    case 'parallelogram': {
      const inset = Math.round(((shortSide * fraction('adj', 25000)) / Math.max(1, boxWidth)) * 10000) / 100
      return `${inset},0 100,0 ${100 - inset},100 0,100`
    }
    case 'trapezoid': {
      const inset = Math.round(((shortSide * fraction('adj', 25000)) / Math.max(1, boxWidth)) * 10000) / 100
      return `${inset},0 ${100 - inset},0 100,100 0,100`
    }
    case 'pentagon':
      return '50,1 99,38 81,99 19,99 1,38'
    case 'octagon':
      return '29,1 71,1 99,29 99,71 71,99 29,99 1,71 1,29'
    case 'plus': {
      const inset = Math.round(((shortSide * fraction('adj', 25000)) / Math.max(1, boxWidth)) * 100)
      const yInset = Math.round(((shortSide * fraction('adj', 25000)) / Math.max(1, boxHeight)) * 100)
      return `${inset},0 ${100 - inset},0 ${100 - inset},${yInset} 100,${yInset} 100,${100 - yInset} ${100 - inset},${100 - yInset} ${100 - inset},100 ${inset},100 ${inset},${100 - yInset} 0,${100 - yInset} 0,${yInset} ${inset},${yInset}`
    }
    case 'cross':
      return '35,0 65,0 65,35 100,35 100,65 65,65 65,100 35,100 35,65 0,65 0,35 35,35'
    case 'star5':
      return starPoints(5, 50, 50, 48, 20, -90)
    case 'star6':
      return starPoints(6, 50, 50, 48, 24, -90)
    case 'star8':
      return starPoints(8, 50, 50, 48, 28, -90)
    case 'rightArrow': {
      const thick = boxHeight * fraction('adj1', 50000)
      const head = shortSide * fraction('adj2', 50000)
      return normalized([
        0,
        (boxHeight - thick) / 2,
        boxWidth - head,
        (boxHeight - thick) / 2,
        boxWidth - head,
        0,
        boxWidth,
        boxHeight / 2,
        boxWidth - head,
        boxHeight,
        boxWidth - head,
        (boxHeight + thick) / 2,
        0,
        (boxHeight + thick) / 2
      ])
    }
    case 'notchedRightArrow': {
      const thick = boxHeight * fraction('adj1', 50000)
      const head = Math.min(boxWidth, shortSide * fraction('adj2', 50000))
      const y1 = (boxHeight - thick) / 2
      const y2 = (boxHeight + thick) / 2
      const xh = boxWidth - head
      const notch = (head * thick) / Math.max(1, boxHeight)
      return normalized([
        0,
        y1,
        xh,
        y1,
        xh,
        0,
        boxWidth,
        boxHeight / 2,
        xh,
        boxHeight,
        xh,
        y2,
        0,
        y2,
        notch,
        boxHeight / 2
      ])
    }
    case 'leftArrow': {
      const thick = boxHeight * fraction('adj1', 50000)
      const head = Math.min(boxWidth, shortSide * fraction('adj2', 50000))
      const y1 = (boxHeight - thick) / 2
      const y2 = (boxHeight + thick) / 2
      return normalized([boxWidth, y1, head, y1, head, 0, 0, boxHeight / 2, head, boxHeight, head, y2, boxWidth, y2])
    }
    case 'upArrow': {
      const thick = boxWidth * fraction('adj1', 50000)
      const head = Math.min(boxHeight, shortSide * fraction('adj2', 50000))
      const x1 = (boxWidth - thick) / 2
      const x2 = (boxWidth + thick) / 2
      return normalized([x1, boxHeight, x1, head, 0, head, boxWidth / 2, 0, boxWidth, head, x2, head, x2, boxHeight])
    }
    case 'downArrow': {
      const thick = boxWidth * fraction('adj1', 50000)
      const head = Math.min(boxHeight, shortSide * fraction('adj2', 50000))
      const x1 = (boxWidth - thick) / 2
      const x2 = (boxWidth + thick) / 2
      const yh = boxHeight - head
      return normalized([x1, 0, x1, yh, 0, yh, boxWidth / 2, boxHeight, boxWidth, yh, x2, yh, x2, 0])
    }
    case 'leftRightArrow': {
      const thick = boxHeight * fraction('adj1', 50000)
      const head = Math.min(boxWidth / 2, shortSide * fraction('adj2', 50000))
      const y1 = (boxHeight - thick) / 2
      const y2 = (boxHeight + thick) / 2
      return normalized([
        0,
        boxHeight / 2,
        head,
        0,
        head,
        y1,
        boxWidth - head,
        y1,
        boxWidth - head,
        0,
        boxWidth,
        boxHeight / 2,
        boxWidth - head,
        boxHeight,
        boxWidth - head,
        y2,
        head,
        y2,
        head,
        boxHeight
      ])
    }
    case 'upDownArrow': {
      const thick = boxWidth * fraction('adj1', 50000)
      const head = Math.min(boxHeight / 2, shortSide * fraction('adj2', 50000))
      const x1 = (boxWidth - thick) / 2
      const x2 = (boxWidth + thick) / 2
      return normalized([
        boxWidth / 2,
        0,
        boxWidth,
        head,
        x2,
        head,
        x2,
        boxHeight - head,
        boxWidth,
        boxHeight - head,
        boxWidth / 2,
        boxHeight,
        0,
        boxHeight - head,
        x1,
        boxHeight - head,
        x1,
        head,
        0,
        head
      ])
    }
    case 'upArrowCallout':
      return '0,65 38,65 38,28 27,28 50,1 73,28 62,28 62,65 100,65 100,100 0,100'
    case 'downArrowCallout':
      return '0,0 38,0 38,35 27,35 50,99 73,35 62,35 62,0 100,0 100,100 0,100'
    case 'leftArrowCallout':
      return '35,0 100,0 100,38 72,38 72,27 1,50 72,73 72,62 100,62 100,100 35,100'
    case 'rightArrowCallout':
      return '0,0 65,0 65,38 28,38 28,27 99,50 28,73 28,62 0,62 0,100 0,100'
    case 'chevron': {
      const inset = Math.round(((shortSide * fraction('adj', 50000)) / Math.max(1, boxWidth)) * 10000) / 100
      return `0,0 ${100 - inset},0 100,50 ${100 - inset},100 0,100 ${inset},50`
    }
    case 'homePlate':
      return normalized([
        0,
        0,
        boxWidth - shortSide * fraction('adj', 50000),
        0,
        boxWidth,
        boxHeight / 2,
        boxWidth - shortSide * fraction('adj', 50000),
        boxHeight,
        0,
        boxHeight
      ])
    case 'heart':
      return '50,97 7,55 3,38 10,20 25,8 42,9 50,20 58,9 75,8 90,20 97,38 93,55'
    case 'teardrop':
      return '50,1 86,42 91,65 79,86 50,99 21,86 9,65 14,42'
    case 'cloud':
      return '16,71 8,61 9,47 20,39 20,27 31,17 45,18 54,8 68,10 77,22 90,25 96,37 91,49 97,61 88,73 73,76 64,88 46,87 37,97 23,91'
    case 'snip1Rect':
      return '0,0 82,0 99,18 99,99 0,99'
    case 'snip2SameRect':
      return '17,0 83,0 99,17 99,83 83,99 17,99 0,83 0,17'
    case 'snip2DiagRect':
      return '0,0 83,0 99,17 99,99 17,99 0,83'
    case 'halfFrame':
      return '0,0 99,0 66,33 33,33 33,99 0,99'
    case 'corner':
      return '0,0 50,0 50,50 99,50 99,99 0,99'
    case 'diagStripe':
      return '0,50 50,0 99,0 0,99'
    case 'lightningBolt':
      return '39,0 60,31 51,31 77,56 69,56 100,100 50,67 57,67 25,31 36,31'
    case 'flowChartPreparation':
      return '20,1 80,1 99,50 80,99 20,99 1,50'
    case 'flowChartManualInput':
      return '1,20 99,1 99,99 1,99'
    case 'flowChartManualOperation':
      return '1,1 99,1 80,99 20,99'
    case 'flowChartOffpageConnector':
      return '1,1 99,1 99,80 50,99 1,80'
    case 'flowChartExtract':
      return '50,1 99,99 1,99'
    case 'flowChartMerge':
      return '1,1 99,1 50,99'
    case 'flowChartCollate':
      return '1,1 99,1 50,50 99,99 1,99 50,50'
    case 'gear6':
      return gearPoints(6)
    case 'gear9':
      return gearPoints(9)
    case 'quadArrow':
      return '50,1 61,22 78,22 78,39 99,50 78,61 78,78 61,78 50,99 39,78 22,78 22,61 1,50 22,39 22,22 39,22'
    case 'bentArrow':
      return '1,99 1,18 78,18 78,1 99,50 78,99 78,81 18,81 18,99'
    default:
      return ''
  }
}

function gearPoints(teeth: number) {
  const points: string[] = []
  const inner = 37
  const outer = 50
  for (let index = 0; index < teeth * 2; index++) {
    const radius = index % 2 === 0 ? outer : inner
    const angle = (-90 + (index * 180) / teeth) * (Math.PI / 180)
    points.push(`${Math.round(50 + Math.cos(angle) * radius)},${Math.round(50 + Math.sin(angle) * radius)}`)
  }
  return points.join(' ')
}

function starPoints(count: number, cx: number, cy: number, outer: number, inner: number, start: number) {
  const points: string[] = []
  for (let index = 0; index < count * 2; index++) {
    const radius = index % 2 === 0 ? outer : inner
    const angle = ((start + (index * 180) / count) * Math.PI) / 180
    points.push(
      `${Math.round((cx + Math.cos(angle) * radius) * 100) / 100}`,
      `${Math.round((cy + Math.sin(angle) * radius) * 100) / 100}`
    )
  }
  return points.join(' ')
}

function polygonClipPoints(
  geometry: PptxShape['geometry'],
  adjust?: Record<string, number>,
  boxWidth?: number,
  boxHeight?: number
) {
  return pptxPolygonPoints(geometry, adjust, boxWidth, boxHeight)
    .split(' ')
    .map((point) =>
      point
        .split(',')
        .map((value) => `${value}%`)
        .join(' ')
    )
    .join(', ')
}

function roundRectRadius(shape: PptxShape) {
  const fraction = Math.min(0.5, Math.max(0, (shape.geometryAdjust?.adj ?? 16667) / 100000))
  const radius = Math.min(shape.width, shape.height) * fraction
  const horizontal = (radius / Math.max(1, shape.width)) * 100
  const vertical = (radius / Math.max(1, shape.height)) * 100
  return `${horizontal}% / ${vertical}%`
}

function roundedGeometry(shape: PptxShape) {
  if (
    shape.geometry === 'ellipse' ||
    shape.geometry === 'flowChartTerminator' ||
    shape.geometry === 'flowChartAlternateProcess'
  ) {
    return '50%'
  }
  return shape.geometry === 'roundRect' ? roundRectRadius(shape) : undefined
}

export function pptxTextPadding(shape: PptxShape, presentation: PptxDeck) {
  const toCanvasWidth = (value: number) => `${(value * 100) / presentation.width}cqw`
  return `${toCanvasWidth(shape.margin.top)} ${toCanvasWidth(shape.margin.right)} ${toCanvasWidth(shape.margin.bottom)} ${toCanvasWidth(shape.margin.left)}`
}

export function pptxRunFontSize(run: PptxRun, shape: PptxShape, presentation: PptxDeck) {
  const fontSizePt = run.fontSizePt * shape.fontScale * textFitScale(shape)
  return `${(fontSizePt * 12700 * 100) / presentation.width}cqw`
}

export function pptxRunTextDecoration(run: PptxRun) {
  return [run.underline ? 'underline' : '', run.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none'
}

/** Convert paragraph measurements (stored in points) to the slide's scalable CSS space. */
export function pptxParagraphOffset(points: number, presentation: PptxDeck) {
  return `${(points * 12700 * 100) / presentation.width}cqw`
}

export function pptxParagraphLineHeight(
  paragraph: { lineHeight?: number; lineSpacingPt?: number },
  shape: PptxShape,
  presentation: PptxDeck
) {
  if (paragraph.lineHeight) return String(paragraph.lineHeight)
  if (paragraph.lineSpacingPt) return pptxParagraphOffset(paragraph.lineSpacingPt, presentation)
  return `${Math.max(1, shape.fontSizePt * 1.15 * 12700 * 100) / presentation.width}cqw`
}

export function pptxImagePosition(shape: PptxShape) {
  const crop = shape.imageCrop
  if (!crop) return 'center'
  const visibleWidth = Math.max(0.01, 1 - crop.left - crop.right)
  const visibleHeight = Math.max(0.01, 1 - crop.top - crop.bottom)
  return `${(crop.left / visibleWidth) * 100 + 50}% ${(crop.top / visibleHeight) * 100 + 50}%`
}

export function pptxImageStyle(shape: PptxShape) {
  const crop = shape.imageCrop
  if (!crop) return { left: '0%', top: '0%', width: '100%', height: '100%' }
  const visibleWidth = Math.max(0.01, 1 - crop.left - crop.right)
  const visibleHeight = Math.max(0.01, 1 - crop.top - crop.bottom)
  return {
    left: `${(-crop.left / visibleWidth) * 100}%`,
    top: `${(-crop.top / visibleHeight) * 100}%`,
    width: `${(1 / visibleWidth) * 100}%`,
    height: `${(1 / visibleHeight) * 100}%`
  }
}

export function pptxTransitionClasses(transition: PptxTransition | undefined) {
  return {
    'is-morph': transition === 'morph',
    'is-fade': transition === 'fade' || transition === 'dissolve',
    'is-push': transition === 'push' || transition === 'pull',
    'is-wipe': transition === 'wipe' || transition === 'cover',
    'is-split': transition === 'split',
    'is-circle': transition === 'circle',
    'is-zoom': transition === 'zoom',
    'is-random': transition === 'random'
  }
}

export function pptxAnimationClasses(shape: PptxShape) {
  const effect = shape.animation?.effect
  return {
    'is-anim-appear': effect === 'appear',
    'is-anim-fade': effect === 'fade',
    'is-anim-fly': effect === 'flyIn',
    'is-anim-wipe': effect === 'wipe',
    'is-anim-zoom': effect === 'zoom',
    'is-anim-pulse': effect === 'pulse',
    'is-anim-spin': effect === 'spin',
    'is-anim-disappear': effect === 'disappear',
    'is-anim-fade-out': effect === 'fadeOut'
  }
}

export function pptxAnimationTime(shape: PptxShape, field: 'duration' | 'delay') {
  const milliseconds = field === 'duration' ? shape.animation?.durationMs : shape.animation?.delayMs
  return `${Math.max(field === 'duration' ? 1 : 0, milliseconds ?? 0)}ms`
}
