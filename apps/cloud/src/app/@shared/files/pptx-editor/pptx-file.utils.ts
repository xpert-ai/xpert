import type JSZip from 'jszip'
import { readSlideAnimations } from './pptx-animation.utils'
import { renderPptxChart } from './pptx-chart.utils'
import { relationshipPath, syncPresentationSlides } from './pptx-package.utils'
import { createBlankSlideXml, safeXmlId, updateSlideXml } from './pptx-slide-serialization.utils'

export const PPTX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

export function isPptxEditorFile(filePath?: string | null) {
  return (filePath ?? '').split('.').pop()?.toLowerCase() === 'pptx'
}

export function createPptxFile(buffer: ArrayBuffer | Blob, fileName: string, mimeType = PPTX_MIME_TYPE) {
  return new File([buffer], fileName || 'presentation.pptx', { type: mimeType })
}

export type PptxRun = {
  text: string
  fontSizePt: number
  fontFamily: string | null
  color: string
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  superscript: boolean
  subscript: boolean
}

export type PptxParagraph = {
  text: string
  runs: PptxRun[]
  align: 'left' | 'center' | 'right' | 'justify'
  level: number
  lineHeight?: number
  lineSpacingPt?: number
  spaceBeforePt?: number
  spaceAfterPt?: number
  /** Paragraph left margin from a:pPr/@marL, in points. */
  marginLeftPt?: number
  indentPt?: number
  bullet?: string
}

export type PptxTableCell = {
  text: string
  colSpan: number
  rowSpan: number
  merged?: boolean
  fill?: string | null
  textColor?: string
  fontSizePt?: number
  fontFamily?: string | null
  bold?: boolean
  italic?: boolean
  textAlign?: PptxParagraph['align']
  verticalAlign?: 'top' | 'middle' | 'bottom'
  borderColor?: string | null
  borderWidth?: number
  borderTopColor?: string | null
  borderTopWidth?: number
  borderRightColor?: string | null
  borderRightWidth?: number
  borderBottomColor?: string | null
  borderBottomWidth?: number
  borderLeftColor?: string | null
  borderLeftWidth?: number
  /** Cell text insets from a:tcPr/@marL/@marR/@marT/@marB, in EMUs. */
  margin?: { left: number; right: number; top: number; bottom: number }
}

export type PptxAnimationEffect =
  | 'appear'
  | 'fade'
  | 'flyIn'
  | 'wipe'
  | 'zoom'
  | 'pulse'
  | 'spin'
  | 'disappear'
  | 'fadeOut'
export type PptxAnimationTrigger = 'onClick' | 'withPrev' | 'afterPrev'
export type PptxShapeAnimation = {
  effect: PptxAnimationEffect
  trigger: PptxAnimationTrigger
  durationMs: number
  delayMs: number
}
export type PptxTransition =
  | 'none'
  | 'morph'
  | 'fade'
  | 'push'
  | 'wipe'
  | 'split'
  | 'circle'
  | 'cover'
  | 'pull'
  | 'dissolve'
  | 'zoom'
  | 'random'

export type PptxLineEnd = 'none' | 'triangle' | 'stealth' | 'diamond' | 'oval' | 'open'

export type PptxShape = {
  id: string
  /** Original OOXML cNvPr id. Render ids are made unique across master/layout/slide layers. */
  sourceId?: string
  name: string
  kind: 'shape' | 'image' | 'line' | 'table'
  text: string
  paragraphs: PptxParagraph[]
  x: number
  y: number
  width: number
  height: number
  rotation: number
  flipH: boolean
  flipV: boolean
  fill: string | null
  stroke: string | null
  strokeWidth: number
  /** OOXML preset geometry. Unknown presets are kept so the source shape can still be
   * rendered with a useful approximation and serialized without being rewritten. */
  geometry: 'rect' | 'roundRect' | 'ellipse' | 'diamond' | 'triangle' | 'hexagon' | 'none' | (string & {})
  /** Named OOXML adjustment values from a preset geometry's avLst. */
  geometryAdjust?: Record<string, number>
  /** Connector endpoint decorations from a:headEnd/a:tailEnd. */
  lineHeadEnd?: PptxLineEnd
  lineTailEnd?: PptxLineEnd
  /** OOXML preset dash name for connector and shape outlines. */
  lineDash?: string
  imageSrc: string | null
  imagePath?: string
  imageRelId?: string
  imageCrop: { left: number; top: number; right: number; bottom: number } | null
  /** Alpha applied by a:blip/a:alphaModFix to a picture. */
  opacity?: number
  /** CSS representation for read-only gradient/pattern fills. `fill` remains the first
   * solid color used by the edit serializer when a user changes the fill. */
  fillCss?: string
  editorKind?: 'ink'
  animation?: PptxShapeAnimation | null
  textColor: string
  fontSizePt: number
  fontScale: number
  fontFamily: string | null
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  superscript: boolean
  subscript: boolean
  textAlign: 'left' | 'center' | 'right' | 'justify'
  verticalAlign: 'top' | 'middle' | 'bottom'
  wrap: boolean
  autoFit: 'none' | 'shrink' | 'resize'
  margin: { left: number; right: number; top: number; bottom: number }
  editable: boolean
  table: {
    columns: number[]
    rows: PptxTableCell[][]
    rowHeights?: number[]
    rtl?: boolean
  } | null
  /** Text as it was read from the package. Used to distinguish formatting-only edits. */
  sourceText?: string
  /** Text properties were changed through the ribbon. */
  formatDirty?: boolean
  /** Shape fill, outline, or geometry was changed through the ribbon. */
  shapeStyleDirty?: boolean
  /** Existing table cell content was edited. */
  tableDirty?: boolean
  animationDirty?: boolean
  /** Shape was inserted by the editor and is not present in the source slide XML. */
  created?: boolean
  /** Keep deleted source shapes in the model so savePptx can remove them from XML. */
  deleted?: boolean
}

export type PptxSlide = {
  path: string
  xml: string
  shapes: PptxShape[]
  background: string | null
  /** CSS paint for an untouched gradient or pattern slide background. */
  backgroundCss?: string
  /** New slides are serialized together with their presentation relationships. */
  created?: boolean
  sourcePath?: string
  transition?: PptxTransition
  transitionDirty?: boolean
  hidden?: boolean
  hiddenDirty?: boolean
  animationDirty?: boolean
  backgroundDirty?: boolean
}
export type PptxDeck = { width: number; height: number; slides: PptxSlide[] }

const DEFAULT_SLIDE_WIDTH = 12192000
const DEFAULT_SLIDE_HEIGHT = 6858000
const EMU_PER_PX = 9525
const DEFAULT_FONT_SIZE = 18
const DEFAULT_TEXT_COLOR = rgbColor(31, 41, 55)
const DEFAULT_THEME: Record<string, string> = {
  dk1: rgbColor(0, 0, 0),
  lt1: rgbColor(255, 255, 255),
  dk2: rgbColor(31, 41, 55),
  lt2: rgbColor(243, 244, 246),
  accent1: rgbColor(68, 114, 196),
  accent2: rgbColor(237, 125, 49),
  accent3: rgbColor(165, 165, 165),
  accent4: rgbColor(255, 192, 0),
  accent5: rgbColor(91, 155, 213),
  accent6: rgbColor(112, 173, 71),
  hlink: rgbColor(5, 99, 193),
  folHlink: rgbColor(149, 79, 114)
}

function rgbColor(red: number, green: number, blue: number) {
  return `#${[red, green, blue].map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0')).join('')}`
}

type XmlElement = Element
type ThemeColors = Record<string, string>
type RelationshipMap = Map<string, string>
type PlaceholderInfo = { type: string; idx: string; node: XmlElement }
type ParentTransform = { x: number; y: number; scaleX: number; scaleY: number }
type Transform = {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  flipH: boolean
  flipV: boolean
}

export async function parsePptx(buffer: ArrayBuffer): Promise<PptxDeck> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buffer)
  const presentationXml = await requiredXml(zip, 'ppt/presentation.xml')
  const presentation = parseXml(presentationXml)
  const presentationRels = parseRelationships(
    await requiredXml(zip, 'ppt/_rels/presentation.xml.rels'),
    'ppt/presentation.xml'
  )
  const theme = await loadTheme(zip, presentationRels)
  const width = readNumber(presentation, 'sldSz', 'cx', DEFAULT_SLIDE_WIDTH)
  const height = readNumber(presentation, 'sldSz', 'cy', DEFAULT_SLIDE_HEIGHT)
  const slides: PptxSlide[] = []
  const imageCache = new Map<string, string>()

  for (const slideRef of directChildren(directChild(presentation, 'sldIdLst'), 'sldId')) {
    const relationId = attr(slideRef, 'r:id')
    const path = relationId ? presentationRels.get(relationId) : null
    if (!path || !zip.file(path)) continue
    const xml = await requiredXml(zip, path)
    const slide = parseXml(xml)
    const animations = readSlideAnimations(xml)
    const relsPath = `${path.split('/').slice(0, -1).join('/')}/_rels/${path.split('/').pop()}.rels`
    const slideRels = zip.file(relsPath)
      ? parseRelationships(await requiredXml(zip, relsPath), path)
      : new Map<string, string>()
    const layoutPath = findRelationship(slideRels, 'slideLayout')
    const layoutXml = layoutPath && zip.file(layoutPath) ? await requiredXml(zip, layoutPath) : null
    const layout = layoutXml ? parseXml(layoutXml) : null
    const layoutRelsPath = layoutPath
      ? `${layoutPath.split('/').slice(0, -1).join('/')}/_rels/${layoutPath.split('/').pop()}.rels`
      : null
    const layoutRels =
      layoutRelsPath && zip.file(layoutRelsPath)
        ? parseRelationships(await requiredXml(zip, layoutRelsPath), layoutPath as string)
        : new Map<string, string>()
    const masterPath = layout ? findRelationship(layoutRels, 'slideMaster') : null
    const masterXml = masterPath && zip.file(masterPath) ? await requiredXml(zip, masterPath) : null
    const master = masterXml ? parseXml(masterXml) : null
    const masterRelsPath = masterPath
      ? `${masterPath.split('/').slice(0, -1).join('/')}/_rels/${masterPath.split('/').pop()}.rels`
      : null
    const masterRels =
      masterRelsPath && zip.file(masterRelsPath)
        ? parseRelationships(await requiredXml(zip, masterRelsPath), masterPath as string)
        : new Map<string, string>()
    const slideTheme = master ? await loadTheme(zip, masterRels, theme) : theme
    const placeholders = collectPlaceholders(layout, master)
    const ownTree = directChild(directChild(slide, 'cSld'), 'spTree')
    const shapes: PptxShape[] = []

    for (const source of [master, layout]) {
      const tree = directChild(directChild(source, 'cSld'), 'spTree')
      for (const node of renderChildren(tree)) {
        if (placeholderOf(node)) continue
        shapes.push(
          ...(await parseNode(node, {
            zip,
            theme: slideTheme,
            relationships: source === master ? masterRels : layoutRels,
            imageCache,
            fallback: null,
            editable: false
          }))
        )
      }
    }
    for (const node of renderChildren(ownTree)) {
      const ph = placeholderOf(node)
      const fallback = ph ? (placeholders.get(placeholderKey(ph)) ?? placeholders.get(`type:${ph.type}`)) : null
      shapes.push(
        ...(await parseNode(node, {
          zip,
          theme: slideTheme,
          relationships: slideRels,
          imageCache,
          fallback,
          editable: true
        }))
      )
    }

    if (!shapes.length) throw new Error('This presentation does not contain any renderable slides.')
    const usedIds = new Set<string>()
    for (const shape of shapes) {
      const sourceId = shape.sourceId ?? shape.id
      let renderId = sourceId
      let suffix = 2
      while (usedIds.has(renderId)) renderId = `${sourceId}-${suffix++}`
      shape.sourceId = sourceId
      shape.id = renderId
      if (shape.editable) shape.animation = animations.get(sourceId) ?? null
      usedIds.add(renderId)
    }
    slides.push({
      path,
      xml,
      shapes: shapes.filter((shape) =>
        shape.kind === 'line' ? shape.width > 0 || shape.height > 0 : shape.width > 0 && shape.height > 0
      ),
      background:
        readBackground(slide, slideTheme) ?? readBackground(layout, slideTheme) ?? readBackground(master, slideTheme),
      backgroundCss:
        readBackgroundCss(slide, slideTheme) ??
        readBackgroundCss(layout, slideTheme) ??
        readBackgroundCss(master, slideTheme),
      transition: transitionOf(slide),
      hidden: attr(slide, 'show') === '0'
    })
  }
  if (!slides.length) throw new Error('This presentation does not contain any slides.')
  return { width, height, slides }
}

export async function savePptx(deck: PptxDeck, sourceBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(sourceBuffer)
  for (const slide of deck.slides) {
    if (slide.created) await copySlideRelationships(zip, slide.sourcePath, slide.path, deck.slides)
    await prepareCreatedImages(zip, slide)
    if (!slide.created) {
      zip.file(
        slide.path,
        updateSlideXml(
          slide.xml,
          slide.shapes,
          slide.transition,
          slide.transitionDirty,
          slide.background,
          slide.backgroundDirty,
          slide.hidden,
          slide.hiddenDirty,
          slide.animationDirty
        )
      )
      continue
    }
    const sourceXml = slide.sourcePath ? await zip.file(slide.sourcePath)?.async('text') : null
    zip.file(
      slide.path,
      updateSlideXml(
        sourceXml ?? createBlankSlideXml(),
        slide.shapes,
        slide.transition,
        slide.transitionDirty,
        slide.background,
        slide.backgroundDirty,
        slide.hidden,
        slide.hiddenDirty,
        slide.animationDirty
      )
    )
  }
  await syncPresentationSlides(zip, deck.slides, deck.width, deck.height)
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}

async function prepareCreatedImages(zip: JSZip, slide: PptxSlide) {
  const imageShapes = slide.shapes.filter(
    (shape) => shape.created && !shape.deleted && shape.kind === 'image' && shape.imageSrc?.startsWith('data:')
  )
  if (!imageShapes.length) return
  const relPath = relationshipPath(slide.path)
  let relXml = zip.file(relPath)
    ? await zip.file(relPath)!.async('text')
    : '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
  let next = Math.max(0, ...[...relXml.matchAll(/Id="rId(\d+)"/gi)].map((m) => Number(m[1]))) + 1
  for (const shape of imageShapes) {
    const match = shape.imageSrc!.match(/^data:([^;,]+);base64,(.+)$/)
    if (!match) continue
    const ext = match[1].includes('svg')
      ? 'svg'
      : match[1].includes('webp')
        ? 'webp'
        : match[1].includes('jpeg') || match[1].includes('jpg')
          ? 'jpg'
          : 'png'
    const path = `ppt/media/editor-${safeXmlId(shape.id)}.${ext}`
    const relId = `rId${next++}`
    zip.file(path, match[2], { base64: true })
    shape.imagePath = path
    shape.imageRelId = relId
    relXml = relXml.replace(
      /<\/Relationships>/i,
      `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/editor-${safeXmlId(shape.id)}.${ext}"/></Relationships>`
    )
  }
  zip.file(relPath, relXml)
  const contentTypes = zip.file('[Content_Types].xml')
  if (contentTypes) {
    let xml = await contentTypes.async('text')
    if (!/<Default[^>]+Extension="png"/i.test(xml))
      xml = xml.replace(/<\/Types>/i, '<Default Extension="png" ContentType="image/png"/></Types>')
    if (!/<Default[^>]+Extension="jpg"/i.test(xml))
      xml = xml.replace(/<\/Types>/i, '<Default Extension="jpg" ContentType="image/jpeg"/></Types>')
    if (!/<Default[^>]+Extension="svg"/i.test(xml))
      xml = xml.replace(/<\/Types>/i, '<Default Extension="svg" ContentType="image/svg+xml"/></Types>')
    if (!/<Default[^>]+Extension="webp"/i.test(xml))
      xml = xml.replace(/<\/Types>/i, '<Default Extension="webp" ContentType="image/webp"/></Types>')
    zip.file('[Content_Types].xml', xml)
  }
}

async function copySlideRelationships(
  zip: JSZip,
  sourcePath: string | undefined,
  targetPath: string,
  slides: PptxSlide[]
) {
  const source = sourcePath ?? slides.find((slide) => !slide.created)?.path
  if (!source) return
  const sourceRels = relationshipPath(source)
  const targetRels = relationshipPath(targetPath)
  const relFile = zip.file(sourceRels)
  if (relFile) zip.file(targetRels, await relFile.async('text'))
}

async function parseNode(
  node: XmlElement,
  context: {
    zip: JSZip
    theme: ThemeColors
    relationships: RelationshipMap
    imageCache: Map<string, string>
    fallback: PlaceholderInfo | null
    editable: boolean
  },
  parent: ParentTransform = { x: 0, y: 0, scaleX: 1, scaleY: 1 }
): Promise<PptxShape[]> {
  const kind = localName(node)
  if (kind === 'AlternateContent') {
    const choice = directChild(node, 'Choice') ?? directChild(node, 'Fallback')
    const result: PptxShape[] = []
    for (const child of directChildren(choice)) result.push(...(await parseNode(child, context, parent)))
    return result
  }
  if (kind === 'grpSp') {
    const group = readGroupTransform(directChild(directChild(node, 'grpSpPr'), 'xfrm'))
    const nextParent = {
      x: parent.x + (group.x - group.childX) * parent.scaleX,
      y: parent.y + (group.y - group.childY) * parent.scaleY,
      scaleX: parent.scaleX * group.scaleX,
      scaleY: parent.scaleY * group.scaleY
    }
    const result: PptxShape[] = []
    for (const child of renderChildren(node)) {
      if (['nvGrpSpPr', 'grpSpPr'].includes(localName(child))) continue
      result.push(...(await parseNode(child, context, nextParent)))
    }
    return result
  }
  if (!['sp', 'pic', 'cxnSp', 'graphicFrame'].includes(kind)) return []
  const fallbackNode = context.fallback?.node ?? null
  const xfrm =
    directChild(directChild(node, kind === 'pic' ? 'spPr' : kind === 'graphicFrame' ? null : 'spPr'), 'xfrm') ??
    (kind === 'graphicFrame' ? directChild(node, 'xfrm') : null) ??
    (fallbackNode ? directChild(directChild(fallbackNode, 'spPr'), 'xfrm') : null)
  const rect = applyParent(readTransform(xfrm), parent)
  const id = shapeIdOf(node) ?? `shape-${directChildren(node).length}`
  const nonVisualProperties = directChild(
    directChild(
      node,
      kind === 'pic'
        ? 'nvPicPr'
        : kind === 'graphicFrame'
          ? 'nvGraphicFramePr'
          : kind === 'cxnSp'
            ? 'nvCxnSpPr'
            : 'nvSpPr'
    ),
    'cNvPr'
  )
  const name = attr(nonVisualProperties, 'name') ?? ''
  const shape = baseShape(id, name, rect, context.editable)
  if (attr(nonVisualProperties, 'descr') === 'xpert:ink') shape.editorKind = 'ink'
  if (kind === 'graphicFrame') {
    const table = parseTable(directChild(directChild(node, 'graphic'), 'graphicData'), context.theme)
    if (table) {
      const gridWidth = table.columns.reduce((sum, width) => sum + Math.max(0, width), 0) * parent.scaleX
      const gridHeight = (table.rowHeights ?? []).reduce((sum, height) => sum + Math.max(0, height), 0) * parent.scaleY
      return [
        {
          ...shape,
          kind: 'table',
          table,
          geometry: 'none',
          width: gridWidth > 0 ? gridWidth : shape.width,
          height: gridHeight > 0 ? gridHeight : shape.height
        }
      ]
    }
    const chartNode = firstDescendant(node, 'chart')
    const chartRelation = attr(chartNode, 'r:id')
    const chartPath = chartRelation ? context.relationships.get(chartRelation) : null
    const chartSrc = chartPath ? await renderPptxChart(context.zip, chartPath, context.theme) : null
    return chartSrc
      ? [
          {
            ...shape,
            kind: 'image',
            imageSrc: chartSrc,
            imageCrop: null,
            fill: null,
            stroke: null,
            paragraphs: [],
            text: ''
          }
        ]
      : []
  }
  const properties = directChild(node, 'spPr') ?? (fallbackNode ? directChild(fallbackNode, 'spPr') : null)
  const style = directChild(node, 'style') ?? (fallbackNode ? directChild(fallbackNode, 'style') : null)
  shape.kind = kind === 'pic' ? 'image' : kind === 'cxnSp' ? 'line' : 'shape'
  const parsedGeometry = geometryOf(properties)
  shape.geometry = kind === 'cxnSp' && parsedGeometry === 'rect' ? 'line' : parsedGeometry
  shape.geometryAdjust = readGeometryAdjust(properties)
  shape.fill = readFill(properties, node, context.theme)
  shape.fillCss = readFillCss(properties, node, context.theme)
  shape.stroke = readStroke(properties, context.theme)
  // Keep stroke widths in CSS pixels.  A few earlier editor builds wrote the
  // pixel value as if it were EMUs; clamping protects those files from
  // producing multi-thousand-pixel borders when reopened.
  shape.strokeWidth = Math.min(24, readAttrNumber(directChild(properties, 'ln'), 'w', 0) / EMU_PER_PX)
  if (shape.kind === 'line') {
    const line = directChild(properties, 'ln')
    shape.lineHeadEnd = readLineEnd(directChild(line, 'headEnd'))
    shape.lineTailEnd = readLineEnd(directChild(line, 'tailEnd'))
    shape.lineDash = attr(directChild(line, 'prstDash'), 'val') ?? undefined
  }
  if (kind === 'pic') {
    const blipFill = directChild(node, 'blipFill')
    const blip = directChild(blipFill, 'blip')
    const embed = imageEmbedId(blip)
    const imagePath = embed ? context.relationships.get(embed) : null
    shape.imageSrc = imagePath ? await loadImage(context.zip, imagePath, context.imageCache) : null
    shape.imageCrop = readImageCrop(blipFill)
    shape.opacity = readImageOpacity(blip)
  } else {
    const blipFill = directChild(properties, 'blipFill')
    const blip = directChild(blipFill, 'blip')
    const embed = imageEmbedId(blip)
    const imagePath = embed ? context.relationships.get(embed) : null
    if (imagePath) {
      shape.kind = 'image'
      shape.imageSrc = await loadImage(context.zip, imagePath, context.imageCache)
      shape.imageCrop = readImageCrop(blipFill)
      shape.opacity = readImageOpacity(blip)
    }
  }
  const textBody = directChild(node, 'txBody')
  if (textBody)
    Object.assign(
      shape,
      readText(
        textBody,
        context.theme,
        fallbackNode ? directChild(fallbackNode, 'txBody') : null,
        resolveColor(directChild(style, 'fontRef'), context.theme) ?? DEFAULT_TEXT_COLOR
      )
    )
  return [shape]
}

function baseShape(id: string, name: string, rect: Transform, editable: boolean): PptxShape {
  return {
    id,
    sourceId: id,
    name,
    kind: 'shape',
    text: '',
    paragraphs: [],
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    rotation: rect.rotation,
    flipH: rect.flipH,
    flipV: rect.flipV,
    fill: null,
    stroke: null,
    strokeWidth: 0,
    geometry: 'rect',
    imageSrc: null,
    imageCrop: null,
    textColor: DEFAULT_TEXT_COLOR,
    fontSizePt: DEFAULT_FONT_SIZE,
    fontScale: 1,
    fontFamily: null,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    superscript: false,
    subscript: false,
    textAlign: 'left',
    verticalAlign: 'top',
    wrap: true,
    autoFit: 'none',
    margin: { left: 91440, right: 91440, top: 45720, bottom: 45720 },
    editable,
    table: null,
    sourceText: '',
    formatDirty: false
  }
}

function readText(body: XmlElement, theme: ThemeColors, fallbackBody: XmlElement | null, defaultColor: string) {
  const bodyPr = directChild(body, 'bodyPr') ?? (fallbackBody ? directChild(fallbackBody, 'bodyPr') : null)
  const defaultRun = firstDescendant(directChild(body, 'lstStyle'), 'defRPr')
  const fallbackRun = firstDescendant(fallbackBody, 'defRPr')
  const paragraphs: PptxParagraph[] = []
  for (const paragraph of directChildren(body, 'p')) {
    const pPr = directChild(paragraph, 'pPr')
    const level = Number(attr(pPr, 'lvl') ?? 0)
    const stylePPr = paragraphProperties(body, fallbackBody, level)
    const paragraphRun = directChild(pPr, 'defRPr') ?? directChild(stylePPr, 'defRPr') ?? defaultRun ?? fallbackRun
    const runs: PptxRun[] = []
    for (const child of directChildren(paragraph)) {
      if (localName(child) === 'br') {
        runs.push(readRun('\n', directChild(child, 'rPr'), paragraphRun, theme, defaultColor))
        continue
      }
      if (localName(child) === 'tab') {
        runs.push(readRun('\t', directChild(child, 'rPr'), paragraphRun, theme, defaultColor))
        continue
      }
      if (!['r', 'fld'].includes(localName(child))) continue
      const text = textOf(directChild(child, 't'))
      if (!text) continue
      runs.push(readRun(text, directChild(child, 'rPr'), paragraphRun, theme, defaultColor))
    }
    const lineSpacing = directChild(pPr, 'lnSpc') ?? directChild(stylePPr, 'lnSpc')
    const spacingBefore = directChild(pPr, 'spcBef') ?? directChild(stylePPr, 'spcBef')
    const spacingAfter = directChild(pPr, 'spcAft') ?? directChild(stylePPr, 'spcAft')
    const percentage = readAttrNumber(directChild(lineSpacing, 'spcPct'), 'val', 0)
    const spacingPoints = readAttrNumber(directChild(lineSpacing, 'spcPts'), 'val', 0) / 100
    const hasExplicitNoBullet = !!directChild(pPr, 'buNone')
    const bulletNode = directChild(pPr, 'buChar') ?? directChild(stylePPr, 'buChar')
    const bullet = hasExplicitNoBullet
      ? undefined
      : (attr(bulletNode, 'char') ??
        (directChild(pPr, 'buAutoNum') || directChild(stylePPr, 'buAutoNum') ? '•' : undefined))
    paragraphs.push({
      text: runs.map((run) => run.text).join(''),
      runs,
      align: paragraphAlign(attr(pPr, 'algn') ?? attr(stylePPr, 'algn')),
      level,
      lineHeight: percentage > 0 ? percentage / 100000 : undefined,
      lineSpacingPt: spacingPoints > 0 ? spacingPoints : undefined,
      spaceBeforePt: readAttrNumber(directChild(spacingBefore, 'spcPts'), 'val', 0) / 100,
      spaceAfterPt: readAttrNumber(directChild(spacingAfter, 'spcPts'), 'val', 0) / 100,
      marginLeftPt: readAttrNumber(pPr, 'marL', readAttrNumber(stylePPr, 'marL', 0)) / 12700,
      indentPt: readAttrNumber(pPr, 'indent', readAttrNumber(stylePPr, 'indent', 0)) / 12700,
      bullet
    })
  }
  const firstRun = paragraphs.flatMap((paragraph) => paragraph.runs)[0]
  const anchor = attr(bodyPr, 'anchor')
  const normAutofit = directChild(bodyPr, 'normAutofit')
  const autoFit = normAutofit ? 'shrink' : directChild(bodyPr, 'spAutoFit') ? 'resize' : 'none'
  const fontScale = Math.min(1, Math.max(0.1, readAttrNumber(normAutofit, 'fontScale', 100000) / 100000))
  return {
    text: paragraphs.map((paragraph) => paragraph.text).join('\n'),
    paragraphs,
    textColor: firstRun?.color ?? defaultColor,
    fontSizePt: firstRun?.fontSizePt ?? DEFAULT_FONT_SIZE,
    fontScale,
    fontFamily: firstRun?.fontFamily ?? null,
    bold: firstRun?.bold ?? false,
    italic: firstRun?.italic ?? false,
    underline: firstRun?.underline ?? false,
    strike: firstRun?.strike ?? false,
    superscript: firstRun?.superscript ?? false,
    subscript: firstRun?.subscript ?? false,
    textAlign: paragraphs[0]?.align ?? 'left',
    verticalAlign: anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top',
    wrap: attr(bodyPr, 'wrap') !== 'none',
    autoFit,
    margin: {
      left: readAttrNumber(bodyPr, 'lIns', 91440),
      right: readAttrNumber(bodyPr, 'rIns', 91440),
      top: readAttrNumber(bodyPr, 'tIns', 45720),
      bottom: readAttrNumber(bodyPr, 'bIns', 45720)
    },
    sourceText: paragraphs.map((paragraph) => paragraph.text).join('\n')
  }
}

function paragraphProperties(body: XmlElement, fallbackBody: XmlElement | null, level: number) {
  const levelName = `lvl${Math.min(9, Math.max(1, level + 1))}pPr`
  const find = (source: XmlElement | null) => directChild(directChild(source, 'lstStyle'), levelName)
  return find(body) ?? find(fallbackBody)
}

function readRun(
  text: string,
  props: XmlElement | null,
  fallback: XmlElement | null,
  theme: ThemeColors,
  defaultColor: string
): PptxRun {
  const latin =
    directChild(props, 'latin') ??
    directChild(props, 'ea') ??
    directChild(props, 'cs') ??
    directChild(fallback, 'latin') ??
    directChild(fallback, 'ea') ??
    directChild(fallback, 'cs')
  return {
    text,
    fontSizePt: readAttrNumber(props, 'sz', readAttrNumber(fallback, 'sz', DEFAULT_FONT_SIZE * 100)) / 100,
    fontFamily: attr(latin, 'typeface') || null,
    color:
      resolveColor(directChild(props, 'solidFill'), theme) ??
      resolveColor(directChild(fallback, 'solidFill'), theme) ??
      defaultColor,
    bold: booleanAttribute(props, fallback, 'b'),
    italic: booleanAttribute(props, fallback, 'i'),
    underline: (attr(props, 'u') ?? attr(fallback, 'u') ?? 'none') !== 'none',
    strike: booleanAttribute(props, fallback, 'strike'),
    superscript: Number(attr(props, 'baseline') ?? attr(fallback, 'baseline') ?? 0) > 0,
    subscript: Number(attr(props, 'baseline') ?? attr(fallback, 'baseline') ?? 0) < 0
  }
}

function booleanAttribute(node: XmlElement | null, fallback: XmlElement | null, name: string) {
  const value = attr(node, name) ?? attr(fallback, name)
  return value === '1' || value === 'true'
}

function parseTable(graphicData: XmlElement | null, theme: ThemeColors): PptxShape['table'] {
  const table = directChild(graphicData, 'tbl')
  if (!table) return null
  const columns = directChildren(directChild(table, 'tblGrid'), 'gridCol').map((column) =>
    readAttrNumber(column, 'w', 0)
  )
  const rowNodes = directChildren(table, 'tr')
  const rows: PptxTableCell[][] = []
  for (const row of rowNodes)
    rows.push(
      directChildren(row, 'tc').map((cell) => {
        const body = directChild(cell, 'txBody')
        const text = body ? readText(body, theme, null, DEFAULT_TEXT_COLOR) : null
        const cellProperties = directChild(cell, 'tcPr')
        const cellAnchor = attr(cellProperties, 'anchor')
        const borderFor = (side: 'T' | 'R' | 'B' | 'L') => directChild(cellProperties, `ln${side}`)
        const border = borderFor('T') ?? borderFor('B')
        const borderColor = (side: 'T' | 'R' | 'B' | 'L') =>
          resolveColor(directChild(borderFor(side), 'solidFill'), theme)
        const borderWidth = (side: 'T' | 'R' | 'B' | 'L') => readAttrNumber(borderFor(side), 'w', 0) / EMU_PER_PX
        return {
          text: text?.text ?? '',
          colSpan: Number(attr(cell, 'gridSpan') ?? 1),
          rowSpan: Number(attr(cell, 'rowSpan') ?? 1),
          merged: attr(cell, 'hMerge') === '1' || attr(cell, 'vMerge') === '1',
          fill: resolveColor(directChild(cellProperties, 'solidFill'), theme),
          textColor: text?.textColor ?? DEFAULT_TEXT_COLOR,
          fontSizePt: text?.fontSizePt ?? DEFAULT_FONT_SIZE,
          fontFamily: text?.fontFamily ?? null,
          bold: text?.bold ?? false,
          italic: text?.italic ?? false,
          textAlign: text?.textAlign ?? 'left',
          verticalAlign: (cellAnchor === 'ctr'
            ? 'middle'
            : cellAnchor === 'b'
              ? 'bottom'
              : cellAnchor === 't'
                ? 'top'
                : (text?.verticalAlign ?? 'middle')) as 'top' | 'middle' | 'bottom',
          borderColor: resolveColor(directChild(border, 'solidFill'), theme),
          borderWidth: readAttrNumber(border, 'w', 0) / EMU_PER_PX,
          borderTopColor: borderColor('T'),
          borderTopWidth: borderWidth('T'),
          borderRightColor: borderColor('R'),
          borderRightWidth: borderWidth('R'),
          borderBottomColor: borderColor('B'),
          borderBottomWidth: borderWidth('B'),
          borderLeftColor: borderColor('L'),
          borderLeftWidth: borderWidth('L'),
          margin: {
            left: readAttrNumber(cellProperties, 'marL', 91440),
            right: readAttrNumber(cellProperties, 'marR', 91440),
            top: readAttrNumber(cellProperties, 'marT', 45720),
            bottom: readAttrNumber(cellProperties, 'marB', 45720)
          }
        }
      })
    )
  // A number of producers omit tcPr borders and rely on the table style's grid
  // defaults. Keep a visible grid in that case so the table does not disappear
  // while preserving explicit noFill/no-border cells.
  const hasBorderDefinition = rowNodes.some((row) =>
    directChildren(row, 'tc').some((cell) => {
      const properties = directChild(cell, 'tcPr')
      return (['T', 'R', 'B', 'L'] as const).some((side) => !!directChild(properties, `ln${side}`))
    })
  )
  const hasExplicitBorder = rows.some((row) =>
    row.some((cell) =>
      [cell.borderTopWidth, cell.borderRightWidth, cell.borderBottomWidth, cell.borderLeftWidth].some(
        (width) => (width ?? 0) > 0
      )
    )
  )
  if (!hasBorderDefinition && !hasExplicitBorder) {
    const gridColor = theme.dk2 ?? theme.tx1 ?? DEFAULT_TEXT_COLOR
    for (const row of rows)
      for (const cell of row) {
        cell.borderColor ??= gridColor
        cell.borderWidth ??= 1
        cell.borderTopColor ??= gridColor
        cell.borderRightColor ??= gridColor
        cell.borderBottomColor ??= gridColor
        cell.borderLeftColor ??= gridColor
        cell.borderTopWidth ??= 1
        cell.borderRightWidth ??= 1
        cell.borderBottomWidth ??= 1
        cell.borderLeftWidth ??= 1
      }
  }
  return {
    columns,
    rows,
    rowHeights: rowNodes.map((row) => readAttrNumber(row, 'h', 0)),
    rtl: attr(directChild(table, 'tblPr'), 'rtl') === '1' || attr(directChild(table, 'tblPr'), 'rtl') === 'true'
  }
}

function collectPlaceholders(layout: XmlElement | null, master: XmlElement | null) {
  const result = new Map<string, PlaceholderInfo>()
  for (const source of [master, layout]) {
    const tree = directChild(directChild(source, 'cSld'), 'spTree')
    for (const node of directChildren(tree)) {
      const ph = placeholderOf(node)
      if (!ph) continue
      const info = { ...ph, node }
      result.set(placeholderKey(ph), info)
      if (!result.has(`type:${ph.type}`)) result.set(`type:${ph.type}`, info)
    }
  }
  return result
}

function placeholderOf(node: XmlElement | null): { type: string; idx: string } | null {
  const ph = firstDescendant(directChild(node, 'nvPr'), 'ph') ?? firstDescendant(node, 'ph')
  return ph ? { type: attr(ph, 'type') ?? 'body', idx: attr(ph, 'idx') ?? '0' } : null
}

function placeholderKey(ph: { type: string; idx: string }) {
  return `${ph.type}:${ph.idx}`
}

function readBackground(source: XmlElement | null, theme: ThemeColors): string | null {
  const cSld = directChild(source, 'cSld')
  return resolveColor(directChild(directChild(directChild(cSld, 'bg'), 'bgPr'), 'solidFill'), theme)
}

function readBackgroundCss(source: XmlElement | null, theme: ThemeColors): string | undefined {
  const cSld = directChild(source, 'cSld')
  const bg = directChild(cSld, 'bg')
  const bgPr = directChild(bg, 'bgPr')
  if (bgPr) return readFillCss(bgPr, source ?? bgPr, theme)
  return resolveColor(directChild(bg, 'bgRef'), theme) ?? undefined
}

function transitionOf(slide: XmlElement) {
  const transition = firstDescendant(slide, 'transition')
  if (!transition) return 'none' as const
  if (firstDescendant(transition, 'morph')) return 'morph' as const
  const kinds = ['fade', 'push', 'wipe', 'split', 'circle', 'cover', 'pull', 'dissolve', 'zoom', 'random'] as const
  return kinds.find((kind) => directChild(transition, kind)) ?? 'none'
}

function readFill(properties: XmlElement | null, node: XmlElement, theme: ThemeColors) {
  if (directChild(properties, 'noFill')) return null
  const explicit = resolveColor(directChild(properties, 'solidFill'), theme)
  if (explicit) return explicit
  const gradient = directChild(properties, 'gradFill')
  const firstStop = directChildren(directChild(gradient, 'gsLst'), 'gs')
    .map((stop) => resolveColor(stop, theme))
    .find((color): color is string => !!color)
  if (firstStop) return firstStop
  const pattern = directChild(properties, 'pattFill')
  const patternColor = resolveColor(directChild(pattern, 'fgClr'), theme)
  if (patternColor) return patternColor
  const fillRef = directChild(directChild(node, 'style'), 'fillRef')
  return Number(attr(fillRef, 'idx') ?? 0) > 0 ? resolveColor(fillRef, theme) : null
}

/**
 * Convert the common OOXML fill forms to a CSS paint. Keeping this separate from
 * `fill` lets the editor preserve the original XML while still showing gradients,
 * alpha and patterns accurately in the browser.
 */
function readFillCss(properties: XmlElement | null, node: XmlElement, theme: ThemeColors): string | undefined {
  if (directChild(properties, 'noFill')) return undefined
  const solid = directChild(properties, 'solidFill')
  const solidColor = resolveColor(solid, theme)
  if (solidColor) {
    const alpha = colorAlpha(solid)
    return alpha < 1 ? toRgba(solidColor, alpha) : solidColor
  }
  const gradient = directChild(properties, 'gradFill')
  if (gradient) {
    const stops = directChildren(directChild(gradient, 'gsLst'), 'gs')
      .map((stop) => {
        const color = resolveColor(stop, theme)
        if (!color) return null
        const position = Math.max(0, Math.min(100, readAttrNumber(stop, 'pos', 0) / 1000))
        const alpha = colorAlpha(stop)
        return `${alpha < 1 ? toRgba(color, alpha) : color} ${position}%`
      })
      .filter((value): value is string => !!value)
    if (stops.length >= 2) {
      const lin = directChild(gradient, 'lin')
      const rawAngle = lin ? readAttrNumber(lin, 'ang', 0) / 60000 : 90
      // CSS's 0deg points up; OOXML's 0deg points left.
      const angle = (((rawAngle + 90) % 360) + 360) % 360
      return `linear-gradient(${angle}deg, ${stops.join(', ')})`
    }
  }
  const pattern = directChild(properties, 'pattFill')
  if (pattern) {
    const fg = resolveColor(directChild(pattern, 'fgClr'), theme)
    const bg = resolveColor(directChild(pattern, 'bgClr'), theme)
    if (fg && bg) return patternCss(attr(pattern, 'prst') || 'pct50', fg, bg)
  }
  const fillRef = directChild(directChild(node, 'style'), 'fillRef')
  const refColor = Number(attr(fillRef, 'idx') ?? 0) > 0 ? resolveColor(fillRef, theme) : null
  return refColor ?? undefined
}

function colorAlpha(node: XmlElement | null) {
  const color = node
    ? directChildren(node).find((child) => ['srgbClr', 'schemeClr', 'sysClr', 'prstClr'].includes(localName(child)))
    : null
  const alpha = color ? directChild(color, 'alpha') : null
  const alphaMod = color ? directChild(color, 'alphaModFix') : null
  const value = alpha
    ? readAttrNumber(alpha, 'val', 100000)
    : alphaMod
      ? readAttrNumber(alphaMod, 'amt', 100000)
      : 100000
  return Math.max(0, Math.min(1, value / 100000))
}

function toRgba(color: string, alpha: number) {
  const hex = color.slice(-6)
  const red = parseInt(hex.slice(0, 2), 16)
  const green = parseInt(hex.slice(2, 4), 16)
  const blue = parseInt(hex.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${Math.round(alpha * 1000) / 1000})`
}

function patternCss(preset: string, foreground: string, background: string) {
  const grid = patternGrid(preset)
  const pixels = grid
    .map((row, y) =>
      row
        .map(
          (isForeground, x) =>
            `<rect x="${x}" y="${y}" width="1" height="1" fill="${isForeground ? escapeXml(foreground) : escapeXml(background)}"/>`
        )
        .join('')
    )
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8" shape-rendering="crispEdges">${pixels}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/** GenOffice and PowerPoint use the classic 8x8 GDI hatch masks for pattFill. */
function patternGrid(preset: string): boolean[][] {
  const bayer = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21]
  ]
  const percentages: Record<string, number> = {
    pct5: 5,
    pct10: 10,
    pct20: 20,
    pct25: 25,
    pct30: 30,
    pct40: 40,
    pct50: 50,
    pct60: 60,
    pct70: 70,
    pct75: 75,
    pct80: 80,
    pct90: 90
  }
  const density = percentages[preset]
  if (density != null) {
    const threshold = (density / 100) * 64
    return bayer.map((row) => row.map((value) => value < threshold))
  }
  const masks: Record<string, number[]> = {
    horz: [0xff, 0, 0, 0, 0xff, 0, 0, 0],
    vert: [0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88],
    ltHorz: [0xff, 0, 0, 0, 0, 0, 0, 0],
    ltVert: [0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80],
    dkHorz: [0xff, 0xff, 0, 0, 0xff, 0xff, 0, 0],
    dkVert: [0xcc, 0xcc, 0xcc, 0xcc, 0xcc, 0xcc, 0xcc, 0xcc],
    narHorz: [0xff, 0, 0xff, 0, 0xff, 0, 0xff, 0],
    narVert: [0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa],
    dashHorz: [0xf0, 0, 0, 0, 0x0f, 0, 0, 0],
    dashVert: [0x80, 0x80, 0x80, 0x80, 0x08, 0x08, 0x08, 0x08],
    cross: [0xff, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80],
    dnDiag: [0x88, 0x44, 0x22, 0x11, 0x88, 0x44, 0x22, 0x11],
    upDiag: [0x11, 0x22, 0x44, 0x88, 0x11, 0x22, 0x44, 0x88],
    ltDnDiag: [0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01],
    ltUpDiag: [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80],
    dkDnDiag: [0xcc, 0x66, 0x33, 0x99, 0xcc, 0x66, 0x33, 0x99],
    dkUpDiag: [0x33, 0x66, 0xcc, 0x99, 0x33, 0x66, 0xcc, 0x99],
    wdDnDiag: [0xe1, 0xf0, 0x78, 0x3c, 0x1e, 0x0f, 0x87, 0xc3],
    wdUpDiag: [0x87, 0x0f, 0x1e, 0x3c, 0x78, 0xf0, 0xe1, 0xc3],
    dashDnDiag: [0x80, 0x40, 0x20, 0x10, 0, 0, 0, 0],
    dashUpDiag: [0x01, 0x02, 0x04, 0x08, 0, 0, 0, 0],
    diagCross: [0x99, 0x66, 0x66, 0x99, 0x99, 0x66, 0x66, 0x99],
    smCheck: [0xcc, 0xcc, 0x33, 0x33, 0xcc, 0xcc, 0x33, 0x33],
    lgCheck: [0xf0, 0xf0, 0xf0, 0xf0, 0x0f, 0x0f, 0x0f, 0x0f],
    smGrid: [0xff, 0x88, 0x88, 0x88, 0xff, 0x88, 0x88, 0x88],
    lgGrid: [0xff, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80],
    dotGrid: [0xaa, 0, 0x80, 0, 0x80, 0, 0x80, 0],
    smConfetti: [0x01, 0x10, 0x02, 0x40, 0x08, 0x80, 0x04, 0x20],
    lgConfetti: [0x8c, 0x31, 0x03, 0xc6, 0x18, 0x63, 0x30, 0xc4],
    horzBrick: [0xff, 0x80, 0x80, 0x80, 0xff, 0x08, 0x08, 0x08],
    diagBrick: [0x80, 0x40, 0x20, 0x10, 0x08, 0x14, 0x22, 0x41],
    solidDmnd: [0x10, 0x38, 0x7c, 0xfe, 0x7c, 0x38, 0x10, 0],
    openDmnd: [0x10, 0x28, 0x44, 0x82, 0x44, 0x28, 0x10, 0],
    dotDmnd: [0x10, 0, 0x44, 0, 0x10, 0, 0, 0],
    plaid: [0xaa, 0x55, 0xaa, 0x55, 0xf0, 0xf0, 0xf0, 0xf0],
    sphere: [0x38, 0x44, 0x92, 0xaa, 0x92, 0x44, 0x38, 0],
    weave: [0x88, 0x54, 0x22, 0x45, 0x88, 0x15, 0x22, 0x51],
    divot: [0x08, 0x14, 0, 0, 0x80, 0x41, 0, 0],
    shingle: [0x80, 0x40, 0x20, 0xe0, 0x02, 0x04, 0x08, 0x07],
    wave: [0, 0x60, 0x99, 0x06, 0, 0x60, 0x99, 0x06],
    trellis: [0xff, 0x55, 0xff, 0x55, 0xff, 0x55, 0xff, 0x55],
    zigZag: [0x11, 0x22, 0x44, 0x88, 0x88, 0x44, 0x22, 0x11]
  }
  const mask = masks[preset] ?? masks.cross
  return mask.map((row) => Array.from({ length: 8 }, (_, column) => !!(row & (1 << (7 - column)))))
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function readStroke(properties: XmlElement | null, theme: ThemeColors) {
  return resolveColor(directChild(directChild(properties, 'ln'), 'solidFill'), theme)
}

function geometryOf(properties: XmlElement | null): PptxShape['geometry'] {
  const preset = attr(directChild(properties, 'prstGeom'), 'prst')
  return preset || 'rect'
}

function readGeometryAdjust(properties: XmlElement | null) {
  const avLst = directChild(directChild(properties, 'prstGeom'), 'avLst')
  const result: Record<string, number> = {}
  for (const guide of directChildren(avLst, 'gd')) {
    const name = attr(guide, 'name')
    const formula = attr(guide, 'fmla')
    const match = formula?.match(/(?:^|\s)val\s+(-?\d+(?:\.\d+)?)/i)
    if (name && match) result[name] = Number(match[1])
  }
  return Object.keys(result).length ? result : undefined
}

function readLineEnd(node: XmlElement | null): PptxLineEnd | undefined {
  const type = attr(node, 'type')
  if (!type || type === 'none') return type === 'none' ? 'none' : undefined
  if (type === 'triangle' || type === 'stealth' || type === 'diamond' || type === 'oval' || type === 'open') return type
  return undefined
}

function readImageCrop(blipFill: XmlElement | null) {
  const crop = directChild(blipFill, 'srcRect')
  return crop
    ? {
        left: Number(attr(crop, 'l') ?? 0) / 100000,
        top: Number(attr(crop, 't') ?? 0) / 100000,
        right: Number(attr(crop, 'r') ?? 0) / 100000,
        bottom: Number(attr(crop, 'b') ?? 0) / 100000
      }
    : null
}

function readTransform(xfrm: XmlElement | null): Transform {
  const off = directChild(xfrm, 'off')
  const ext = directChild(xfrm, 'ext')
  return {
    x: readAttrNumber(off, 'x', 0),
    y: readAttrNumber(off, 'y', 0),
    width: readAttrNumber(ext, 'cx', 0),
    height: readAttrNumber(ext, 'cy', 0),
    rotation: Number(attr(xfrm, 'rot') ?? 0) / 60000,
    flipH: attr(xfrm, 'flipH') === '1',
    flipV: attr(xfrm, 'flipV') === '1'
  }
}

function readGroupTransform(xfrm: XmlElement | null) {
  const off = directChild(xfrm, 'off')
  const ext = directChild(xfrm, 'ext')
  const childOff = directChild(xfrm, 'chOff')
  const childExt = directChild(xfrm, 'chExt')
  const childWidth = Math.max(1, readAttrNumber(childExt, 'cx', 1))
  const childHeight = Math.max(1, readAttrNumber(childExt, 'cy', 1))
  return {
    x: readAttrNumber(off, 'x', 0),
    y: readAttrNumber(off, 'y', 0),
    childX: readAttrNumber(childOff, 'x', 0),
    childY: readAttrNumber(childOff, 'y', 0),
    scaleX: readAttrNumber(ext, 'cx', childWidth) / childWidth,
    scaleY: readAttrNumber(ext, 'cy', childHeight) / childHeight
  }
}

function applyParent(rect: Transform, parent: ParentTransform): Transform {
  return {
    ...rect,
    x: parent.x + rect.x * parent.scaleX,
    y: parent.y + rect.y * parent.scaleY,
    width: rect.width * parent.scaleX,
    height: rect.height * parent.scaleY
  }
}

function parseRelationships(xml: string, source: string): RelationshipMap {
  const result = new Map<string, string>()
  const document = parseXml(xml)
  for (const relationship of directChildren(document)) {
    const id = attr(relationship, 'Id')
    const target = attr(relationship, 'Target')
    if (id && target && attr(relationship, 'TargetMode') !== 'External') result.set(id, resolveZipPath(source, target))
  }
  return result
}

function findRelationship(relationships: RelationshipMap, type: string) {
  const folder = type === 'slideLayout' ? 'slideLayouts' : type === 'slideMaster' ? 'slideMasters' : type
  for (const path of relationships.values()) if (path.includes(`/${folder}/`)) return path
  return null
}

async function loadTheme(zip: JSZip, relationships: RelationshipMap, fallback: ThemeColors = DEFAULT_THEME) {
  const themePath = [...relationships.values()].find((path) => path.includes('/theme/'))
  if (!themePath || !zip.file(themePath)) return fallback
  const scheme = firstDescendant(parseXml(await requiredXml(zip, themePath)), 'clrScheme')
  const colors = { ...fallback }
  for (const child of directChildren(scheme)) {
    const color = resolveColor(child, fallback)
    if (color) colors[localName(child)] = color
  }
  return colors
}

async function loadImage(zip: JSZip, path: string, cache: Map<string, string>) {
  const cached = cache.get(path)
  if (cached) return cached
  const file = zip.file(path)
  if (!file) return null
  const base64 = await file.async('base64')
  const extension = path.split('.').pop()?.toLowerCase() ?? 'png'
  const mime =
    extension === 'jpg' || extension === 'jpeg'
      ? 'image/jpeg'
      : extension === 'svg'
        ? 'image/svg+xml'
        : `image/${extension}`
  const value = `data:${mime};base64,${base64}`
  cache.set(path, value)
  return value
}

function imageEmbedId(blip: XmlElement | null) {
  const direct = attr(blip, 'r:embed')
  if (direct) return direct
  const extList = directChild(blip, 'extLst')
  for (const extension of directChildren(extList, 'ext')) {
    for (const child of directChildren(extension)) {
      if (localName(child).endsWith('svgBlip')) {
        const embed = attr(child, 'r:embed')
        if (embed) return embed
      }
    }
  }
  return null
}

function readImageOpacity(blip: XmlElement | null) {
  const alpha = directChild(blip, 'alphaModFix')
  if (!alpha) return undefined
  return Math.max(0, Math.min(1, readAttrNumber(alpha, 'amt', 100000) / 100000))
}

function resolveColor(node: XmlElement | null, theme: ThemeColors): string | null {
  if (!node) return null
  const color = directChildren(node).find((child) =>
    ['srgbClr', 'schemeClr', 'sysClr', 'prstClr'].includes(localName(child))
  )
  if (!color) return null
  const raw =
    localName(color) === 'srgbClr' || localName(color) === 'sysClr'
      ? (attr(color, 'lastClr') ?? attr(color, 'val'))
      : localName(color) === 'schemeClr'
        ? theme[attr(color, 'val') ?? '']
        : presetColor(attr(color, 'val'))
  const normalized = raw ? normalizeHex(raw) : null
  return normalized ? applyColorModifiers(normalized, color) : null
}

function applyColorModifiers(color: string, node: XmlElement) {
  const hex = color.slice(-6)
  let red = parseInt(hex.slice(0, 2), 16)
  let green = parseInt(hex.slice(2, 4), 16)
  let blue = parseInt(hex.slice(4, 6), 16)
  const modifier = (name: string) => {
    const child = directChild(node, name)
    return child ? Math.max(0, Math.min(100000, readAttrNumber(child, 'val', 100000))) / 100000 : null
  }
  const tint = modifier('tint')
  const shade = modifier('shade')
  const lumMod = modifier('lumMod')
  const lumOff = modifier('lumOff')
  if (tint != null) {
    red += (255 - red) * tint
    green += (255 - green) * tint
    blue += (255 - blue) * tint
  }
  if (shade != null) {
    red *= shade
    green *= shade
    blue *= shade
  }
  if (lumMod != null || lumOff != null) {
    const mod = lumMod ?? 1
    const off = lumOff ?? 0
    red = red * mod + 255 * off
    green = green * mod + 255 * off
    blue = blue * mod + 255 * off
  }
  return rgbColor(Math.round(red), Math.round(green), Math.round(blue))
}

function presetColor(value: string | null) {
  const colors: Record<string, string> = {
    black: rgbColor(0, 0, 0),
    white: rgbColor(255, 255, 255),
    red: rgbColor(255, 0, 0),
    green: rgbColor(0, 128, 0),
    blue: rgbColor(0, 0, 255),
    yellow: rgbColor(255, 255, 0),
    cyan: rgbColor(0, 255, 255),
    magenta: rgbColor(255, 0, 255),
    gray: rgbColor(128, 128, 128),
    orange: rgbColor(255, 165, 0),
    purple: rgbColor(128, 0, 128),
    transparent: rgbColor(255, 255, 255)
  }
  return value ? (colors[value] ?? null) : null
}

function normalizeHex(value: string) {
  const hex = value.replace('#', '').slice(-6)
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : DEFAULT_TEXT_COLOR
}

function parseXml(xml: string): XmlElement {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.getElementsByTagName('parsererror').length) throw new Error('Invalid Office XML.')
  return document.documentElement
}

function directChild(node: XmlElement | null | undefined, name: string | null): XmlElement | null {
  return name ? (directChildren(node).find((child) => localName(child) === name) ?? null) : null
}
function directChildren(node: XmlElement | null | undefined, name?: string): XmlElement[] {
  return node ? Array.from(node.children).filter((child) => !name || localName(child) === name) : []
}

/** OOXML may wrap a renderable shape in mc:AlternateContent. Prefer the first
 * Choice (modern Office markup) and use Fallback when a choice is absent. */
function renderChildren(node: XmlElement | null | undefined): XmlElement[] {
  const result: XmlElement[] = []
  for (const child of directChildren(node)) {
    if (localName(child) !== 'AlternateContent') {
      result.push(child)
      continue
    }
    const branch = directChild(child, 'Choice') ?? directChild(child, 'Fallback')
    result.push(...directChildren(branch))
  }
  return result
}
function firstDescendant(node: XmlElement | null | undefined, name: string): XmlElement | null {
  return node
    ? localName(node) === name
      ? node
      : (Array.from(node.getElementsByTagName('*')).find((child) => localName(child) === name) ?? null)
    : null
}
function textOf(node: XmlElement | null) {
  return node?.textContent ?? ''
}
function localName(node: Element | null | undefined) {
  return node?.localName || node?.tagName?.split(':').pop() || ''
}
function attr(node: XmlElement | null | undefined, name: string) {
  return node?.getAttribute(name) ?? null
}
function readAttrNumber(node: XmlElement | null | undefined, name: string, fallback: number) {
  const raw = attr(node, name)
  if (raw == null || raw === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}
function readNumber(document: XmlElement, elementName: string, attribute: string, fallback: number) {
  const element = Array.from(document.getElementsByTagName('*')).find((node) => localName(node) === elementName)
  return readAttrNumber(element, attribute, fallback)
}
function shapeIdOf(node: XmlElement | null) {
  return (
    attr(directChild(directChild(node, 'nvSpPr'), 'cNvPr'), 'id') ??
    attr(directChild(directChild(node, 'nvCxnSpPr'), 'cNvPr'), 'id') ??
    attr(directChild(directChild(node, 'nvPicPr'), 'cNvPr'), 'id') ??
    attr(directChild(directChild(node, 'nvGraphicFramePr'), 'cNvPr'), 'id')
  )
}
function paragraphAlign(value: string | null): PptxParagraph['align'] {
  return value === 'ctr' ? 'center' : value === 'r' ? 'right' : value === 'just' ? 'justify' : 'left'
}
function resolveZipPath(source: string, target: string) {
  // Office relationship targets may be package-root absolute paths (for
  // example `/ppt/slides/charts/chart1.xml`) as well as paths relative to the
  // relationship part. Root targets must not inherit the source directory.
  if (target.startsWith('/')) {
    return target.replace(/^\/+/, '').split('/').filter(Boolean).join('/')
  }
  const parts = source.split('/')
  parts.pop()
  for (const part of target.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}
async function requiredXml(zip: JSZip, path: string) {
  const file = zip.file(path)
  if (!file) throw new Error(`Presentation package is missing ${path}.`)
  return file.async('text')
}
