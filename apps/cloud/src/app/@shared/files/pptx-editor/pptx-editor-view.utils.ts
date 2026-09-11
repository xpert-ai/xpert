import { textFitScale } from './pptx-editor-model.utils'
import type { PptxDeck, PptxRun, PptxShape, PptxTransition } from './pptx-file.utils'

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
    width: `${(shape.width / presentation.width) * 100}%`,
    height: `${(shape.height / presentation.height) * 100}%`,
    background: shape.kind === 'image' ? 'transparent' : shape.fillCss || shape.fill || 'transparent',
    borderColor: shape.stroke || 'transparent',
    borderWidth: polygon || shape.kind === 'line' ? '0' : shape.stroke ? `${Math.max(1, shape.strokeWidth)}px` : '0',
    color: shape.textColor,
    fontSize,
    fontFamily: shape.fontFamily || 'Arial, sans-serif',
    fontWeight: shape.bold ? '700' : '400',
    fontStyle: shape.italic ? 'italic' : 'normal',
    textDecoration:
      [shape.underline ? 'underline' : '', shape.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none',
    textAlign: shape.textAlign,
    whiteSpace: shape.wrap ? 'pre-wrap' : 'pre',
    overflow: 'hidden',
    clipPath: polygon ? `polygon(${polygonClipPoints(shape.geometry)})` : 'none',
    transform: transform || 'none'
  }
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
    background: shape.kind === 'image' ? 'transparent' : shape.fillCss || shape.fill || 'transparent',
    borderWidth: isPolygonGeometry(shape.geometry) || shape.kind === 'line' ? '0' : shape.stroke ? '0.5px' : '0'
  }
}

export function isPolygonGeometry(geometry: PptxShape['geometry']) {
  return new Set([
    'diamond',
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
    'chevron',
    'homePlate',
    'heart',
    'teardrop',
    'cloud'
  ]).has(geometry)
}

/** Normalized points for the common preset geometries. The SVG viewBox stretches these
 * points to the shape box, which also keeps the outline aligned at every zoom level. */
export function pptxPolygonPoints(geometry: PptxShape['geometry']) {
  switch (geometry) {
    case 'diamond':
      return '50,1 99,50 50,99 1,50'
    case 'triangle':
      return '50,1 99,99 1,99'
    case 'rtTriangle':
      return '1,1 99,99 1,99'
    case 'hexagon':
      return '25,1 75,1 99,50 75,99 25,99 1,50'
    case 'parallelogram':
      return '18,1 99,1 82,99 1,99'
    case 'trapezoid':
      return '20,1 80,1 99,99 1,99'
    case 'pentagon':
      return '50,1 99,38 81,99 19,99 1,38'
    case 'octagon':
      return '29,1 71,1 99,29 99,71 71,99 29,99 1,71 1,29'
    case 'plus':
    case 'cross':
      return '35,1 65,1 65,35 99,35 99,65 65,65 65,99 35,99 35,65 1,65 1,35 35,35'
    case 'star5':
      return starPoints(5, 50, 50, 48, 20, -90)
    case 'star6':
      return starPoints(6, 50, 50, 48, 24, -90)
    case 'star8':
      return starPoints(8, 50, 50, 48, 28, -90)
    case 'rightArrow':
      return '1,30 62,30 62,1 99,50 62,99 62,70 1,70'
    case 'leftArrow':
      return '99,30 38,30 38,1 1,50 38,99 38,70 99,70'
    case 'upArrow':
      return '30,99 30,38 1,38 50,1 99,38 70,38 70,99'
    case 'downArrow':
      return '30,1 70,1 70,62 99,62 50,99 1,62 30,62'
    case 'chevron':
      return '1,1 55,1 99,50 55,99 1,99 45,50'
    case 'homePlate':
      return '1,1 65,1 99,50 65,99 1,99 35,50'
    case 'heart':
      return '50,97 7,55 3,38 10,20 25,8 42,9 50,20 58,9 75,8 90,20 97,38 93,55'
    case 'teardrop':
      return '50,1 86,42 91,65 79,86 50,99 21,86 9,65 14,42'
    case 'cloud':
      return '16,71 8,61 9,47 20,39 20,27 31,17 45,18 54,8 68,10 77,22 90,25 96,37 91,49 97,61 88,73 73,76 64,88 46,87 37,97 23,91'
    default:
      return ''
  }
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

function polygonClipPoints(geometry: PptxShape['geometry']) {
  return pptxPolygonPoints(geometry)
    .split(' ')
    .map((point) =>
      point
        .split(',')
        .map((value) => `${value}%`)
        .join(' ')
    )
    .join(', ')
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
