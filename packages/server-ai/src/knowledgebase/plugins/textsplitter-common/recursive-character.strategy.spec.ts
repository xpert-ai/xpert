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
})
