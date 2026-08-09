jest.mock('@xpert-ai/plugin-sdk', () => ({
    TextSplitterStrategy: () => () => undefined
}))

import { Document } from '@langchain/core/documents'
import { ParentChildStrategy } from './parent-child.strategy'

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
