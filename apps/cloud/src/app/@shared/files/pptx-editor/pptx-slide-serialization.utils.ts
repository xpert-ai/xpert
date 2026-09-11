import type { PptxParagraph, PptxRun, PptxShape, PptxSlide } from './pptx-file.utils'
import { patchSlideAnimations } from './pptx-animation.utils'

const EMU_PER_PX = 9525

export function updateSlideXml(
  xml: string,
  shapes: PptxShape[],
  transition: PptxSlide['transition'] = 'none',
  transitionDirty = false,
  background: string | null = null,
  backgroundDirty = false,
  hidden = false,
  hiddenDirty = false,
  animationDirty = false
) {
  const deletedIds = new Set(
    shapes.filter((shape) => shape.deleted && shape.sourceId).map((shape) => shape.sourceId as string)
  )
  let slideXml = xml.replace(/<p:(sp|pic|cxnSp|graphicFrame)\b[\s\S]*?<\/p:\1>/gi, (shapeXml) => {
    const id = shapeXml.match(/<p:cNvPr\b[^>]*\bid="([^"]+)"/i)?.[1]
    return id && deletedIds.has(id) ? '' : shapeXml
  })
  const byId = new Map(shapes.filter((shape) => shape.editable).map((shape) => [shape.sourceId ?? shape.id, shape]))
  slideXml = slideXml.replace(/<p:(sp|pic|cxnSp|graphicFrame)\b[\s\S]*?<\/p:\1>/gi, (shapeXml) => {
    const id = shapeXml.match(/<p:cNvPr\b[^>]*\bid="([^"]+)"/i)?.[1]
    const shape = id ? byId.get(id) : null
    if (!shape || shape.deleted) return shapeXml
    let updated = patchShapeTransform(shapeXml, shape)
    if (shape.shapeStyleDirty) updated = patchShapeVisual(updated, shape)
    if (shape.kind === 'table' && shape.tableDirty && shape.table) updated = patchTableText(updated, shape)
    return updated
  })
  slideXml = slideXml.replace(/<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/gi, (shapeXml) => {
    const id = shapeXml.match(/<p:cNvPr\b[^>]*\bid="([^"]+)"/i)?.[1]
    const shape = id ? byId.get(id) : null
    if (!shape || shape.deleted) return shapeXml
    const textChanged = shape.text !== (shape.sourceText ?? '')
    const updated = textChanged ? replaceTextBodyParagraphs(shapeXml, shape) : shapeXml
    return shape.formatDirty ? patchShapeFormatting(updated, shape) : updated
  })
  const createdShapes = shapes
    .filter((shape) => shape.created && !shape.deleted)
    .map(serializeShape)
    .join('')
  const result = createdShapes ? slideXml.replace(/<\/p:spTree>/i, `${createdShapes}</p:spTree>`) : slideXml
  const ordered = reorderSlideShapes(result, shapes)
  const visual = patchBackground(patchTransition(ordered, transition, transitionDirty), background, backgroundDirty)
  return patchSlideAnimations(patchSlideHidden(visual, hidden, hiddenDirty), shapes, animationDirty)
}

export function createBlankSlideXml() {
  return `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
}

export function safeXmlId(value: string) {
  const numeric = Number(value.replace(/\D/g, '').slice(-8))
  return String(Number.isFinite(numeric) && numeric > 1 ? numeric : Math.floor(Date.now() / 1000) % 100000000)
}

function patchShapeTransform(xml: string, shape: PptxShape) {
  return xml.replace(/<(a|p):xfrm\b[^>]*>[\s\S]*?<\1:xfrm>/i, (_full, prefix) => {
    return `<${prefix}:xfrm${transformAttributes(shape)}><a:off x="${Math.round(shape.x)}" y="${Math.round(shape.y)}"/><a:ext cx="${Math.max(1, Math.round(shape.width))}" cy="${Math.max(1, Math.round(shape.height))}"/></${prefix}:xfrm>`
  })
}

function patchShapeVisual(xml: string, shape: PptxShape) {
  return xml.replace(/(<p:spPr\b[^>]*>)([\s\S]*?)(<\/p:spPr>)/i, (_full, start, body, end) => {
    const lineIndex = body.search(/<a:ln\b/i)
    const beforeLine = lineIndex >= 0 ? body.slice(0, lineIndex) : body
    const afterLine = lineIndex >= 0 ? body.slice(lineIndex) : ''
    const withoutFill = beforeLine.replace(
      /<a:(noFill|solidFill|gradFill|blipFill|pattFill|grpFill)\b[^>]*(?:\/>|>[\s\S]*?<\/a:\1>)/gi,
      ''
    )
    const fill = shape.fill
      ? `<a:solidFill><a:srgbClr val="${shape.fill.replace('#', '').slice(-6)}"/></a:solidFill>`
      : '<a:noFill/>'
    const line = shape.stroke
      ? `<a:ln w="${Math.max(1, Math.round(shape.strokeWidth * EMU_PER_PX))}"><a:solidFill><a:srgbClr val="${shape.stroke.replace('#', '').slice(-6)}"/></a:solidFill></a:ln>`
      : '<a:ln><a:noFill/></a:ln>'
    const withoutLine = afterLine.replace(/<a:ln\b[^>]*(?:\/>|>[\s\S]*?<\/a:ln>)/i, '')
    return `${start}${withoutFill}${fill}${line}${withoutLine}${end}`
  })
}

function patchTableText(xml: string, shape: PptxShape) {
  const cells = shape.table?.rows.flat() ?? []
  let index = 0
  return xml.replace(/<a:tc\b[^>]*>[\s\S]*?<\/a:tc>/gi, (cellXml) => {
    const cell = cells[index++]
    if (!cell) return cellXml
    let textIndex = 0
    const updated = cellXml.replace(/(<a:t\b[^>]*>)[\s\S]*?(<\/a:t>)/gi, (_full, start, end) => {
      return `${start}${textIndex++ === 0 ? escapeXml(cell.text) : ''}${end}`
    })
    if (textIndex) return updated
    return updated.replace(/<\/a:p>/i, `<a:r><a:t>${escapeXml(cell.text)}</a:t></a:r></a:p>`)
  })
}

function reorderSlideShapes(xml: string, shapes: PptxShape[]) {
  const slide = parseXml(xml)
  const tree = directChild(directChild(slide, 'cSld'), 'spTree')
  if (!tree) return xml
  const nodes = directChildren(tree).filter((node) => ['sp', 'pic', 'cxnSp', 'graphicFrame'].includes(localName(node)))
  const byId = new Map(nodes.map((node) => [shapeIdOf(node), node]))
  const ordered = shapes
    .filter((shape) => shape.editable && !shape.deleted)
    .map((shape) => byId.get(shape.sourceId ?? safeXmlId(shape.id)))
    .filter((node): node is Element => !!node)
  if (ordered.length < 2) return xml
  const insertionPoint = nodes.at(-1)?.nextSibling ?? null
  for (const node of ordered) node.remove()
  for (const node of ordered) tree.insertBefore(node, insertionPoint)
  return new XMLSerializer().serializeToString(slide)
}

function patchBackground(xml: string, background: string | null, dirty: boolean) {
  if (!dirty || !background) return xml
  const withoutBackground = xml.replace(/<p:bg\b[^>]*(?:\/>|>[\s\S]*?<\/p:bg>)/gi, '')
  const color = background.replace('#', '').slice(-6)
  const node = `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`
  return withoutBackground.replace(/(<p:cSld\b[^>]*>)/i, `$1${node}`)
}

function patchTransition(xml: string, transition: PptxSlide['transition'], dirty: boolean) {
  if (!dirty) return xml
  const alternate =
    /<mc:AlternateContent\b[^>]*>\s*<mc:Choice\b[^>]*>\s*<p:transition\b[\s\S]*?<\/mc:AlternateContent>/gi
  const withoutTransition = xml
    .replace(alternate, '')
    .replace(/<p:transition\b[^>]*(?:\/>|>[\s\S]*?<\/p:transition>)/gi, '')
  if (!transition || transition === 'none') return withoutTransition
  const nodes: Record<Exclude<NonNullable<PptxSlide['transition']>, 'none' | 'morph'>, string> = {
    fade: '<p:fade/>',
    push: '<p:push dir="u"/>',
    wipe: '<p:wipe dir="l"/>',
    split: '<p:split orient="horz" dir="out"/>',
    circle: '<p:circle/>',
    cover: '<p:cover dir="l"/>',
    pull: '<p:pull dir="l"/>',
    dissolve: '<p:dissolve/>',
    zoom: '<p:zoom/>',
    random: '<p:random/>'
  }
  const transitionXml =
    transition === 'morph'
      ? '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/main" Requires="p159"><p:transition><p159:morph option="byObject"/></p:transition></mc:Choice><mc:Fallback><p:transition><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>'
      : `<p:transition spd="med">${nodes[transition]}</p:transition>`
  const timingIndex = withoutTransition.search(/<p:timing\b/i)
  if (timingIndex >= 0)
    return `${withoutTransition.slice(0, timingIndex)}${transitionXml}${withoutTransition.slice(timingIndex)}`
  return withoutTransition.replace(/<\/p:sld>/i, `${transitionXml}</p:sld>`)
}

function patchSlideHidden(xml: string, hidden: boolean, dirty: boolean) {
  if (!dirty) return xml
  return xml.replace(/<p:sld\b[^>]*>/i, (tag) => {
    const visibleTag = tag.replace(/\s+show="[^"]*"/i, '')
    return hidden ? `${visibleTag.slice(0, -1)} show="0">` : visibleTag
  })
}

function serializeShape(shape: PptxShape) {
  if (shape.kind === 'image' && shape.imagePath && shape.imageRelId) return serializeImageShape(shape)
  if (shape.kind === 'table' && shape.table) return serializeTableShape(shape)
  if (shape.kind === 'line') return serializeLineShape(shape)
  const id = safeXmlId(shape.id)
  const xfrm = `<a:xfrm${transformAttributes(shape)}><a:off x="${Math.round(shape.x)}" y="${Math.round(shape.y)}"/><a:ext cx="${Math.max(1, Math.round(shape.width))}" cy="${Math.max(1, Math.round(shape.height))}"/></a:xfrm>`
  const geometry =
    shape.geometry === 'none'
      ? ''
      : `<a:prstGeom prst="${shape.geometry === 'roundRect' ? 'roundRect' : shape.geometry}"/>`
  const fill = shape.fill
    ? `<a:solidFill><a:srgbClr val="${shape.fill.replace('#', '').slice(-6)}"/></a:solidFill>`
    : '<a:noFill/>'
  const stroke = strokeXml(shape)
  const textBody = `<p:txBody><a:bodyPr anchor="${shape.verticalAlign === 'middle' ? 'ctr' : shape.verticalAlign === 'bottom' ? 'b' : 't'}" wrap="${shape.wrap ? 'square' : 'none'}" lIns="${shape.margin.left}" rIns="${shape.margin.right}" tIns="${shape.margin.top}" bIns="${shape.margin.bottom}"/><a:lstStyle/>${serializeTextParagraphs(shape)}</p:txBody>`
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(shape.name || id)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm}${geometry}${fill}${stroke}</p:spPr>${textBody}</p:sp>`
}

function serializeLineShape(shape: PptxShape) {
  const id = safeXmlId(shape.id)
  const xfrm = `<a:xfrm${transformAttributes(shape)}><a:off x="${Math.round(shape.x)}" y="${Math.round(shape.y)}"/><a:ext cx="${Math.max(1, Math.round(shape.width))}" cy="${Math.max(1, Math.round(shape.height))}"/></a:xfrm>`
  return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="${escapeXml(shape.name || id)}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xfrm}<a:prstGeom prst="line"/>${strokeXml(shape)}</p:spPr></p:cxnSp>`
}

function serializeImageShape(shape: PptxShape) {
  const id = safeXmlId(shape.id)
  const description = shape.editorKind === 'ink' ? ' descr="xpert:ink"' : ''
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${escapeXml(shape.name || id)}"${description}/><p:cNvPicPr preferRelativeResize="0"/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${shape.imageRelId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm${transformAttributes(shape)}><a:off x="${Math.round(shape.x)}" y="${Math.round(shape.y)}"/><a:ext cx="${Math.round(shape.width)}" cy="${Math.round(shape.height)}"/></a:xfrm><a:prstGeom prst="rect"/></p:spPr></p:pic>`
}

function serializeTableShape(shape: PptxShape) {
  const id = safeXmlId(shape.id)
  const columns = shape.table?.columns ?? []
  const rows = shape.table?.rows ?? []
  const colWidth = Math.round(Math.max(1, shape.width) / Math.max(1, columns.length))
  const grid = columns.map(() => `<a:gridCol w="${colWidth}"/>`).join('')
  const body = rows
    .map(
      (row) =>
        `<a:tr h="${Math.max(1, Math.round(shape.height / Math.max(1, rows.length)))}">${row.map((cell) => `<a:tc${cell.colSpan > 1 ? ` gridSpan="${cell.colSpan}"` : ''}${cell.rowSpan > 1 ? ` rowSpan="${cell.rowSpan}"` : ''}><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="${Math.round(shape.fontSizePt * 100)}"><a:solidFill><a:srgbClr val="${shape.textColor.replace('#', '').slice(-6)}"/></a:solidFill></a:rPr><a:t>${escapeXml(cell.text)}</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>`).join('')}</a:tr>`
    )
    .join('')
  const xfrm = `<p:xfrm${transformAttributes(shape)}><a:off x="${Math.round(shape.x)}" y="${Math.round(shape.y)}"/><a:ext cx="${Math.round(shape.width)}" cy="${Math.round(shape.height)}"/></p:xfrm>`
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${escapeXml(shape.name || id)}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>${xfrm}<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr/><a:tblGrid>${grid}</a:tblGrid>${body}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
}

function strokeXml(shape: PptxShape) {
  return shape.stroke
    ? `<a:ln w="${Math.max(1, Math.round(shape.strokeWidth * EMU_PER_PX))}"><a:solidFill><a:srgbClr val="${shape.stroke.replace('#', '').slice(-6)}"/></a:solidFill></a:ln>`
    : '<a:ln><a:noFill/></a:ln>'
}

function transformAttributes(shape: PptxShape) {
  return [
    shape.rotation ? ` rot="${Math.round(shape.rotation * 60000)}"` : '',
    shape.flipH ? ' flipH="1"' : '',
    shape.flipV ? ' flipV="1"' : ''
  ].join('')
}

function replaceTextBodyParagraphs(xml: string, shape: PptxShape) {
  return xml.replace(/(<p:txBody\b[^>]*>)([\s\S]*?)(<\/p:txBody>)/i, (_full, start, body, end) => {
    const withoutParagraphs = body.replace(/<a:p\b[^>]*(?:\/>|>[\s\S]*?<\/a:p>)/gi, '')
    return `${start}${withoutParagraphs}${serializeTextParagraphs(shape)}${end}`
  })
}

function serializeTextParagraphs(shape: PptxShape) {
  const paragraphText = shape.paragraphs.map((paragraph) => paragraph.text).join('\n')
  const paragraphs =
    shape.paragraphs.length && paragraphText === shape.text ? shape.paragraphs : paragraphsFromShapeText(shape)
  return paragraphs
    .map((paragraph) => {
      const align =
        paragraph.align === 'center'
          ? 'ctr'
          : paragraph.align === 'right'
            ? 'r'
            : paragraph.align === 'justify'
              ? 'just'
              : 'l'
      const runs = paragraph.runs.length ? paragraph.runs : [runFromShape(shape, paragraph.text)]
      return `<a:p><a:pPr algn="${align}" lvl="${Math.max(0, paragraph.level)}"/>${runs.map(serializeTextRun).join('')}<a:endParaRPr sz="${Math.max(1, Math.round(shape.fontSizePt * 100))}"/></a:p>`
    })
    .join('')
}

function paragraphsFromShapeText(shape: PptxShape): PptxParagraph[] {
  return shape.text.split(/\n/).map((text) => ({
    text,
    runs: [runFromShape(shape, text)],
    align: shape.textAlign,
    level: 0
  }))
}

function runFromShape(shape: PptxShape, text: string): PptxRun {
  return {
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
}

function serializeTextRun(run: PptxRun) {
  const baseline = run.superscript ? ' baseline="30000"' : run.subscript ? ' baseline="-25000"' : ''
  const font = run.fontFamily ? `<a:latin typeface="${escapeXml(run.fontFamily)}"/>` : ''
  return `<a:r><a:rPr sz="${Math.max(1, Math.round(run.fontSizePt * 100))}"${run.bold ? ' b="1"' : ''}${run.italic ? ' i="1"' : ''}${run.underline ? ' u="sng"' : ''}${run.strike ? ' strike="sngStrike"' : ''}${baseline}><a:solidFill><a:srgbClr val="${run.color.replace('#', '').slice(-6)}"/></a:solidFill>${font}</a:rPr><a:t>${escapeXml(run.text)}</a:t></a:r>`
}

function patchShapeFormatting(xml: string, shape: PptxShape) {
  const textBodyStart = xml.search(/<p:txBody\b/i)
  const textBodyEnd = xml.search(/<\/p:txBody>/i)
  if (textBodyStart < 0 || textBodyEnd < textBodyStart) return xml
  const before = xml.slice(0, textBodyStart)
  const body = xml.slice(textBodyStart, textBodyEnd)
  const after = xml.slice(textBodyEnd)
  const color = shape.textColor.replace('#', '').slice(-6)
  let patched = body.replace(/<a:rPr\b([^>]*)\/>/gi, (_full, attrs) => {
    return `<a:rPr${patchRunAttributes(attrs, shape)}>${formatRunChildren('', shape, color)}</a:rPr>`
  })
  patched = patched.replace(/<a:rPr\b([^>]*)>([\s\S]*?)<\/a:rPr>/gi, (_full, attrs, children) => {
    return `<a:rPr${patchRunAttributes(attrs, shape)}>${formatRunChildren(children, shape, color)}</a:rPr>`
  })
  patched = patched.replace(/<a:pPr\b([^>]*)>/gi, (_full, attrs) => {
    const align =
      shape.textAlign === 'center'
        ? 'ctr'
        : shape.textAlign === 'right'
          ? 'r'
          : shape.textAlign === 'justify'
            ? 'just'
            : 'l'
    return `<a:pPr${replaceAttribute(attrs, 'algn', align)}>`
  })
  patched = patched.replace(/<a:bodyPr\b([^>]*?)(\/?)>/i, (_full, attrs, close) => {
    const anchor = shape.verticalAlign === 'middle' ? 'ctr' : shape.verticalAlign === 'bottom' ? 'b' : 't'
    return `<a:bodyPr${replaceAttribute(replaceAttribute(attrs, 'anchor', anchor), 'wrap', shape.wrap ? 'square' : 'none')}${close}>`
  })
  return before + patched + after
}

function patchRunAttributes(attrs: string, shape: PptxShape) {
  let result = replaceAttribute(attrs, 'sz', String(Math.max(1, Math.round(shape.fontSizePt * 100))))
  result = replaceBooleanAttribute(result, 'b', shape.bold)
  result = replaceBooleanAttribute(result, 'i', shape.italic)
  result = replaceAttribute(result, 'u', shape.underline ? 'sng' : 'none')
  result = replaceAttribute(result, 'strike', shape.strike ? 'sngStrike' : 'noStrike')
  return replaceAttribute(result, 'baseline', shape.superscript ? '30000' : shape.subscript ? '-25000' : '0')
}

function formatRunChildren(children: string, shape: PptxShape, color: string) {
  const solidFill = `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>`
  let result = /<a:solidFill\b[^>]*>[\s\S]*?<\/a:solidFill>/i.test(children)
    ? children.replace(/<a:solidFill\b[^>]*>[\s\S]*?<\/a:solidFill>/i, solidFill)
    : solidFill + children
  if (shape.fontFamily) {
    const latin = `<a:latin typeface="${escapeXml(shape.fontFamily)}"/>`
    result = /<a:latin\b[^>]*\/>/i.test(result) ? result.replace(/<a:latin\b[^>]*\/>/i, latin) : result + latin
  }
  return result
}

function replaceAttribute(attrs: string, name: string, value: string) {
  const pattern = new RegExp(`\\s${name}="[^"]*"`, 'i')
  return pattern.test(attrs)
    ? attrs.replace(pattern, ` ${name}="${escapeXml(value)}"`)
    : `${attrs} ${name}="${escapeXml(value)}"`
}

function replaceBooleanAttribute(attrs: string, name: string, value: boolean) {
  return replaceAttribute(attrs, name, value ? '1' : '0')
}

function parseXml(xml: string) {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.getElementsByTagName('parsererror').length) throw new Error('Invalid Office XML.')
  return document.documentElement
}

function directChild(node: Element | null, name: string) {
  return directChildren(node).find((child) => localName(child) === name) ?? null
}

function directChildren(node: Element | null) {
  return node ? Array.from(node.children) : []
}

function localName(node: Element) {
  return node.localName || node.tagName.split(':').pop() || ''
}

function shapeIdOf(node: Element) {
  return (
    Array.from(node.getElementsByTagName('*'))
      .find((child) => localName(child) === 'cNvPr')
      ?.getAttribute('id') ?? null
  )
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
