import { Document } from '@langchain/core/documents'
import { BadRequestException } from '@nestjs/common'
import type {
    KnowledgeChunkingDecision,
    KnowledgeChunkingWarning,
    KnowledgeChunkSourceRange,
    TDocumentAsset
} from '@xpert-ai/contracts'
import { countTextTokens, type ChunkMetadata } from '@xpert-ai/plugin-sdk'
import { v4 as uuid } from 'uuid'
import { splitTextByTokens } from '../../../knowledge-document/token-limited-chunks'
import { invalidKnowledgeParserConfig } from '../../../knowledge-document/parser-validation'
import type { StructuredDocument, StructuredSource, StructuredUnit } from './structured-document'

interface Fragment {
    source: StructuredSource
    start: number
    end: number
}

const content = (fragment: Fragment) => fragment.source.document.pageContent.slice(fragment.start, fragment.end)
const range = (fragment: Fragment): KnowledgeChunkSourceRange => ({
    sourceIndex: fragment.source.index,
    startOffset: fragment.start,
    endOffset: fragment.end
})

/** Structural packing owns boundaries; the existing token limiter remains the final invariant check. */
export function createStructureChunks(
    document: StructuredDocument,
    decision: KnowledgeChunkingDecision,
    target: number,
    overlap: number,
    maxTokens?: number,
    separators: string[] = ['\n\n', '\n', ' ', '']
): Document<ChunkMetadata>[] {
    const output: Document<ChunkMetadata>[] = []
    let headings: StructuredUnit[] = []
    let pending: StructuredUnit[] = []
    const fits = (text: string) => !maxTokens || countTextTokens(text) <= maxTokens
    const render = (body: Fragment[], context: Fragment[], suffix = '') => {
        let text = ''
        let previous: Fragment | undefined
        for (const fragment of [...context, ...body]) {
            const part = content(fragment)
            let separator = !text || text.endsWith('\n') || part.startsWith('\n') ? '' : '\n'
            if (previous?.source.index === fragment.source.index && previous.end <= fragment.start) {
                const gap = fragment.source.document.pageContent.slice(previous.end, fragment.start)
                if (!gap.trim()) separator = gap
            }
            text += separator + part
            previous = fragment
        }
        return suffix ? text + (text.endsWith('\n') ? '' : '\n') + suffix : text
    }

    function emit(
        body: Fragment[],
        context: Fragment[],
        warnings: KnowledgeChunkingWarning[] = [],
        suffix = '',
        continued = false
    ) {
        const pageContent = render(body, context, suffix)
        if (!pageContent.trim()) return
        if (!fits(pageContent)) throw invalidKnowledgeParserConfig('structured token budget')
        if (output.length >= 10000) throw invalidKnowledgeParserConfig('structured output (at most 10000 chunks)')
        const provenance = fragmentProvenance(body)
        const original = body[0].source.document.metadata
        const {
            markdownSourceMap,
            documentLayout,
            startOffset,
            endOffset,
            chunking,
            children,
            page,
            pageStart,
            pageEnd,
            sourceBlockIds,
            assets,
            searchContent,
            ...metadata
        } = original
        const exact =
            body.length === 1 &&
            original.sourceMapping !== 'coarse' &&
            !context.length &&
            !suffix &&
            body[0].source.document.pageContent.slice(body[0].start, body[0].end) === pageContent
        output.push(
            new Document({
                pageContent,
                metadata: {
                    ...metadata,
                    ...provenance,
                    ...(searchContent !== undefined ? { searchContent: pageContent } : {}),
                    chunkId: uuid(),
                    chunkIndex: output.length,
                    tokens: countTextTokens(pageContent),
                    ...(exact ? { startOffset: body[0].start, endOffset: body[0].end } : {}),
                    chunking: {
                        inputHash: decision.inputHash,
                        requestedStrategy: decision.requestedStrategy,
                        resolvedStrategy: decision.resolvedStrategy,
                        reason: decision.reason,
                        algorithmVersion: decision.algorithmVersion,
                        headingPath: headings.map((heading) => content(heading).trim()),
                        sourceRanges: body
                            .filter((fragment) => fragment.source.document.metadata.sourceMapping !== 'coarse')
                            .map(range),
                        ...(context.length
                            ? {
                                  contextRanges: context
                                      .filter(
                                          (fragment) => fragment.source.document.metadata.sourceMapping !== 'coarse'
                                      )
                                      .map(range)
                              }
                            : {}),
                        warnings: [...new Set([...document.warnings, ...warnings])],
                        ...(continued ? { continued: true } : {})
                    }
                }
            })
        )
        decision.warnings = [...new Set([...decision.warnings, ...warnings, ...document.warnings])]
    }

    function bounded(
        fragment: Fragment,
        contexts: Fragment[],
        suffix = '',
        allowOverlap = false,
        onContextsReady?: (retained: Fragment[]) => void
    ) {
        if (fits(render([fragment], contexts, suffix))) {
            onContextsReady?.(contexts)
            emit([fragment], contexts, [], suffix)
            return
        }
        let context = [...contexts]
        let ending = suffix
        let budget = maxTokens - countTextTokens(render([], context, ending)) - 4
        const warnings: KnowledgeChunkingWarning[] = ['structure-split']
        while (context.length && budget < Math.min(8, maxTokens)) {
            context.shift()
            warnings.push('context-reduced')
            budget = maxTokens - countTextTokens(render([], context, ending)) - 4
        }
        if (budget < 1) {
            context = []
            ending = ''
            budget = maxTokens
            warnings.push('context-reduced')
        }
        const originalText = fragment.source.document.pageContent.slice(fragment.start, fragment.end)
        const splitWithinBudget = () => {
            try {
                return splitTextByTokens(originalText, budget)
            } catch (error) {
                // Optional context must not prevent a Unicode character that fits the full budget.
                if (!(error instanceof BadRequestException) || (!context.length && !ending)) throw error
                context = []
                ending = ''
                budget = maxTokens
                warnings.push('context-reduced')
                return splitTextByTokens(originalText, budget)
            }
        }
        let parts = splitWithinBudget()
        // Tokenization at a context/body boundary is not additive. Verify the complete emitted text.
        while (
            parts.some(
                (part) =>
                    !fits(
                        render(
                            [
                                {
                                    ...fragment,
                                    start: fragment.start + part.start,
                                    end: fragment.start + part.end
                                }
                            ],
                            context,
                            ending
                        )
                    )
            )
        ) {
            if (budget <= 1) {
                context = []
                ending = ''
                budget = maxTokens
                warnings.push('context-reduced')
            } else budget--
            parts = splitWithinBudget()
        }
        onContextsReady?.(context)
        for (let index = 0; index < parts.length; index++) {
            const part = parts[index]
            const piece = { ...fragment, start: fragment.start + part.start, end: fragment.start + part.end }
            if (allowOverlap && overlap > 0 && index > 0) {
                let overlapStart = Math.max(fragment.start, piece.start - overlap)
                const text = fragment.source.document.pageContent
                if (overlapStart > 0 && /[\uDC00-\uDFFF]/.test(text[overlapStart])) overlapStart++
                if (fits(render([{ ...piece, start: overlapStart }], context, ending))) piece.start = overlapStart
            }
            emit([piece], context, warnings, ending, true)
        }
    }

    function reduceTableContext(fragment: Fragment, contexts: Fragment[]) {
        const retained = [...contexts]
        // Drop ancestor headings first, then the repeated table header, before splitting a row.
        while (retained.length && !fits(render([fragment], retained))) retained.shift()
        return retained
    }

    function emitTable(unit: StructuredUnit, contexts: Fragment[]) {
        const wholeContext = reduceTableContext(unit, contexts)
        if (fits(render([unit], wholeContext))) {
            emit([unit], wholeContext, wholeContext.length < contexts.length ? ['context-reduced'] : [])
            return
        }
        if (unit.headerEnd === undefined || !unit.parts?.length) {
            bounded(unit, contexts)
            return
        }

        const header: Fragment = { source: unit.source, start: unit.start, end: unit.headerEnd }
        const fullContext = [...contexts, header]
        let headerPreserved = false
        const preserveHeader = (retained: Fragment[]) => {
            if (headerPreserved) return
            // An omitted repeated header still needs one original, traceable copy.
            if (!retained.includes(header)) bounded(header, contexts)
            headerPreserved = true
        }
        let rows: Fragment[] = []
        let rowContext: Fragment[] = []
        const flushRows = () => {
            if (!rows.length) return
            preserveHeader(rowContext)
            const warnings: KnowledgeChunkingWarning[] = ['structure-split']
            if (rowContext.length < fullContext.length) warnings.push('context-reduced')
            emit(rows, rowContext, warnings, '', true)
            rows = []
        }
        for (const part of unit.parts) {
            const row: Fragment = { source: unit.source, ...part }
            const retained = reduceTableContext(row, fullContext)
            if (!fits(render([row], retained))) {
                flushRows()
                bounded(row, fullContext, '', false, preserveHeader)
                continue
            }
            if (rows.length && (retained.length !== rowContext.length || !fits(render([...rows, row], rowContext)))) {
                flushRows()
            }
            rowContext = retained
            rows.push(row)
        }
        flushRows()
    }

    function emitUnit(unit: StructuredUnit, contexts: Fragment[]) {
        if (fits(render([unit], contexts))) {
            emit([unit], contexts)
            return
        }
        if (unit.kind === 'table') {
            emitTable(unit, contexts)
            return
        }
        if (!unit.parts?.length) {
            if (unit.kind === 'paragraph') splitParagraph(unit, contexts, separators)
            else bounded(unit, contexts)
            return
        }
        let context = [...contexts]
        let suffix = ''
        let structuralPrefix: Fragment | undefined
        if (unit.fence) {
            structuralPrefix = { ...unit, end: unit.fence.bodyStart }
            suffix = unit.fence.close
        }
        if (structuralPrefix) context.push(structuralPrefix)
        let prefixPreserved = false
        const preservePrefix = (retained: Fragment[]) => {
            if (structuralPrefix && !prefixPreserved) {
                // A repeated prefix is optional context, but its original content is still evidence.
                if (!retained.includes(structuralPrefix)) bounded(structuralPrefix, contexts)
                prefixPreserved = true
            }
        }
        let rows: Fragment[] = []
        const flushRows = () => {
            if (rows.length) {
                preservePrefix(context)
                emit(rows, context, ['structure-split'], suffix, true)
            }
            rows = []
        }
        for (const part of unit.parts) {
            const row = { source: unit.source, ...part }
            if (rows.length && !fits(render([...rows, row], context, suffix))) flushRows()
            if (!fits(render([row], context, suffix))) {
                bounded(row, context, suffix, false, preservePrefix)
            } else rows.push(row)
        }
        flushRows()
    }

    function splitParagraph(fragment: Fragment, contexts: Fragment[], priorities: string[]) {
        if (fits(render([fragment], contexts))) {
            emit([fragment], contexts, ['structure-split'], '', true)
            return
        }
        const text = content(fragment)
        const index = priorities.findIndex((separator) => separator && text.includes(separator))
        if (index < 0) {
            bounded(fragment, contexts, '', true)
            return
        }
        const separator = priorities[index]
        const parts: Fragment[] = []
        let start = 0
        let end = text.indexOf(separator)
        while (end >= 0) {
            end += separator.length
            parts.push({ ...fragment, start: fragment.start + start, end: fragment.start + end })
            start = end
            end = text.indexOf(separator, start)
        }
        if (start < text.length) parts.push({ ...fragment, start: fragment.start + start })
        let pendingPart: Fragment | undefined
        const flushPart = () => {
            if (!pendingPart) return
            let overlapStart = Math.max(fragment.start, pendingPart.start - overlap)
            const sourceText = fragment.source.document.pageContent
            if (/[\uDC00-\uDFFF]/.test(sourceText[overlapStart] ?? '')) overlapStart++
            const expanded = { ...pendingPart, start: overlapStart }
            emit([fits(render([expanded], contexts)) ? expanded : pendingPart], contexts, ['structure-split'], '', true)
            pendingPart = undefined
        }
        for (const part of parts) {
            const combined = pendingPart ? { ...pendingPart, end: part.end } : part
            if (pendingPart && !fits(render([combined], contexts))) flushPart()
            if (!fits(render([part], contexts))) splitParagraph(part, contexts, priorities.slice(index + 1))
            else pendingPart = pendingPart ? { ...pendingPart, end: part.end } : part
        }
        flushPart()
    }

    function flush() {
        if (!pending.length) return
        const contexts = headings.filter((heading) => !pending.includes(heading))
        if (fits(render(pending, contexts))) emit(pending, contexts)
        else
            for (const unit of pending)
                emitUnit(
                    unit,
                    headings.filter((heading) => heading !== unit)
                )
        pending = []
    }

    for (const unit of document.units) {
        if (unit.kind === 'heading') {
            flush()
            const level = unit.headingLevel ?? 1
            headings = headings.filter((heading) => (heading.headingLevel ?? 1) < level)
            headings.push(unit)
            pending = [unit]
            continue
        }
        const contexts = headings.filter((heading) => !pending.includes(heading))
        const ordinary = unit.kind === 'paragraph' || unit.kind === 'other'
        const hasBody = pending.some((part) => part.kind !== 'heading')
        const changesSource = pending.some((part) => part.source.index !== unit.source.index)
        if (
            hasBody &&
            (!ordinary ||
                changesSource ||
                render([...pending, unit], contexts).length > target ||
                !fits(render([...pending, unit], contexts)))
        )
            flush()
        if (ordinary) {
            pending.push(unit)
        } else if (
            pending.length &&
            fits(
                render(
                    [...pending, unit],
                    headings.filter((heading) => !pending.includes(heading))
                )
            )
        ) {
            emit(
                [...pending, unit],
                headings.filter((heading) => !pending.includes(heading))
            )
            pending = []
        } else {
            flush()
            emitUnit(unit, headings)
        }
    }
    flush()
    return output
}

function fragmentProvenance(fragments: Fragment[]): Partial<ChunkMetadata> {
    const pages: number[] = []
    const blocks = new Set<string>()
    const assets = new Map<string, TDocumentAsset>()
    for (const fragment of fragments) {
        const metadata = fragment.source.document.metadata
        const entries = metadata.markdownSourceMap?.entries
        if (entries) {
            for (const entry of entries) {
                if (
                    !Number.isFinite(entry.startOffset) ||
                    !Number.isFinite(entry.endOffset) ||
                    entry.endOffset < entry.startOffset ||
                    !Number.isInteger(entry.pageStart) ||
                    !Number.isInteger(entry.pageEnd)
                ) {
                    throw invalidKnowledgeParserConfig('markdownSourceMap')
                }
                if (entry.endOffset <= fragment.start || entry.startOffset >= fragment.end) continue
                pages.push(entry.pageStart, entry.pageEnd)
                entry.blockIds?.forEach((id) => blocks.add(id))
                entry.assets?.forEach((asset) => assets.set(asset.filePath, asset))
            }
        } else {
            const start = metadata.pageStart ?? metadata.page ?? metadata.documentLayout?.page
            const end = metadata.pageEnd ?? start
            if (start !== undefined) pages.push(start, end)
            metadata.sourceBlockIds?.forEach((id) => blocks.add(id))
            if (metadata.documentLayout?.blockId) blocks.add(metadata.documentLayout.blockId)
            metadata.assets?.forEach((asset) => assets.set(asset.filePath, asset))
        }
    }
    const pageStart = pages.length ? Math.min(...pages) : undefined
    const pageEnd = pages.length ? Math.max(...pages) : undefined
    return {
        ...(pages.length ? { pageStart, pageEnd, ...(pageStart === pageEnd ? { page: pageStart } : {}) } : {}),
        ...(blocks.size ? { sourceBlockIds: [...blocks] } : {}),
        ...(assets.size ? { assets: [...assets.values()] } : {})
    }
}
