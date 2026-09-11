jest.mock('@xpert-ai/plugin-sdk', () => jest.requireActual('../../../plugin-sdk/src/lib/ai-model/utils/tokenizer'))

import { Document } from '@langchain/core/documents'
import { init } from 'i18next'
import { countTextTokens } from '../../../plugin-sdk/src/lib/ai-model/utils/tokenizer'
import { limitChunkTokens } from './token-limited-chunks'
import { TDocChunkMetadata } from './types'

describe('token-limited retrieval chunks', () => {
    it.each(['测试测试', '搜索搜索', '删除删除'])(
        'handles non-monotonic token counts at the minimum budget: %s',
        (pageContent) => {
            const source = new Document<TDocChunkMetadata>({ pageContent, metadata: { chunkId: 'source' } })
            const chunks = limitChunkTokens([source], 1)
            expect(chunks.map((chunk) => chunk.pageContent).join('')).toBe(pageContent)
            expect(chunks.every((chunk) => countTextTokens(chunk.pageContent) <= 1)).toBe(true)
        }
    )

    beforeAll(async () => {
        await init({ lng: 'en', resources: {} })
    })
    it.each([
        'hello world! '.repeat(20),
        '中文分块测试，保留全文。'.repeat(20),
        '🧑🏽‍💻\r\n日本語、한국어 and English '.repeat(20),
        '<|endoftext|> is literal text\n'.repeat(20)
    ])('preserves text exactly and counts every emitted slice without estimation', (pageContent) => {
        const source = new Document<TDocChunkMetadata>({ pageContent, metadata: { chunkId: 'source', page: 3 } })
        const chunks = limitChunkTokens([source], 12)
        expect(chunks.map((chunk) => chunk.pageContent).join('')).toBe(pageContent)
        expect(new Set(chunks.map((chunk) => chunk.metadata.chunkId)).size).toBe(chunks.length)
        chunks.forEach((chunk, index) => {
            expect(chunk.pageContent).not.toContain('\uFFFD')
            expect(chunk.metadata).toMatchObject({
                chunkIndex: index,
                page: 3,
                tokens: countTextTokens(chunk.pageContent)
            })
            expect(chunk.metadata.tokens).toBeLessThanOrEqual(12)
        })
        expect(source.pageContent).toBe(pageContent)
        expect(source.metadata).toEqual({ chunkId: 'source', page: 3 })
    })

    it('leaves the existing output completely unchanged when disabled or absent', () => {
        const chunks = [
            new Document<TDocChunkMetadata>({ pageContent: '中文'.repeat(100), metadata: { chunkId: 'source' } })
        ]
        expect(limitChunkTokens(chunks)).toBe(chunks)
        expect(limitChunkTokens(chunks, 0)).toBe(chunks)
    })

    it('adjusts exact offsets and preserves parent links, pages and asset references', () => {
        const parent = new Document<TDocChunkMetadata>({
            pageContent: 'context '.repeat(100),
            metadata: { chunkId: 'parent', type: 'parent' }
        })
        const child = new Document<TDocChunkMetadata>({
            pageContent: parent.pageContent.slice(8, 120),
            metadata: {
                chunkId: 'child',
                parentId: 'parent',
                type: 'child',
                startOffset: 8,
                endOffset: 120,
                page: 3,
                sourceBlockIds: ['block-1'],
                assets: [{ type: 'image', url: '/image', filePath: 'image.png' }]
            }
        })
        const [retained, ...children] = limitChunkTokens([parent, child], 4)
        expect(retained).toBe(parent)
        children.forEach((chunk, index) => {
            expect(chunk.metadata).toMatchObject({
                parentId: 'parent',
                type: 'child',
                chunkIndex: index,
                page: 3,
                sourceBlockIds: ['block-1'],
                assets: child.metadata.assets
            })
            expect(parent.pageContent.slice(chunk.metadata.startOffset, chunk.metadata.endOffset)).toBe(
                chunk.pageContent
            )
        })
    })

    it('counts inserted Markdown headings and keeps coarse provenance when the source span excludes them', () => {
        const source = new Document<TDocChunkMetadata>({
            pageContent: '# A very long heading\n\n' + '正文'.repeat(20),
            metadata: {
                chunkId: 'md',
                contentFormat: 'markdown',
                startOffset: 100,
                endOffset: 140,
                pageStart: 2,
                pageEnd: 3
            }
        })
        const chunks = limitChunkTokens([source], 8)
        expect(chunks.map((chunk) => chunk.pageContent).join('')).toBe(source.pageContent)
        for (const chunk of chunks) {
            expect(chunk.metadata.tokens).toBeLessThanOrEqual(8)
            expect(chunk.metadata).toMatchObject({ startOffset: 100, endOffset: 140, pageStart: 2, pageEnd: 3 })
        }
    })

    it('fails clearly when the limit cannot fit a Unicode character instead of returning a corrupt or oversized chunk', () => {
        const source = new Document<TDocChunkMetadata>({ pageContent: '🧑', metadata: { chunkId: 'emoji' } })
        expect(() => limitChunkTokens([source], 1)).toThrow('complete character')
        expect(source.pageContent).toBe('🧑')
    })

    it('retains non-text asset chunks for their separate processing path', () => {
        const source = new Document<TDocChunkMetadata>({
            pageContent: 'image description '.repeat(20),
            metadata: { chunkId: 'image', mediaType: 'image' }
        })
        expect(limitChunkTokens([source], 4)).toEqual([source])
    })
})
