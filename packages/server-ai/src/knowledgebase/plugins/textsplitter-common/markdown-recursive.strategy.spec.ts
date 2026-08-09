jest.mock('@xpert-ai/plugin-sdk', () => ({
    TextSplitterStrategy: () => () => undefined
}))

import { Document } from '@langchain/core/documents'
import { MarkdownRecursiveStrategy } from './markdown-recursive.strategy'

describe('MarkdownRecursiveStrategy', () => {
    it('preserves Unlimited-OCR page, layout and asset metadata', async () => {
        const strategy = new MarkdownRecursiveStrategy()
        const assets = [{ type: 'file' as const, filePath: 'raw/page-3.md', url: '/raw/page-3.md' }]
        const unlimitedOcr = {
            provider: 'self-hosted',
            page: 3,
            blockType: 'text',
            position: [[20, 30, 600, 300]]
        }
        const result = await strategy.splitDocuments(
            [
                new Document({
                    pageContent: '# Heading\n\nFirst paragraph with enough content to split.\n\nSecond paragraph.',
                    metadata: { chunkId: 'source', chunkIndex: 8, page: 3, assets, unlimitedOcr }
                })
            ],
            { chunkSize: 24, chunkOverlap: 0, headerToSplitOn: 3 }
        )

        expect(result.chunks.length).toBeGreaterThan(1)
        for (const chunk of result.chunks) {
            expect(chunk.metadata.page).toBe(3)
            expect(chunk.metadata.assets).toEqual(assets)
            expect(chunk.metadata.unlimitedOcr).toEqual(unlimitedOcr)
            expect(chunk.metadata.chunkId).not.toBe('source')
        }
    })
})
