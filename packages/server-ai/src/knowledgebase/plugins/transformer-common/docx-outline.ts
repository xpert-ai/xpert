import { Document } from '@langchain/core/documents'
import { TDocumentAsset } from '@xpert-ai/contracts'
import { ChunkMetadata } from '@xpert-ai/plugin-sdk'
import fsPromises from 'fs/promises'
import JSZip from 'jszip'
import { DOMParser } from 'xmldom'
import { v4 as uuid } from 'uuid'

type DocxEmbeddedImageInput = {
    data: Buffer
    extension: string
    relationshipId: string
    order: number
    altText?: string
}

export type DocxStructuredMarkdownResult = {
    documents: Document<ChunkMetadata>[]
    assets: TDocumentAsset[]
}

export type DocxStructuredMarkdownOptions = {
    writeImage?: (image: DocxEmbeddedImageInput) => Promise<Pick<TDocumentAsset, 'url' | 'filePath'>>
}

type EmbeddedImageRef = {
    relationshipId: string
    occurrenceId: string
    altText?: string
}

// Minimal OOXML block model used to preserve headings, TOC entries, and tables.
type ParagraphBlock = {
    type: 'paragraph'
    text: string
    headingLevel?: number
    tocLevel?: number
    images: EmbeddedImageRef[]
}

type TableCell = {
    text: string
    images: EmbeddedImageRef[]
}

type TableBlock = {
    type: 'table'
    rows: TableCell[][]
}

type DocxBlock = ParagraphBlock | TableBlock

type StyleInfo = {
    headingLevel?: number
    tocLevel?: number
}

type RelationshipInfo = {
    id: string
    target: string
    targetMode?: string
}

type ReadContext = {
    imageCount: number
}

/**
 * Reads DOCX directly when the generic loader collapses table-of-contents
 * entries into isolated page numbers and loses heading structure.
 */
export async function loadDocxStructuredMarkdown(
    filePath: string,
    options: DocxStructuredMarkdownOptions = {}
): Promise<DocxStructuredMarkdownResult | null> {
    const buffer = await fsPromises.readFile(filePath)
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file('word/document.xml')?.async('string')
    if (!documentXml) {
        return null
    }

    const styles = await loadStyleMap(zip)
    const relationships = await loadRelationshipMap(zip)
    const document = parseXml(documentXml)
    const body = firstElementByLocalName(document, 'body')
    if (!body) {
        return null
    }

    const context: ReadContext = { imageCount: 0 }
    const blocks = elementChildren(body)
        .map((node) => readBlock(node, styles, context))
        .filter((block): block is DocxBlock => !!block)
    const resolvedImages = await writeEmbeddedImages(zip, relationships, collectBlockImages(blocks), options)
    const markdown = blocksToMarkdown(blocks, resolvedImages.byOccurrenceId)
    if (!hasUsefulStructure(markdown) && !resolvedImages.assets.length) {
        return null
    }

    return {
        documents: [
            new Document<ChunkMetadata>({
                pageContent: markdown,
                metadata: {
                    chunkId: uuid(),
                    chunkIndex: 0,
                    parser: 'docx-ooxml',
                    outlineEnhanced: true,
                    assets: resolvedImages.assets
                }
            })
        ],
        assets: resolvedImages.assets
    }
}

async function loadStyleMap(zip: JSZip) {
    const stylesXml = await zip.file('word/styles.xml')?.async('string')
    const styles = new Map<string, StyleInfo>()
    if (!stylesXml) {
        return styles
    }

    const styleNodes = elementsByLocalName(parseXml(stylesXml), 'style')
    for (const style of styleNodes) {
        if (attribute(style, 'type') !== 'paragraph') {
            continue
        }

        const styleId = attribute(style, 'styleId')
        if (!styleId) {
            continue
        }

        // Word stores TOC/heading semantics in styles; the rendered text alone is not enough.
        const name = attribute(firstElementByLocalName(style, 'name'), 'val') ?? ''
        const styleText = `${styleId} ${name}`.toLowerCase()
        const headingLevel = readStyleLevel(styleText, /heading\s*(\d)/, /标题\s*(\d)/)
        const tocLevel = readStyleLevel(styleText, /toc\s*(\d)/, /目录\s*(\d)/)
        if (headingLevel || tocLevel) {
            styles.set(styleId, {
                ...(headingLevel ? { headingLevel } : {}),
                ...(tocLevel ? { tocLevel } : {})
            })
        }
    }
    return styles
}

function readBlock(node: Element, styles: Map<string, StyleInfo>, context: ReadContext): DocxBlock | null {
    const name = localName(node)
    if (name === 'p') {
        return readParagraph(node, styles, context)
    }
    if (name === 'tbl') {
        return readTable(node, context)
    }
    return null
}

function readParagraph(node: Element, styles: Map<string, StyleInfo>, context: ReadContext): ParagraphBlock | null {
    const text = normalizeParagraphText(readText(node))
    const images = collectImageRefs(node, context)
    if (!text && !images.length) {
        return null
    }

    const styleId = attribute(firstElementByLocalName(firstElementByLocalName(node, 'pPr'), 'pStyle'), 'val')
    const style = styleId ? styles.get(styleId) : undefined
    const fallbackHeading = styleId ? readStyleLevel(styleId.toLowerCase(), /heading\s*(\d)/, /标题\s*(\d)/) : undefined
    const fallbackToc = styleId ? readStyleLevel(styleId.toLowerCase(), /toc\s*(\d)/, /目录\s*(\d)/) : undefined

    return {
        type: 'paragraph',
        text,
        headingLevel: style?.headingLevel ?? fallbackHeading,
        tocLevel: style?.tocLevel ?? fallbackToc,
        images
    }
}

function readTable(node: Element, context: ReadContext): TableBlock | null {
    const rows = elementChildren(node)
        .filter((child) => localName(child) === 'tr')
        .map((row) =>
            elementChildren(row)
                .filter((cell) => localName(cell) === 'tc')
                .map((cell) => ({
                    text: normalizeParagraphText(readText(cell)),
                    images: collectImageRefs(cell, context)
                }))
        )
        .filter((row) => row.some((cell) => cell.text || cell.images.length))

    return rows.length ? { type: 'table', rows } : null
}

function blocksToMarkdown(blocks: DocxBlock[], images: Map<string, TDocumentAsset>) {
    const lines: string[] = []
    let previousWasToc = false

    for (const block of blocks) {
        if (block.type === 'table') {
            appendBlankLine(lines)
            lines.push(...tableToMarkdown(block.rows, images))
            appendBlankLine(lines)
            previousWasToc = false
            continue
        }

        const imageLines = block.images.map((image) => imageToMarkdown(image, images)).filter(Boolean)
        if (block.tocLevel) {
            // Emit TOC rows as lists so the title and page number stay attached.
            if (!previousWasToc) {
                appendBlankLine(lines)
            }
            if (block.text) {
                lines.push(`${'  '.repeat(Math.max(0, block.tocLevel - 1))}- ${formatTocText(block.text)}`)
            }
            lines.push(...imageLines)
            previousWasToc = true
            continue
        }

        appendBlankLine(lines)
        if (block.headingLevel && block.text) {
            lines.push(`${'#'.repeat(Math.min(Math.max(block.headingLevel, 1), 6))} ${block.text}`)
        } else if (block.text) {
            lines.push(block.text)
        }
        lines.push(...imageLines)
        previousWasToc = false
    }

    return lines
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

function tableToMarkdown(rows: TableCell[][], images: Map<string, TDocumentAsset>) {
    const width = Math.max(...rows.map((row) => row.length))
    const emptyCell = () => ({ text: '', images: [] }) satisfies TableCell
    const normalizedRows = rows.map((row) => [
        ...row,
        ...Array.from({ length: Math.max(0, width - row.length) }, emptyCell)
    ])
    const [header, ...body] = normalizedRows
    const result = [
        `| ${header.map((cell) => escapeTableCell(cellToMarkdown(cell, images))).join(' | ')} |`,
        `| ${Array(width).fill('---').join(' | ')} |`
    ]
    result.push(
        ...body.map((row) => `| ${row.map((cell) => escapeTableCell(cellToMarkdown(cell, images))).join(' | ')} |`)
    )
    return result
}

function cellToMarkdown(cell: TableCell, images: Map<string, TDocumentAsset>) {
    return [cell.text, ...cell.images.map((image) => imageToMarkdown(image, images)).filter(Boolean)]
        .filter(Boolean)
        .join('<br>')
}

function imageToMarkdown(image: EmbeddedImageRef, images: Map<string, TDocumentAsset>) {
    const asset = images.get(image.occurrenceId)
    if (!asset) {
        return null
    }
    return `![${asset.altText ?? image.altText ?? 'Image'}](${asset.url})`
}

function collectImageRefs(node: Element, context: ReadContext): EmbeddedImageRef[] {
    const refs: EmbeddedImageRef[] = []
    for (const element of elementsByLocalNameAny(node, ['blip', 'imagedata'])) {
        const relationshipId = attributeByLocalName(element, 'embed') ?? attributeByLocalName(element, 'id')
        if (!relationshipId) {
            continue
        }
        refs.push({
            relationshipId,
            occurrenceId: `docx-image-${++context.imageCount}`,
            altText: readImageAltText(element)
        })
    }
    return refs
}

function collectBlockImages(blocks: DocxBlock[]) {
    const images: EmbeddedImageRef[] = []
    for (const block of blocks) {
        if (block.type === 'paragraph') {
            images.push(...block.images)
            continue
        }
        for (const row of block.rows) {
            for (const cell of row) {
                images.push(...cell.images)
            }
        }
    }
    return images
}

async function writeEmbeddedImages(
    zip: JSZip,
    relationships: Map<string, RelationshipInfo>,
    images: EmbeddedImageRef[],
    options: DocxStructuredMarkdownOptions
) {
    const assets: TDocumentAsset[] = []
    const byOccurrenceId = new Map<string, TDocumentAsset>()
    if (!options.writeImage) {
        return { assets, byOccurrenceId }
    }

    for (const image of images) {
        const relationship = relationships.get(image.relationshipId)
        if (!relationship || relationship.targetMode === 'External') {
            continue
        }
        const mediaPath = normalizeDocxRelationshipTarget(relationship.target)
        const media = mediaPath ? zip.file(mediaPath) : null
        if (!media) {
            continue
        }

        const order = assets.length
        const extension = fileExtension(mediaPath) || 'png'
        const written = await options.writeImage({
            data: await media.async('nodebuffer'),
            extension,
            relationshipId: image.relationshipId,
            order,
            altText: image.altText
        })
        const asset = {
            type: 'image',
            ...written,
            sourceType: 'docx_embedded_image',
            order,
            ...(image.altText ? { altText: image.altText } : {})
        } satisfies TDocumentAsset
        assets.push(asset)
        byOccurrenceId.set(image.occurrenceId, asset)
    }

    return { assets, byOccurrenceId }
}

async function loadRelationshipMap(zip: JSZip) {
    const relationshipXml = await zip.file('word/_rels/document.xml.rels')?.async('string')
    const relationships = new Map<string, RelationshipInfo>()
    if (!relationshipXml) {
        return relationships
    }

    for (const relation of elementsByLocalName(parseXml(relationshipXml), 'Relationship')) {
        const id = attributeByLocalName(relation, 'Id')
        const target = attributeByLocalName(relation, 'Target')
        if (!id || !target) {
            continue
        }
        relationships.set(id, {
            id,
            target,
            targetMode: attributeByLocalName(relation, 'TargetMode')
        })
    }
    return relationships
}

function readText(node: Element): string {
    const pieces: string[] = []
    collectText(node, pieces)
    return pieces.join('')
}

function collectText(node: Node, pieces: string[]) {
    if (node.nodeType === 1) {
        const element = node as Element
        const name = localName(element)
        if (name === 'instrText' || name === 'fldChar') {
            // Field instructions are Word control text, not user-visible document content.
            return
        }
        if (name === 'tab') {
            pieces.push('\t')
            return
        }
        if (name === 'br' || name === 'cr') {
            pieces.push('\n')
            return
        }
    }

    if (node.nodeType === 3) {
        const parent = node.parentNode
        if (parent?.nodeType === 1 && ['t', 'delText'].includes(localName(parent as Element))) {
            pieces.push(node.nodeValue ?? '')
        }
        return
    }

    for (const child of childNodes(node)) {
        collectText(child, pieces)
    }
}

function normalizeParagraphText(value: string) {
    return value
        .replace(/\u00a0/g, ' ')
        .replace(/[ \f\r\v]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\t+/g, '\t')
        .trim()
}

function formatTocText(value: string) {
    return value.replace(/\t+/g, ' ...... ')
}

function readStyleLevel(value: string, ...patterns: RegExp[]) {
    for (const pattern of patterns) {
        const match = value.match(pattern)
        if (match?.[1]) {
            const level = Number(match[1])
            if (Number.isInteger(level) && level >= 1 && level <= 9) {
                return level
            }
        }
    }
    return undefined
}

function hasUsefulStructure(markdown: string) {
    return /^#{1,6}\s+/m.test(markdown) || /^(\s*)-\s+.+\.{2,}.+/m.test(markdown) || markdown.includes('| ---')
}

function parseXml(value: string) {
    return new DOMParser().parseFromString(value, 'application/xml')
}

function elementChildren(node: Node): Element[] {
    return childNodes(node).filter((child): child is Element => child.nodeType === 1)
}

function elementsByLocalName(node: Node, name: string): Element[] {
    const result: Element[] = []
    for (const child of childNodes(node)) {
        if (child.nodeType === 1) {
            const element = child as Element
            if (localName(element) === name) {
                result.push(element)
            }
        }
        result.push(...elementsByLocalName(child, name))
    }
    return result
}

function elementsByLocalNameAny(node: Node, names: string[]): Element[] {
    const allowed = new Set(names)
    const result: Element[] = []
    for (const child of childNodes(node)) {
        if (child.nodeType === 1) {
            const element = child as Element
            if (allowed.has(localName(element))) {
                result.push(element)
            }
        }
        result.push(...elementsByLocalNameAny(child, names))
    }
    return result
}

function childNodes(node: Node) {
    return node.childNodes ? Array.from(node.childNodes) : []
}

function firstElementByLocalName(node: Node | null | undefined, name: string): Element | undefined {
    if (!node) {
        return undefined
    }
    return elementsByLocalName(node, name)[0]
}

function attribute(node: Element | null | undefined, name: string) {
    if (!node) {
        return undefined
    }
    return node.getAttribute(`w:${name}`) ?? node.getAttribute(name) ?? undefined
}

function attributeByLocalName(node: Element | null | undefined, name: string) {
    if (!node?.attributes) {
        return undefined
    }
    for (const attribute of Array.from(node.attributes)) {
        const local = attribute.localName || attribute.name.split(':').pop() || attribute.name
        if (local === name) {
            return attribute.value
        }
    }
    return undefined
}

function readImageAltText(node: Element) {
    const direct = attributeByLocalName(node, 'descr') ?? attributeByLocalName(node, 'title')
    if (direct) {
        return direct
    }

    let parent: Node | null = node.parentNode
    let depth = 0
    while (parent && depth < 8) {
        if (parent.nodeType === 1) {
            const docPr = firstElementByLocalName(parent, 'docPr')
            const title =
                attributeByLocalName(docPr, 'descr') ??
                attributeByLocalName(docPr, 'title') ??
                attributeByLocalName(docPr, 'name')
            if (title) {
                return title
            }
        }
        parent = parent.parentNode
        depth++
    }
    return undefined
}

function normalizeDocxRelationshipTarget(target: string) {
    if (!target || /^[a-z]+:/i.test(target)) {
        return null
    }
    const parts = (target.startsWith('/') ? target.slice(1) : `word/${target}`)
        .split('/')
        .filter((part) => part && part !== '.')
    const normalized: string[] = []
    for (const part of parts) {
        if (part === '..') {
            normalized.pop()
        } else {
            normalized.push(part)
        }
    }
    return normalized.join('/')
}

function fileExtension(filePath: string) {
    const fileName = filePath.split('/').pop() ?? ''
    const index = fileName.lastIndexOf('.')
    return index >= 0 ? fileName.slice(index + 1).toLowerCase() : ''
}

function localName(node: Element) {
    return node.localName || node.nodeName.split(':').pop() || node.nodeName
}

function appendBlankLine(lines: string[]) {
    if (lines.length && lines[lines.length - 1] !== '') {
        lines.push('')
    }
}

function escapeTableCell(value: string) {
    return value.replace(/\|/g, '\\|').replace(/\n+/g, '<br>')
}
