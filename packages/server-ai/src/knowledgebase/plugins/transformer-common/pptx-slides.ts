import { Document } from '@langchain/core/documents'
import { ChunkMetadata } from '@xpert-ai/plugin-sdk'
import fsPromises from 'fs/promises'
import JSZip from 'jszip'
import { DOMParser } from 'xmldom'
import { v4 as uuid } from 'uuid'

type ParagraphBlock = {
    type: 'paragraph'
    text: string
}

type TableBlock = {
    type: 'table'
    rows: string[][]
}

type PptxBlock = ParagraphBlock | TableBlock

type PackageRelationship = {
    id: string
    type: string
    target: string
}

/**
 * Why this exists: PPTXLoader asks officeparser for plain text. That reader
 * collects every a:p and never walks a:tbl/a:tr/a:tc, so knowledge chunking
 * only sees a paragraph and stays on recursive-character.
 * Invariants: slide order follows presentation.xml; graphicFrame tables become
 * Markdown; contentFormat is markdown so auto chunking can select structure-aware.
 * Decks with no table keep the previous plain-text loader.
 */
export async function loadPptxStructuredMarkdown(filePath: string): Promise<Document<ChunkMetadata>[] | null> {
    const buffer = await fsPromises.readFile(filePath)
    const zip = await JSZip.loadAsync(buffer)
    const slidePaths = await resolveSlidePaths(zip)
    if (!slidePaths.length) {
        return null
    }
    const blocks: PptxBlock[] = []
    for (const slidePath of slidePaths) {
        blocks.push(...(await readSlideBlocks(zip, slidePath)))
    }
    if (!blocks.some((block) => block.type === 'table')) {
        return null
    }
    const markdown = blocksToMarkdown(blocks)
    if (!markdown.includes('| ---')) {
        return null
    }
    return [
        new Document<ChunkMetadata>({
            pageContent: markdown,
            metadata: {
                chunkId: uuid(),
                chunkIndex: 0,
                source: filePath,
                parser: 'pptx-ooxml',
                contentFormat: 'markdown'
            }
        })
    ]
}

async function resolveSlidePaths(zip: JSZip): Promise<string[]> {
    const presentationXml = await readZipText(zip, 'ppt/presentation.xml')
    const relsXml = await readZipText(zip, 'ppt/_rels/presentation.xml.rels')
    if (presentationXml && relsXml) {
        const byId = new Map(readRelationships(relsXml).map((item) => [item.id, item.target]))
        const ordered: string[] = []
        for (const slideId of elementsByLocalName(parseXml(presentationXml), 'sldId')) {
            const relationId = relationshipAttribute(slideId)
            const target = relationId ? byId.get(relationId) : undefined
            if (!target) {
                continue
            }
            const slidePath = resolvePartPath('ppt/presentation.xml', target)
            if (!slidePath || !zip.file(slidePath) || ordered.includes(slidePath)) {
                continue
            }
            ordered.push(slidePath)
        }
        if (ordered.length) {
            return ordered
        }
    }
    return Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((left, right) => slideNumber(left) - slideNumber(right) || left.localeCompare(right))
}

async function readSlideBlocks(zip: JSZip, slidePath: string): Promise<PptxBlock[]> {
    const xml = await readZipText(zip, slidePath)
    if (!xml) {
        return []
    }
    const blocks: PptxBlock[] = []
    const tree = firstElementByLocalName(parseXml(xml), 'spTree')
    if (tree) {
        readShapes(tree, blocks)
    }
    blocks.push(...(await readNoteBlocks(zip, slidePath)))
    return blocks
}

async function readNoteBlocks(zip: JSZip, slidePath: string): Promise<PptxBlock[]> {
    const relsXml = await readZipText(zip, relsPathFor(slidePath))
    if (!relsXml) {
        return []
    }
    const notes = readRelationships(relsXml).find((item) => item.type.endsWith('/notesSlide'))
    if (!notes) {
        return []
    }
    const notesPath = resolvePartPath(slidePath, notes.target)
    if (!notesPath) {
        return []
    }
    const notesXml = await readZipText(zip, notesPath)
    if (!notesXml) {
        return []
    }
    const blocks: PptxBlock[] = []
    const tree = firstElementByLocalName(parseXml(notesXml), 'spTree')
    if (tree) {
        readShapes(tree, blocks)
    }
    return blocks
}

function readShapes(container: Element, blocks: PptxBlock[]) {
    for (const child of elementChildren(container)) {
        const name = localName(child)
        if (name === 'grpSp' || name === 'spTree') {
            readShapes(child, blocks)
            continue
        }
        if (name === 'AlternateContent') {
            const alternatives = elementChildren(child)
            let supported = false
            for (const choice of alternatives.filter((item) => localName(item) === 'Choice')) {
                const candidate: PptxBlock[] = []
                readShapes(choice, candidate)
                if (candidate.length) {
                    blocks.push(...candidate)
                    supported = true
                    break
                }
            }
            if (!supported) {
                const fallback = alternatives.find((item) => localName(item) === 'Fallback')
                if (fallback) readShapes(fallback, blocks)
            }
            continue
        }
        if (name === 'graphicFrame') {
            const table = readTable(child)
            if (table) {
                blocks.push(table)
                continue
            }
        }
        if (name !== 'sp' && name !== 'cxnSp' && name !== 'graphicFrame') {
            continue
        }
        const text = readTextBody(child)
        if (text) {
            blocks.push({ type: 'paragraph', text })
        }
    }
}

function readTable(frame: Element): TableBlock | null {
    const table = elementsByLocalName(frame, 'tbl')[0]
    if (!table) {
        return null
    }
    const rows: string[][] = []
    for (const row of elementChildren(table).filter((child) => localName(child) === 'tr')) {
        const cells: string[] = []
        let coveredColumns = 0
        for (const cell of elementChildren(row).filter((child) => localName(child) === 'tc')) {
            // gridSpan already emitted these columns; physical hMerge cells must not add them again.
            if (coveredColumns > 0 && hasMergeFlag(cell, 'hMerge')) {
                coveredColumns -= 1
                continue
            }
            cells.push(isMergeContinuation(cell) ? '' : readTextBody(cell))
            const span = readGridSpan(cell)
            for (let index = 1; index < span; index += 1) {
                cells.push('')
            }
            coveredColumns = span - 1
        }
        if (cells.some((cell) => cell.trim())) {
            rows.push(cells)
        }
    }
    return rows.length ? { type: 'table', rows } : null
}

function blocksToMarkdown(blocks: PptxBlock[]) {
    const lines: string[] = []
    for (const block of blocks) {
        if (block.type === 'table') {
            appendBlankLine(lines)
            lines.push(...tableToMarkdown(block.rows))
            appendBlankLine(lines)
            continue
        }
        if (!block.text) {
            continue
        }
        appendBlankLine(lines)
        lines.push(escapePlainParagraph(block.text))
    }
    return lines
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

function tableToMarkdown(rows: string[][]) {
    const width = Math.max(...rows.map((row) => row.length))
    const normalized = rows.map((row) => [...row, ...Array.from({ length: Math.max(0, width - row.length) }, () => '')])
    const [header, ...body] = normalized
    return [
        `| ${header.map((cell) => escapeTableCell(cell)).join(' | ')} |`,
        `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
        ...body.map((row) => `| ${row.map((cell) => escapeTableCell(cell)).join(' | ')} |`)
    ]
}

function readTextBody(node: Element) {
    const paragraphs = ownTextBodies(node).flatMap((body) =>
        elementChildren(body).filter((child) => localName(child) === 'p')
    )
    return paragraphs
        .map((paragraph) => normalizeText(readParagraphText(paragraph)))
        .filter(Boolean)
        .join('\n')
        .trim()
}

function ownTextBodies(node: Element): Element[] {
    const found: Element[] = []
    for (const child of elementChildren(node)) {
        const name = localName(child)
        if (name === 'txBody') {
            found.push(child)
            continue
        }
        if (name === 'tbl' || name === 'graphicFrame' || name === 'Fallback') {
            continue
        }
        found.push(...ownTextBodies(child))
    }
    return found
}

function readParagraphText(paragraph: Element) {
    const pieces: string[] = []
    appendInlineText(paragraph, pieces)
    return pieces.join('')
}

function appendInlineText(node: Element, pieces: string[]) {
    for (const child of elementChildren(node)) {
        const name = localName(child)
        if (name === 't') {
            pieces.push(elementText(child))
            continue
        }
        if (name === 'br' || name === 'cr') {
            pieces.push('\n')
            continue
        }
        if (name === 'tbl' || name === 'graphicFrame' || name === 'Fallback') {
            continue
        }
        appendInlineText(child, pieces)
    }
}

function isMergeContinuation(cell: Element) {
    return hasMergeFlag(cell, 'hMerge') || hasMergeFlag(cell, 'vMerge')
}

function hasMergeFlag(cell: Element, name: 'hMerge' | 'vMerge') {
    const value = cell.getAttribute(name)
    if (value) return value === '1' || value === 'true'
    return elementChildren(cell).some((child) => localName(child) === name)
}

function readGridSpan(cell: Element) {
    const raw = cell.getAttribute('gridSpan') ?? attributeByLocalName(cell, 'gridSpan')
    const span = Number(raw)
    return Number.isInteger(span) && span > 1 ? span : 1
}

function escapePlainParagraph(value: string) {
    return value
        .split('\n')
        .map((line) =>
            line
                .replace(/\|/g, '\\|')
                .replace(
                    /^(\s{0,3})(#{1,6}(?:\s|$)|[-+*]\s|>|\d+[.)]\s|`{3,}|~{3,}|[-*_](?:\s*[-*_]){2,}\s*$|[=-]+\s*$|<)/,
                    '$1\\$2'
                )
        )
        .join('\n')
}

function escapeTableCell(value: string) {
    return value.replace(/\|/g, '\\|').replace(/\n+/g, '<br>')
}

function normalizeText(value: string) {
    return value
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim()
}

async function readZipText(zip: JSZip, filePath: string) {
    const file = zip.file(filePath)
    if (!file) {
        return null
    }
    return file.async('string')
}

function readRelationships(xml: string): PackageRelationship[] {
    return elementsByLocalName(parseXml(xml), 'Relationship')
        .map((node) => ({
            id: node.getAttribute('Id') ?? '',
            type: node.getAttribute('Type') ?? '',
            target: node.getAttribute('Target') ?? ''
        }))
        .filter((item) => item.id && item.target)
}

function relsPathFor(partPath: string) {
    const segments = partPath.split('/')
    const fileName = segments.pop() ?? ''
    return [...segments, '_rels', `${fileName}.rels`].join('/')
}

function resolvePartPath(fromPath: string, target: string) {
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
        return null
    }
    if (target.startsWith('/')) {
        return target.replace(/^\/+/, '')
    }
    const segments = fromPath.split('/').slice(0, -1)
    for (const part of target.split('/')) {
        if (!part || part === '.') {
            continue
        }
        if (part === '..') {
            segments.pop()
            continue
        }
        segments.push(part)
    }
    return segments.join('/')
}

function relationshipAttribute(node: Element) {
    const named = node.getAttribute('r:id')
    if (named) {
        return named
    }
    if (!node.attributes) {
        return undefined
    }
    for (const attribute of Array.from(node.attributes)) {
        const local = attribute.localName || attribute.name.split(':').pop()
        if (local === 'id' && attribute.name.includes(':')) {
            return attribute.value
        }
    }
    return undefined
}

function slideNumber(filePath: string) {
    const match = filePath.match(/slide(\d+)\.xml$/i)
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

function parseXml(value: string) {
    return new DOMParser().parseFromString(value, 'application/xml')
}

function elementChildren(node: Node): Element[] {
    return Array.from(node.childNodes ?? []).filter((child): child is Element => child.nodeType === 1)
}

function elementsByLocalName(node: Node, name: string): Element[] {
    const result: Element[] = []
    for (const child of elementChildren(node)) {
        if (localName(child) === name) {
            result.push(child)
        }
        result.push(...elementsByLocalName(child, name))
    }
    return result
}

function firstElementByLocalName(node: Node, name: string) {
    return elementsByLocalName(node, name)[0]
}

function attributeByLocalName(node: Element, name: string) {
    if (!node.attributes) {
        return undefined
    }
    for (const attribute of Array.from(node.attributes)) {
        const local = attribute.localName || attribute.name.split(':').pop()
        if (local === name) {
            return attribute.value
        }
    }
    return undefined
}

function elementText(node: Element) {
    if (typeof node.textContent === 'string') {
        return node.textContent
    }
    return Array.from(node.childNodes ?? [])
        .filter((child) => child.nodeType === 3)
        .map((child) => child.nodeValue ?? '')
        .join('')
}

function localName(node: Element) {
    return node.localName || node.nodeName.split(':').pop() || node.nodeName
}

function appendBlankLine(lines: string[]) {
    if (lines.length && lines[lines.length - 1] !== '') {
        lines.push('')
    }
}
