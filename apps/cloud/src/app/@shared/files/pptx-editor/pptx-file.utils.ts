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
}

export type PptxTableCell = { text: string; colSpan: number; rowSpan: number }

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
  imageSrc: string | null
  imagePath?: string
  imageRelId?: string
  imageCrop: { left: number; top: number; right: number; bottom: number } | null
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
  table: { columns: number[]; rows: PptxTableCell[][] } | null
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
    const table = parseTable(directChild(directChild(node, 'graphic'), 'graphicData'))
    if (table) return [{ ...shape, kind: 'table', table, geometry: 'none' }]
    const chartNode = firstDescendant(node, 'chart')
    const chartRelation = attr(chartNode, 'r:id')
    const chartPath = chartRelation ? context.relationships.get(chartRelation) : null
    const chartSrc = chartPath ? await renderPptxChart(context.zip, chartPath) : null
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
  shape.geometry = kind === 'cxnSp' ? 'none' : geometryOf(properties)
  shape.fill = readFill(properties, node, context.theme)
  shape.fillCss = readFillCss(properties, node, context.theme)
  shape.stroke = readStroke(properties, context.theme)
  // Keep stroke widths in CSS pixels.  A few earlier editor builds wrote the
  // pixel value as if it were EMUs; clamping protects those files from
  // producing multi-thousand-pixel borders when reopened.
  shape.strokeWidth = Math.min(24, readAttrNumber(directChild(properties, 'ln'), 'w', 0) / EMU_PER_PX)
  if (kind === 'pic') {
    const embed = attr(directChild(directChild(node, 'blipFill'), 'blip'), 'r:embed')
    const imagePath = embed ? context.relationships.get(embed) : null
    shape.imageSrc = imagePath ? await loadImage(context.zip, imagePath, context.imageCache) : null
    shape.imageCrop = readImageCrop(directChild(node, 'blipFill'))
  } else {
    const blipFill = directChild(properties, 'blipFill')
    const embed = attr(directChild(blipFill, 'blip'), 'r:embed')
    const imagePath = embed ? context.relationships.get(embed) : null
    if (imagePath) {
      shape.kind = 'image'
      shape.imageSrc = await loadImage(context.zip, imagePath, context.imageCache)
      shape.imageCrop = readImageCrop(blipFill)
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
    const runs: PptxRun[] = []
    for (const child of directChildren(paragraph)) {
      if (localName(child) === 'br') {
        runs.push(readRun('\n', directChild(child, 'rPr'), defaultRun ?? fallbackRun, theme, defaultColor))
        continue
      }
      if (localName(child) === 'tab') {
        runs.push(readRun('\t', directChild(child, 'rPr'), defaultRun ?? fallbackRun, theme, defaultColor))
        continue
      }
      if (!['r', 'fld'].includes(localName(child))) continue
      const text = textOf(directChild(child, 't'))
      if (!text) continue
      runs.push(readRun(text, directChild(child, 'rPr'), defaultRun ?? fallbackRun, theme, defaultColor))
    }
    paragraphs.push({
      text: runs.map((run) => run.text).join(''),
      runs,
      align: paragraphAlign(attr(pPr, 'algn')),
      level: Number(attr(pPr, 'lvl') ?? 0)
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

function readRun(
  text: string,
  props: XmlElement | null,
  fallback: XmlElement | null,
  theme: ThemeColors,
  defaultColor: string
): PptxRun {
  const latin = directChild(props, 'latin') ?? directChild(fallback, 'latin')
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

function parseTable(graphicData: XmlElement | null): PptxShape['table'] {
  const table = directChild(graphicData, 'tbl')
  if (!table) return null
  const columns = directChildren(directChild(table, 'tblGrid'), 'gridCol').map((column) =>
    readAttrNumber(column, 'w', 0)
  )
  const rows: PptxTableCell[][] = []
  for (const row of directChildren(table, 'tr'))
    rows.push(
      directChildren(row, 'tc').map((cell) => ({
        text: textOf(directChild(directChild(cell, 'txBody'), 'p')).trim(),
        colSpan: Number(attr(cell, 'gridSpan') ?? 1),
        rowSpan: Number(attr(cell, 'rowSpan') ?? 1)
      }))
    )
  return { columns, rows }
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
  const angle = /Diag|Horz|Vert/i.test(preset) ? (/(Dn|Down)/i.test(preset) ? 135 : 45) : 0
  const size = /lt|thin|sm/i.test(preset) ? 7 : 10
  return `repeating-linear-gradient(${angle}deg, ${foreground} 0 1px, ${background} 1px ${size}px)`
}

function readStroke(properties: XmlElement | null, theme: ThemeColors) {
  return resolveColor(directChild(directChild(properties, 'ln'), 'solidFill'), theme)
}

function geometryOf(properties: XmlElement | null): PptxShape['geometry'] {
  const preset = attr(directChild(properties, 'prstGeom'), 'prst')
  return preset || 'rect'
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
