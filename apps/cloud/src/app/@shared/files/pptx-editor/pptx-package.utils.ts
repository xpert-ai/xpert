import type JSZip from 'jszip'
import type { PptxSlide } from './pptx-file.utils'

const SLIDE_RELATIONSHIP_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide'
const SLIDE_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'

export async function syncPresentationSlides(zip: JSZip, slides: PptxSlide[], width?: number, height?: number) {
  const presentationPath = 'ppt/presentation.xml'
  const relationshipsPath = 'ppt/_rels/presentation.xml.rels'
  const presentationXml = await requiredXml(zip, presentationPath)
  const relationshipsXml = await requiredXml(zip, relationshipsPath)
  const presentation = parseXml(presentationXml)
  const relationships = parseXml(relationshipsXml)
  const slideList = descendants(presentation, 'sldIdLst')[0]
  if (!slideList) throw new Error('Presentation package does not contain a slide list.')
  const slideSize = descendants(presentation, 'sldSz')[0]
  if (slideSize && width && height) {
    slideSize.setAttribute('cx', String(Math.round(width)))
    slideSize.setAttribute('cy', String(Math.round(height)))
  }

  const relationElements = directChildren(relationships, 'Relationship')
  const relationPathById = new Map<string, string>()
  const relationByPath = new Map<string, Element>()
  for (const relation of relationElements) {
    const id = relation.getAttribute('Id')
    const target = relation.getAttribute('Target')
    if (!id || !target || relation.getAttribute('TargetMode') === 'External') continue
    const path = resolveZipPath(presentationPath, target)
    relationPathById.set(id, path)
    if (path.startsWith('ppt/slides/')) relationByPath.set(path, relation)
  }

  const existingSlideIdByPath = new Map<string, number>()
  for (const slideRef of directChildren(slideList, 'sldId')) {
    const relationId = slideRef.getAttribute('r:id')
    const path = relationId ? relationPathById.get(relationId) : null
    if (path) existingSlideIdByPath.set(path, Number(slideRef.getAttribute('id') ?? 0))
  }

  const currentPaths = new Set(slides.map((slide) => slide.path))
  const removedPaths = [...relationByPath.keys()].filter((path) => !currentPaths.has(path))
  for (const path of removedPaths) {
    relationByPath.get(path)?.remove()
    zip.remove(path)
    zip.remove(relationshipPath(path))
  }

  let nextRelationId =
    Math.max(0, ...relationElements.map((relation) => relationNumber(relation.getAttribute('Id')))) + 1
  for (const slide of slides) {
    if (relationByPath.has(slide.path)) continue
    const relation = relationships.ownerDocument.createElementNS(relationships.namespaceURI, 'Relationship')
    relation.setAttribute('Id', `rId${nextRelationId++}`)
    relation.setAttribute('Type', SLIDE_RELATIONSHIP_TYPE)
    relation.setAttribute('Target', slide.path.replace(/^ppt\//, ''))
    relationships.appendChild(relation)
    relationByPath.set(slide.path, relation)
  }

  let nextSlideId = Math.max(255, ...existingSlideIdByPath.values()) + 1
  slideList.replaceChildren()
  const relationshipNamespace = presentation.lookupNamespaceURI('r') ?? 'r'
  for (const slide of slides) {
    const relationId = relationByPath.get(slide.path)?.getAttribute('Id')
    if (!relationId) throw new Error(`Presentation relationship is missing for ${slide.path}.`)
    const slideRef = presentation.ownerDocument.createElementNS(slideList.namespaceURI, 'p:sldId')
    slideRef.setAttribute('id', String(existingSlideIdByPath.get(slide.path) || nextSlideId++))
    slideRef.setAttributeNS(relationshipNamespace, 'r:id', relationId)
    slideList.appendChild(slideRef)
  }

  zip.file(presentationPath, serializeXml(presentation))
  zip.file(relationshipsPath, serializeXml(relationships))
  await syncSlideContentTypes(zip, currentPaths)
}

export function relationshipPath(slidePath: string) {
  const parts = slidePath.split('/')
  const file = parts.pop()
  return `${parts.join('/')}/_rels/${file}.rels`
}

async function syncSlideContentTypes(zip: JSZip, currentPaths: Set<string>) {
  const contentTypesFile = zip.file('[Content_Types].xml')
  if (!contentTypesFile) return
  const contentTypes = parseXml(await contentTypesFile.async('text'))
  const overrideByPath = new Map<string, Element>()
  for (const override of directChildren(contentTypes, 'Override')) {
    const partName = override.getAttribute('PartName')?.replace(/^\//, '')
    if (!partName?.startsWith('ppt/slides/')) continue
    if (!currentPaths.has(partName)) override.remove()
    else overrideByPath.set(partName, override)
  }
  for (const path of currentPaths) {
    if (overrideByPath.has(path)) continue
    const override = contentTypes.ownerDocument.createElementNS(contentTypes.namespaceURI, 'Override')
    override.setAttribute('PartName', `/${path}`)
    override.setAttribute('ContentType', SLIDE_CONTENT_TYPE)
    contentTypes.appendChild(override)
  }
  zip.file('[Content_Types].xml', serializeXml(contentTypes))
}

function parseXml(xml: string) {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.getElementsByTagName('parsererror').length) throw new Error('Invalid Office XML.')
  return document.documentElement
}

function serializeXml(root: Element) {
  return new XMLSerializer().serializeToString(root)
}

function directChildren(node: Element, name: string) {
  return Array.from(node.children).filter((child) => localName(child) === name)
}

function descendants(node: Element, name: string) {
  return Array.from(node.getElementsByTagName('*')).filter((child) => localName(child) === name)
}

function localName(node: Element) {
  return node.localName || node.tagName.split(':').pop() || ''
}

function relationNumber(value: string | null) {
  const match = value?.match(/^rId(\d+)$/i)
  return match ? Number(match[1]) : 0
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
