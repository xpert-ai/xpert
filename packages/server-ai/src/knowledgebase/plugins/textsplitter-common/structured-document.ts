import { DocumentInterface } from '@langchain/core/documents'
import type { DocumentLayoutMetadata, KnowledgeChunkBlockType, KnowledgeChunkingWarning } from '@xpert-ai/contracts'
import type { ChunkMetadata } from '@xpert-ai/plugin-sdk'
import { Marked, type Token } from 'marked'
import { invalidKnowledgeParserConfig } from '../../../knowledge-document/parser-validation'
import { incompatibleKnowledgeChunkStructure } from '../../../knowledge-document/parser-validation'

export interface StructuredSource {
    document: DocumentInterface<ChunkMetadata>
    index: number
    layout?: DocumentLayoutMetadata
}

export interface StructuredUnit {
    kind: KnowledgeChunkBlockType
    source: StructuredSource
    start: number
    end: number
    text: string
    headingLevel?: number
    legacyHeading?: boolean
    /** Original source intervals used as natural split boundaries, not reconstructed Markdown. */
    parts?: Array<{ start: number; end: number }>
    headerEnd?: number
    fence?: { open: string; close: string; bodyStart: number; bodyEnd: number }
}

export interface StructuredDocument {
    sources: StructuredSource[]
    units: StructuredUnit[]
    warnings: KnowledgeChunkingWarning[]
}

const markdown = new Marked({
    gfm: true,
    extensions: [
        {
            name: 'formula',
            level: 'block',
            start: (text) => text.indexOf('$$'),
            tokenizer(text) {
                const match = /^\$\$(?:[^\n]+?\$\$[ \t]*(?:\n|$)|[ \t]*\n[\s\S]*?\n\$\$[ \t]*(?:\n|$))/.exec(text)
                if (match) return { type: 'formula', raw: match[0] }
            }
        }
    ]
})

/** Group only on an explicit document identity; unrelated fragments must never share a decision or heading. */
export function analyzeStructuredDocuments(documents: DocumentInterface<ChunkMetadata>[]): StructuredDocument[] {
    if (documents.reduce((sum, document) => sum + document.pageContent.length, 0) > 5_000_000) {
        throw invalidKnowledgeParserConfig('structured input (at most 5000000 characters)')
    }
    const groups: StructuredDocument[] = []
    const byDocument = new Map<string, StructuredDocument>()
    documents.forEach((document, index) => {
        const id = document.metadata.documentId
        let group = typeof id === 'string' && id ? byDocument.get(id) : undefined
        if (!group) {
            group = { sources: [], units: [], warnings: [] }
            groups.push(group)
            if (typeof id === 'string' && id) byDocument.set(id, group)
        }
        const source = { document, index }
        group.sources.push(source)
        if (document.metadata.mediaType && document.metadata.mediaType !== 'text') return
        if (document.metadata.parentId || document.metadata.type === 'parent' || document.metadata.type === 'child') {
            throw incompatibleKnowledgeChunkStructure()
        }
        if (document.metadata.searchContent !== undefined && document.metadata.searchContent !== document.pageContent) {
            throw invalidKnowledgeParserConfig('structured chunking requires unprojected converter text')
        }
        if (document.metadata.sourceMapping === 'coarse') group.warnings.push('coarse-provenance')
        group.units.push(...parseSource(source, group.warnings))
    })
    for (const group of groups) {
        if (group.units.length && group.units.every((unit) => unit.source.layout)) {
            group.units.sort(
                (left, right) =>
                    left.source.layout.page - right.source.layout.page ||
                    left.source.layout.order - right.source.layout.order ||
                    left.source.index - right.source.index ||
                    left.start - right.start
            )
        }
    }
    return groups
}

function parseSource(source: StructuredSource, warnings: KnowledgeChunkingWarning[]): StructuredUnit[] {
    const { pageContent, metadata } = source.document
    if (!pageContent.trim()) return []
    const format = metadata.contentFormat
    if (format !== undefined && format !== 'markdown' && format !== 'text') {
        throw invalidKnowledgeParserConfig('contentFormat')
    }
    const layout = parseLayout(metadata.documentLayout)
    source.layout = layout
    if (format === undefined && !layout) warnings.push('missing-format')
    if (format === 'markdown') return parseMarkdown(source, warnings)
    if (layout) {
        if (layout.type === 'title') {
            return [
                {
                    kind: 'heading',
                    source,
                    start: 0,
                    end: pageContent.length,
                    text: pageContent,
                    headingLevel: layout.headingLevel,
                    legacyHeading: false
                }
            ]
        }
        if (layout.type === 'table') {
            const parsed = parseMarkdown(source, warnings)
            if (parsed.some((unit) => unit.kind === 'table')) return parsed
            warnings.push('unsupported-structure')
        }
        const kind = layout.type === 'formula' ? 'formula' : layout.type === 'table' ? 'table' : 'paragraph'
        return [{ kind, source, start: 0, end: pageContent.length, text: pageContent }]
    }
    return [{ kind: 'paragraph', source, start: 0, end: pageContent.length, text: pageContent }]
}

function parseLayout(value: unknown): DocumentLayoutMetadata | undefined {
    if (value === undefined) return undefined
    if (
        !value ||
        typeof value !== 'object' ||
        !('schemaVersion' in value) ||
        value.schemaVersion !== 1 ||
        !('page' in value) ||
        typeof value.page !== 'number' ||
        !Number.isInteger(value.page) ||
        value.page < 1 ||
        !('pageWidth' in value) ||
        typeof value.pageWidth !== 'number' ||
        !Number.isFinite(value.pageWidth) ||
        !('pageHeight' in value) ||
        typeof value.pageHeight !== 'number' ||
        !Number.isFinite(value.pageHeight) ||
        !('blockId' in value) ||
        typeof value.blockId !== 'string' ||
        !('order' in value) ||
        typeof value.order !== 'number' ||
        !Number.isFinite(value.order) ||
        !('type' in value) ||
        typeof value.type !== 'string' ||
        ![
            'text',
            'title',
            'table',
            'image',
            'formula',
            'header',
            'footer',
            'footnote',
            'page-number',
            'seal',
            'other'
        ].includes(value.type) ||
        ('headingLevel' in value &&
            value.headingLevel !== undefined &&
            (typeof value.headingLevel !== 'number' ||
                !Number.isInteger(value.headingLevel) ||
                value.headingLevel < 1 ||
                value.headingLevel > 6))
    ) {
        throw invalidKnowledgeParserConfig('documentLayout')
    }
    return value as DocumentLayoutMetadata
}

function parseMarkdown(source: StructuredSource, warnings: KnowledgeChunkingWarning[]): StructuredUnit[] {
    const text = source.document.pageContent
    // Marked normalizes line endings. Map every normalized boundary back to the original evidence.
    const offsets: number[] = [0]
    let normalized = ''
    for (let index = 0; index < text.length; index++) {
        if (text[index] === '\r') {
            if (text[index + 1] === '\n') index++
            normalized += '\n'
        } else normalized += text[index]
        offsets.push(index + 1)
    }
    const units: StructuredUnit[] = []
    let cursor = 0
    const add = (kind: KnowledgeChunkBlockType, start: number, end: number): StructuredUnit => {
        const unit = {
            kind,
            source,
            start: offsets[start],
            end: offsets[end],
            text: text.slice(offsets[start], offsets[end])
        }
        units.push(unit)
        return unit
    }
    for (const token of markdown.lexer(normalized)) {
        const start = normalized.indexOf(token.raw, cursor)
        if (start < 0) {
            // A parser extension normalized non-line whitespace; retain the remaining source verbatim.
            add('other', cursor, normalized.length)
            warnings.push('unsupported-structure')
            cursor = normalized.length
            break
        }
        if (normalized.slice(cursor, start).trim()) add('other', cursor, start)
        cursor = start + token.raw.length
        if (token.type === 'space') continue
        const kind = tokenKind(token)
        const unit = add(kind, start, cursor)
        if (kind === 'heading' && 'depth' in token && typeof token.depth === 'number') {
            unit.headingLevel = token.depth
            unit.legacyHeading = /^#{1,6}\s/.test(token.raw)
        }
        if (kind === 'table') {
            const lines = lineRanges(unit)
            if (lines.length >= 2) {
                unit.headerEnd = lines[1].end
                unit.parts = lines.slice(2).filter((range) => text.slice(range.start, range.end).trim())
            }
        }
        if (kind === 'list' && 'items' in token && Array.isArray(token.items)) {
            let itemCursor = start
            unit.parts = []
            for (const item of token.items) {
                if (!item || typeof item !== 'object' || typeof item.raw !== 'string') continue
                const itemStart = normalized.indexOf(item.raw, itemCursor)
                if (itemStart < itemCursor || itemStart + item.raw.length > cursor) continue
                unit.parts.push({ start: offsets[itemStart], end: offsets[itemStart + item.raw.length] })
                itemCursor = itemStart + item.raw.length
            }
            let covered = unit.start
            const complete =
                unit.parts.every((part) => {
                    const gap = text.slice(covered, part.start)
                    covered = part.end
                    return !gap.trim()
                }) && !text.slice(covered, unit.end).trim()
            if (!complete) {
                unit.parts = undefined
                warnings.push('unsupported-structure')
            }
        }
        if (kind === 'code') {
            const opening = /^( {0,3})(`{3,}|~{3,})([^\r\n]*)\r?\n/.exec(unit.text)
            if (opening) {
                const lines = lineRanges(unit)
                const closing = lines[lines.length - 1]
                const closeText = text.slice(closing.start, closing.end).trim()
                const closed = new RegExp(`^${opening[2][0]}{${opening[2].length},}$`).test(closeText)
                unit.fence = {
                    open: opening[0].trimEnd(),
                    close: opening[2],
                    bodyStart: unit.start + opening[0].length,
                    bodyEnd: closed ? closing.start : unit.end
                }
                unit.parts = lines.filter(
                    (range) => range.start >= unit.fence.bodyStart && range.end <= unit.fence.bodyEnd
                )
                if (unit.parts.length) unit.parts[unit.parts.length - 1].end = unit.fence.bodyEnd
            } else unit.parts = lineRanges(unit)
        }
    }
    if (normalized.slice(cursor).trim()) add('other', cursor, normalized.length)
    return units
}

function tokenKind(token: Token): KnowledgeChunkBlockType {
    switch (token.type) {
        case 'heading':
            return 'heading'
        case 'table':
            return 'table'
        case 'list':
            return 'list'
        case 'code':
            return 'code'
        case 'formula':
            return 'formula'
        case 'paragraph':
        case 'text':
            return 'paragraph'
        default:
            return 'other'
    }
}

export function lineRanges(unit: Pick<StructuredUnit, 'text' | 'start'>) {
    const result: Array<{ start: number; end: number }> = []
    let offset = unit.start
    for (const line of unit.text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
        result.push({ start: offset, end: offset + line.length })
        offset += line.length
    }
    while (result.length && !unit.text.slice(result[result.length - 1].start - unit.start).trim()) result.pop()
    return result
}
