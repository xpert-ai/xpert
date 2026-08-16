jest.mock('@xpert-ai/plugin-sdk', () => ({
    TextSplitterStrategy: () => () => undefined
}))

import { Document } from '@langchain/core/documents'
import { RecursiveCharacterStrategy } from './recursive-character.strategy'

describe('RecursiveCharacterStrategy', () => {
    it('renumbers chunks in split order instead of preserving source chunkIndex', async () => {
        const strategy = new RecursiveCharacterStrategy()
        const result = await strategy.splitDocuments(
            [
                new Document({
                    pageContent: 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda',
                    metadata: {
                        chunkId: 'source',
                        chunkIndex: 0
                    }
                })
            ],
            {
                chunkSize: 12,
                chunkOverlap: 0
            }
        )

        expect(result.chunks.length).toBeGreaterThan(1)
        expect(result.chunks.map((chunk) => chunk.metadata.chunkIndex)).toEqual(result.chunks.map((_, index) => index))
    })

    it('preserves Unlimited-OCR page, layout and asset metadata', async () => {
        const strategy = new RecursiveCharacterStrategy()
        const assets = [{ type: 'image' as const, filePath: 'pages/page-2.png', url: '/pages/page-2.png' }]
        const unlimitedOcr = {
            provider: 'self-hosted',
            page: 2,
            blockType: 'table',
            position: [[10, 20, 300, 400]]
        }
        const result = await strategy.splitDocuments(
            [
                new Document({
                    pageContent: 'alpha beta gamma delta epsilon',
                    metadata: { chunkId: 'source', chunkIndex: 4, page: 2, assets, unlimitedOcr }
                })
            ],
            { chunkSize: 12, chunkOverlap: 0 }
        )

        expect(result.chunks.length).toBeGreaterThan(1)
        for (const chunk of result.chunks) {
            expect(chunk.metadata.page).toBe(2)
            expect(chunk.metadata.assets).toEqual(assets)
            expect(chunk.metadata.unlimitedOcr).toEqual(unlimitedOcr)
            expect(chunk.metadata.chunkId).not.toBe('source')
        }
    })
})
