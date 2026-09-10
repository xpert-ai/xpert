jest.mock('@xpert-ai/plugin-sdk', () => ({
    TextSplitterStrategy: () => () => undefined
}))

import { Document } from '@langchain/core/documents'
import { ParentChildStrategy, splitIntoParents } from './parent-child.strategy'

describe('ParentChildStrategy', () => {
    it('preserves source layout and asset metadata on parent and child chunks', async () => {
        const strategy = new ParentChildStrategy()
        const assets = [{ type: 'image' as const, filePath: 'pages/page-1.png', url: '/pages/page-1.png' }]
        const result = await strategy.splitDocuments(
            [
                new Document({
                    pageContent: 'first line\nsecond line',
                    metadata: {
                        chunkId: 'source-chunk',
                        chunkIndex: 7,
                        documentId: 'document-1',
                        page: 1,
                        assets,
                        unlimitedOcr: {
                            provider: 'self-hosted',
                            blockType: 'text',
                            position: [10, 20, 30, 40]
                        }
                    }
                })
            ],
            {
                parent: { mode: 'full' },
                child: { separator: '\n', maxChars: 20 }
            }
        )

        expect(result.chunks.length).toBeGreaterThan(1)
        for (const chunk of result.chunks) {
            expect(chunk.metadata.page).toBe(1)
            expect(chunk.metadata.assets).toEqual(assets)
            expect(chunk.metadata.unlimitedOcr).toEqual({
                provider: 'self-hosted',
                blockType: 'text',
                position: [10, 20, 30, 40]
            })
            expect(chunk.metadata.chunkId).not.toBe('source-chunk')
        }
        expect(result.chunks.some((chunk) => chunk.metadata.type === 'parent')).toBe(true)
        expect(result.chunks.some((chunk) => chunk.metadata.type === 'child')).toBe(true)
    })
})

it('keeps the entire document as one parent in full mode', async () => {
    const text = 'first paragraph\n\n' + 'second paragraph '.repeat(200)
    const result = await new ParentChildStrategy().splitDocuments([new Document({ pageContent: text })], {
        parent: { mode: 'full', maxChars: 10 },
        child: { maxChars: 100 }
    })
    const parents = result.chunks.filter((chunk) => chunk.metadata.type === 'parent')
    expect(parents).toHaveLength(1)
    expect(parents[0].pageContent).toBe(text)
    const children = result.chunks.filter((chunk) => chunk.metadata.type === 'child')
    expect(children.length).toBeGreaterThan(1)
    expect(children.every((chunk) => chunk.metadata.parentId === parents[0].metadata.chunkId)).toBe(true)
    expect(children.every((chunk) => chunk.pageContent.length <= 100)).toBe(true)
})

it('rejects a zero limit instead of entering a non-advancing split loop', async () => {
    await expect(new ParentChildStrategy().splitDocuments([], { parent: {}, child: { maxChars: 0 } })).rejects.toThrow()
})

describe('ordered parent-child separators', () => {
    it('uses the first matching separator and tries lower priorities only for oversized blocks', () => {
        const text = 'aa\nbb\n\ncc\ndd\nee\nff'
        const chunks = splitIntoParents(text, { separators: ['\\n\\n', '\\n'], maxChars: 6 })
        expect(chunks.map((chunk) => chunk.content)).toEqual(['aa\nbb', 'cc', 'dd', 'ee', 'ff'])
        for (const chunk of chunks) {
            expect(text.slice(chunk.startOffset, chunk.endOffset)).toBe(chunk.content)
        }
        expect(
            splitIntoParents(text, { separators: ['\\n', '\\n\\n'], maxChars: 6 }).map((chunk) => chunk.content)
        ).toEqual(['aa', 'bb', 'cc', 'dd', 'ee', 'ff'])
    })

    it('preserves custom literal separators and handles repeated content and surrounding whitespace', () => {
        const text = '  a,b.* a,b.*\n\t c,d  '
        const chunks = splitIntoParents(text, { separators: ['.*', ','], maxChars: 4 })
        expect(chunks.map((chunk) => chunk.content)).toEqual(['a,b', 'a,b', 'c,d'])
        for (const chunk of chunks) {
            expect(text.slice(chunk.startOffset, chunk.endOffset)).toBe(chunk.content)
        }
    })

    it('honors an empty list over the legacy separator and falls back to the character limit', () => {
        expect(
            splitIntoParents('ab|cdefgh', { separators: [], separator: '|', maxChars: 4 }).map((chunk) => chunk.content)
        ).toEqual(['ab|c', 'defg', 'h'])
        expect(
            splitIntoParents('abcdefgh', { separators: ['|', ''], maxChars: 3 }).map((chunk) => chunk.content)
        ).toEqual(['abc', 'def', 'gh'])
        expect(splitIntoParents(' \n ', { separators: [], maxChars: 3 })).toEqual([])
    })

    it('keeps legacy single-separator behavior and defaults', () => {
        expect(splitIntoParents('aa\n\nbb\ncc', { separator: '\\n\\n' }).map((chunk) => chunk.content)).toEqual([
            'aa',
            'bb\ncc'
        ])
        expect(splitIntoParents('aa\n\nbb', {}).map((chunk) => chunk.content)).toEqual(['aa', 'bb'])
    })

    it('applies independent separator lists to parent and child chunks', async () => {
        const result = await new ParentChildStrategy().splitDocuments(
            [new Document({ pageContent: 'aa,bb|cc,dd', metadata: { documentId: 'doc-1' } })],
            {
                parent: { mode: 'paragraph', separators: ['|', ';'], maxChars: 10 },
                child: { separators: [',', '\\n'], maxChars: 3 }
            }
        )
        const parents = result.chunks.filter((chunk) => chunk.metadata.type === 'parent')
        expect(parents.map((chunk) => chunk.pageContent)).toEqual(['aa,bb', 'cc,dd'])
        for (const parent of parents) {
            const children = result.chunks.filter((chunk) => chunk.metadata.parentId === parent.metadata.chunkId)
            expect(children.map((chunk) => chunk.pageContent)).toEqual(parent.pageContent.split(','))
            for (const child of children) {
                expect(parent.pageContent.slice(child.metadata.startOffset, child.metadata.endOffset)).toBe(
                    child.pageContent
                )
                expect(child.metadata.documentId).toBe('doc-1')
            }
        }
    })

    it.each(['{"separators":"|"}', '{"separators":[1]}', '{"separators":null}'])(
        'rejects malformed separator lists from persisted JSON: %s',
        async (options) => {
            const strategy = new ParentChildStrategy()
            await expect(strategy.validateConfig({ parent: JSON.parse(options), child: {} })).rejects.toThrow()
            await expect(strategy.validateConfig({ parent: {}, child: JSON.parse(options) })).rejects.toThrow()
        }
    )
})
