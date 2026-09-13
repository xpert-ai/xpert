jest.mock('@xpert-ai/plugin-sdk', () => ({
    ...jest.requireActual('../../../../../plugin-sdk/src/lib/ai-model/utils/tokenizer'),
    TextSplitterStrategy: () => () => undefined
}))

import { Document } from '@langchain/core/documents'
import { countTextTokens, type ChunkMetadata } from '@xpert-ai/plugin-sdk'
import { init } from 'i18next'
import { AutoTextSplitterStrategy } from './auto.strategy'
import { StructureAwareStrategy } from './structure-aware.strategy'
import { RecursiveCharacterStrategy } from './recursive-character.strategy'
import { MarkdownRecursiveStrategy } from './markdown-recursive.strategy'

const source = (pageContent: string, metadata: Partial<ChunkMetadata> = {}) =>
    new Document<ChunkMetadata>({
        pageContent,
        metadata: { chunkId: 'source', contentFormat: 'markdown', ...metadata }
    })
const options = { chunkSize: 1000, chunkOverlap: 0 }
const recursive = new RecursiveCharacterStrategy()
const structured = new StructureAwareStrategy(recursive)
const auto = new AutoTextSplitterStrategy(structured, new MarkdownRecursiveStrategy(), recursive)

beforeAll(async () => {
    await init({ lng: 'en', resources: {} })
})

describe('auto chunking', () => {
    it.each([
        ['# Manual\n\nOverview text.', 'markdown', 'markdown-recursive'],
        ['Manual\n======\n\nOverview text.', 'markdown', 'structure-aware'],
        ['# Manual\n\n1. Apply\n2. Return', 'markdown', 'structure-aware'],
        ['~~~js\n# not a heading\n~~~', 'markdown', 'structure-aware'],
        ['# literal plain text', 'text', 'recursive-character'],
        ['Plain paragraph.', 'markdown', 'recursive-character']
    ] as const)('routes %s using declared content and supported structure', async (text, contentFormat, resolved) => {
        const result = await auto.splitDocuments([source(text, { contentFormat })], options)
        expect(result.decisions[0].resolvedStrategy).toBe(resolved)
        expect(result.chunks.every((chunk) => chunk.metadata.chunking?.requestedStrategy === 'auto')).toBe(true)
    })

    it('makes one choice for all fragments with the same explicit document identity', async () => {
        const result = await auto.splitDocuments(
            [
                source('# Manual\n\nOverview', { documentId: 'doc' }),
                source('| Key | Value |\n| --- | --- |\n| A | B |', { chunkId: 'table', documentId: 'doc' })
            ],
            options
        )
        expect(result.decisions).toHaveLength(1)
        expect(result.decisions[0].resolvedStrategy).toBe('structure-aware')
    })

    it('matches manual structure-aware output without mutating its input or configuration', async () => {
        const input = [source('# Manual\n\n| Key | Value |\n| --- | --- |\n| A | B |')]
        const original = JSON.stringify(input)
        const manual = await structured.splitDocuments(input, options, { maxChunkTokens: 32 })
        const automatic = await auto.splitDocuments(input, options, { maxChunkTokens: 32 })
        expect(automatic.chunks.map((chunk) => chunk.pageContent)).toEqual(
            manual.chunks.map((chunk) => chunk.pageContent)
        )
        expect(JSON.stringify(input)).toBe(original)
        expect(options).toEqual({ chunkSize: 1000, chunkOverlap: 0 })
    })

    it('uses explicit layout headings and rejects malformed layout contracts', async () => {
        const documentLayout = {
            schemaVersion: 1 as const,
            page: 1,
            pageWidth: 100,
            pageHeight: 100,
            blockId: 'title',
            order: 0,
            type: 'title' as const,
            headingLevel: 2
        }
        const result = await auto.splitDocuments(
            [source('Layout heading', { contentFormat: 'text', documentLayout })],
            options
        )
        expect(result.decisions[0]).toMatchObject({ resolvedStrategy: 'structure-aware', reason: 'layout-headings' })
        await expect(
            auto.splitDocuments(
                [source('Invalid heading', { documentLayout: { ...documentLayout, headingLevel: 10 } })],
                options
            )
        ).rejects.toThrow()
    })

    it('does not hide an execution error behind recursive-character fallback', async () => {
        const split = jest
            .spyOn(structured, 'splitAnalyzed')
            .mockRejectedValueOnce(new Error('failed structure engine'))
        await expect(auto.splitDocuments([source('1. a\n2. b')], options)).rejects.toThrow('failed structure engine')
        split.mockRestore()
    })

    it('follows explicit page and reading order for layout fragments', async () => {
        const layout = {
            schemaVersion: 1 as const,
            page: 1,
            pageWidth: 100,
            pageHeight: 100,
            blockId: 'block',
            order: 0,
            type: 'text' as const
        }
        const result = await structured.splitDocuments(
            [
                source('second paragraph', {
                    documentId: 'doc',
                    contentFormat: 'text',
                    documentLayout: { ...layout, order: 2 }
                }),
                source('Section title', {
                    documentId: 'doc',
                    contentFormat: 'text',
                    documentLayout: { ...layout, type: 'title' }
                }),
                source('first paragraph', {
                    documentId: 'doc',
                    contentFormat: 'text',
                    documentLayout: { ...layout, order: 1 }
                })
            ],
            options
        )
        const text = result.chunks.map((chunk) => chunk.pageContent).join('\n')
        expect(text.indexOf('Section title')).toBeLessThan(text.indexOf('first paragraph'))
        expect(text.indexOf('first paragraph')).toBeLessThan(text.indexOf('second paragraph'))
    })

    it('reports absent format metadata and does not retain a copied full-document source map', async () => {
        const result = await auto.splitDocuments(
            [
                source('# Literal heading', {
                    contentFormat: undefined,
                    markdownSourceMap: {
                        schemaVersion: 1,
                        entries: [{ startOffset: 0, endOffset: 17, pageStart: 1, pageEnd: 1 }]
                    }
                })
            ],
            options
        )
        expect(result.decisions[0]).toMatchObject({ resolvedStrategy: 'recursive-character' })
        expect(result.decisions[0].warnings).toEqual(expect.arrayContaining(['missing-format', 'coarse-provenance']))
        expect(result.chunks[0].metadata.markdownSourceMap).toBeUndefined()
        expect(result.chunks[0].metadata.sourceMapping).toBe('coarse')
    })
})

describe('structure-aware chunking', () => {
    it('keeps a whole table above the character target when it fits the token budget', async () => {
        const table = '| Name | Description |\n| --- | --- |\n| A | a complete description |'
        const result = await structured.splitDocuments(
            [source(table)],
            { chunkSize: 20, chunkOverlap: 0 },
            { maxChunkTokens: 128 }
        )
        expect(result.chunks).toHaveLength(1)
        expect(result.chunks[0].pageContent).toBe(table)
    })

    it('splits long tables by rows and counts repeated headers and titles', async () => {
        const rows = Array.from({ length: 12 }, (_, i) => `| item-${i} | ${'details '.repeat(8)}|`)
        const text = '# Inventory\n\n| Name | Description |\n| --- | --- |\n' + rows.join('\n')
        const result = await structured.splitDocuments([source(text)], options, { maxChunkTokens: 64 })
        const tableChunks = result.chunks.filter((chunk) => chunk.pageContent.includes('| Name |'))
        expect(tableChunks.length).toBeGreaterThan(1)
        for (const chunk of tableChunks) {
            expect(chunk.pageContent).toContain('# Inventory')
            expect(chunk.pageContent).toContain('| --- | --- |')
            expect(countTextTokens(chunk.pageContent)).toBeLessThanOrEqual(64)
        }
        for (const row of rows) expect(tableChunks.filter((chunk) => chunk.pageContent.includes(row))).toHaveLength(1)
    })

    it.each([
        ['auto', auto],
        ['structure-aware', structured]
    ] as const)('%s keeps complete table rows before repeating optional context', async (_, strategy) => {
        const header = '| Identifier | ' + 'Detailed column name '.repeat(8) + '|\n| --- | --- |\n'
        const rows = Array.from({ length: 24 }, (_, i) => '| item-' + i + ' | ' + 'details '.repeat(42) + '|')
        const text = '# Inventory\n\n' + header + rows.join('\n')
        expect(rows.every((row) => countTextTokens(row) <= 64)).toBe(true)
        expect(rows.every((row) => countTextTokens(header + row) > 64)).toBe(true)

        const result = await strategy.splitDocuments(
            [source(text)],
            { chunkSize: 200, chunkOverlap: 20 },
            { maxChunkTokens: 64 }
        )
        const dataChunks = result.chunks.filter((chunk) => chunk.pageContent.includes('item-'))
        expect(dataChunks).toHaveLength(24)
        for (const row of rows) {
            expect(dataChunks.filter((chunk) => chunk.pageContent.includes(row))).toHaveLength(1)
        }
        for (const chunk of dataChunks) {
            expect(chunk.metadata.chunking.warnings).toContain('context-reduced')
            expect(chunk.metadata.chunking.headingPath).toEqual(['# Inventory'])
            expect(chunk.metadata.chunking.sourceRanges).toHaveLength(1)
            const range = chunk.metadata.chunking.sourceRanges[0]
            expect(text.slice(range.startOffset, range.endOffset)).toBe(chunk.pageContent)
        }
        expect(result.chunks.map((chunk) => chunk.pageContent).join('\n')).toContain(header.trimEnd())
        expect(result.chunks.every((chunk) => countTextTokens(chunk.pageContent) <= 64)).toBe(true)
    })

    it('keeps a whole table when removing repeated headings is sufficient', async () => {
        const heading = '# ' + 'Inventory '.repeat(48) + '\n\n'
        const table =
            '| Name | Value |\n| --- | --- |\n| item-a | ' +
            'value '.repeat(8) +
            '|\n| item-b | ' +
            'value '.repeat(8) +
            '|'
        expect(countTextTokens(table)).toBeLessThanOrEqual(64)
        expect(countTextTokens(heading + table)).toBeGreaterThan(64)

        const result = await structured.splitDocuments([source(heading + table)], options, { maxChunkTokens: 64 })
        const dataChunks = result.chunks.filter((chunk) => chunk.pageContent.includes('item-'))
        expect(dataChunks).toHaveLength(1)
        expect(dataChunks[0].pageContent).toBe(table)
        expect(dataChunks[0].metadata.chunking.warnings).toContain('context-reduced')
        expect(result.chunks.map((chunk) => chunk.pageContent).join('\n')).toContain(heading.trim())
    })

    it('restores table headers and packs short rows after a row needs less context', async () => {
        const header = '| Name | Description |\n| --- | --- |\n'
        const wideRow = '| wide | ' + 'details '.repeat(52) + '|'
        const shortRows = ['| short-a | one |', '| short-b | two |']
        expect(countTextTokens(wideRow)).toBeLessThanOrEqual(64)
        expect(countTextTokens(header + wideRow)).toBeGreaterThan(64)
        const text = '# Inventory\n\n' + header + [wideRow, ...shortRows].join('\n')

        const result = await structured.splitDocuments([source(text)], options, { maxChunkTokens: 64 })
        expect(result.chunks.filter((chunk) => chunk.pageContent.includes(wideRow))).toHaveLength(1)
        const shortChunk = result.chunks.find((chunk) => chunk.pageContent.includes(shortRows[0]))
        expect(shortChunk.pageContent).toContain(shortRows.join('\n'))
        expect(shortChunk.pageContent).toContain(header)
        expect(shortChunk.pageContent).toContain('# Inventory')
        expect(shortChunk.metadata.chunking.warnings).not.toContain('context-reduced')
        expect(result.chunks.every((chunk) => countTextTokens(chunk.pageContent) <= 64)).toBe(true)
    })

    it('retains original list numbering and code fences on continuation chunks', async () => {
        const text =
            '# Steps\n\n' +
            Array.from({ length: 8 }, (_, i) => `${i + 4}. ${'step '.repeat(12)}`).join('\n') +
            '\n\n~~~js\n' +
            'console.log("hello");\n'.repeat(30) +
            '~~~'
        const result = await structured.splitDocuments([source(text)], options, { maxChunkTokens: 48 })
        const contents = result.chunks.map((chunk) => chunk.pageContent)
        for (let i = 4; i < 12; i++) expect(contents.some((text) => text.includes(`${i}. step`))).toBe(true)
        for (const text of contents.filter((text) => text.includes('console.log'))) {
            expect(text).toMatch(/~~~js\n/)
            expect(text.trimEnd()).toMatch(/~~~$/)
        }
        expect(contents.every((text) => countTextTokens(text) <= 48)).toBe(true)
    })

    it('preserves code indentation, blank lines and meaningful trailing spaces', async () => {
        const lines = ['def hello():\n', '    if True:\n', '        print("hello")  \n', '\n']
        const result = await structured.splitDocuments(
            [source('```python\n' + lines.join('').repeat(10) + '```')],
            options,
            { maxChunkTokens: 48 }
        )
        const bodies = result.chunks
            .map((chunk) => chunk.pageContent.replace(/^```python\r?\n/, '').replace(/```\s*$/, ''))
            .join('')
        expect(bodies).toBe(lines.join('').repeat(10))
    })

    it('keeps formulas as structural units and handles narrow budgets without losing table headers', async () => {
        const formula = '$$\nx = y + z\n$$'
        expect((await auto.splitDocuments([source(formula)], options)).decisions[0].resolvedStrategy).toBe(
            'structure-aware'
        )
        const table = '| LongHeaderName | Value |\n| --- | --- |\n| ' + 'wide '.repeat(50) + '| number |'
        const result = await structured.splitDocuments([source(table)], options, { maxChunkTokens: 8 })
        const text = result.chunks.map((chunk) => chunk.pageContent).join('')
        expect(text).toContain('LongHeaderName')
        expect(text).toContain('number')
        expect(result.chunks.every((chunk) => countTextTokens(chunk.pageContent) <= 8)).toBe(true)
        expect(result.decisions[0].warnings).toContain('structure-split')
    })

    it.each([12, 16, 24])(
        'retains table headers when context fits but leaves too little body budget: %s',
        async (maxChunkTokens) => {
            const table = '| Name | Value |\n| --- | --- |\n| ' + 'wide '.repeat(50) + '| number |'
            const result = await structured.splitDocuments([source(table)], options, { maxChunkTokens })
            const text = result.chunks.map((chunk) => chunk.pageContent).join('')
            expect(text).toContain('Name')
            expect(text).toContain('Value')
            expect(text).toContain('number')
            expect(result.chunks.every((chunk) => countTextTokens(chunk.pageContent) <= maxChunkTokens)).toBe(true)
        }
    )

    it('narrows page/block/asset provenance instead of copying the full source map', async () => {
        const text = '# A\n\nfirst\n\n# B\n\nsecond'
        const boundary = text.indexOf('# B')
        const result = await structured.splitDocuments(
            [
                source(text, {
                    markdownSourceMap: {
                        schemaVersion: 1,
                        entries: [
                            { startOffset: 0, endOffset: boundary, pageStart: 1, pageEnd: 1, blockIds: ['a'] },
                            { startOffset: boundary, endOffset: text.length, pageStart: 2, pageEnd: 2, blockIds: ['b'] }
                        ]
                    }
                })
            ],
            options
        )
        expect(result.chunks.find((chunk) => chunk.pageContent.includes('first')).metadata).toMatchObject({
            page: 1,
            sourceBlockIds: ['a']
        })
        expect(result.chunks.find((chunk) => chunk.pageContent.includes('second')).metadata).toMatchObject({
            page: 2,
            sourceBlockIds: ['b']
        })
        expect(result.chunks.every((chunk) => chunk.metadata.markdownSourceMap === undefined)).toBe(true)
    })

    it('preserves preambles, nested headings and trailing headings without merging sections', async () => {
        const result = await structured.splitDocuments(
            [source('Preface\n\n# One\n\nfirst\n\n## Child\n\nsecond\n\n# Empty')],
            options
        )
        const text = result.chunks.map((chunk) => chunk.pageContent).join('\n')
        for (const part of ['Preface', '# One', 'first', '## Child', 'second', '# Empty']) expect(text).toContain(part)
        expect(
            result.chunks.some((chunk) => chunk.pageContent.includes('first') && chunk.pageContent.includes('second'))
        ).toBe(false)
    })

    it('uses monotonic source ranges for repeated text and CRLF', async () => {
        const text = '# One\r\n\r\nRepeated\r\n\r\n# Two\r\n\r\nRepeated'
        const result = await structured.splitDocuments([source(text)], options)
        for (const chunk of result.chunks) {
            const ranges = chunk.metadata.chunking.sourceRanges
            expect(ranges.length).toBeGreaterThan(0)
            for (const range of ranges) expect(text.slice(range.startOffset, range.endOffset).trim()).not.toBe('')
        }
        const ranges = result.chunks.flatMap((chunk) => chunk.metadata.chunking.sourceRanges)
        expect(ranges.map((range) => range.startOffset)).toEqual(
            [...ranges].map((range) => range.startOffset).sort((a, b) => a - b)
        )
    })

    it('falls back explicitly for unstructured text and preserves non-text assets', async () => {
        const asset = source('image', { mediaType: 'image', chunkId: 'image' })
        const result = await structured.splitDocuments(
            [source('plain text', { contentFormat: 'text' }), asset],
            options
        )
        expect(result.decisions[0]).toMatchObject({
            resolvedStrategy: 'recursive-character',
            reason: 'missing-structure'
        })
        expect(result.chunks.find((chunk) => chunk.metadata.chunkId === 'image')).toEqual(asset)
    })

    it('rejects invalid limits and impossible Unicode budgets instead of emitting damaged content', async () => {
        const result = await structured.splitDocuments([source('# Title\n\n' + '\u{1f9d1}'.repeat(10))], options, {
            maxChunkTokens: 8
        })
        expect(result.chunks.every((chunk) => countTextTokens(chunk.pageContent) <= 8)).toBe(true)
        expect(result.chunks.map((chunk) => chunk.pageContent).join('')).toContain('\u{1f9d1}')
        await expect(structured.splitDocuments([source('# A\n\n🧑')], options, { maxChunkTokens: 1 })).rejects.toThrow()
        await expect(structured.validateConfig({ chunkSize: 10, chunkOverlap: 10 })).rejects.toThrow()
    })

    it('does not copy full-source embedding text onto every chunk or reinterpret indexed-field projections', async () => {
        const text = '# Title\n\n' + 'body '.repeat(100)
        const result = await structured.splitDocuments([source(text, { searchContent: text })], options, {
            maxChunkTokens: 24
        })
        expect(result.chunks.length).toBeGreaterThan(1)
        expect(result.chunks.every((chunk) => chunk.metadata.searchContent === chunk.pageContent)).toBe(true)
        await expect(
            auto.splitDocuments([source(text, { searchContent: 'selected field' })], options)
        ).rejects.toThrow()
    })
})
