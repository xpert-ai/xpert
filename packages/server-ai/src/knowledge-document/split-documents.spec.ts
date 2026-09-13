import { Document } from '@langchain/core/documents'
import { countTextTokens } from '@xpert-ai/plugin-sdk'
import { RecursiveCharacterStrategy } from '../knowledgebase/plugins/textsplitter-common/recursive-character.strategy'
import { splitKnowledgeDocuments } from './split-documents'
import { TDocChunkMetadata } from './types'

describe('combined character and token limits', () => {
    it.each([
        { words: 128, chunkSize: 4000, chunkOverlap: 0, tokens: [128] },
        { words: 129, chunkSize: 4000, chunkOverlap: 0, tokens: [128, 1] },
        { words: 128, chunkSize: 512, chunkOverlap: 80, tokens: [86, 56] },
        { words: 129, chunkSize: 512, chunkOverlap: 80, tokens: [86, 57] }
    ])('honors both configured limits: %j', async ({ words, chunkSize, chunkOverlap, tokens }) => {
        const text = Array(words).fill('apple').join(' ')
        expect(countTextTokens(text)).toBe(words)
        const source = new Document<TDocChunkMetadata>({ pageContent: text, metadata: { chunkId: 'source' } })
        const result = await splitKnowledgeDocuments(
            { get: () => new RecursiveCharacterStrategy() },
            {
                type: 'txt',
                parserConfig: {
                    chunkSize,
                    chunkOverlap,
                    maxChunkTokens: 128,
                    textSplitter: { separators: ['\n\n', '\n'] }
                }
            },
            [source]
        )
        expect(result.chunks.map((chunk) => countTextTokens(chunk.pageContent))).toEqual(tokens)
        expect(
            result.chunks.every((chunk) => chunk.pageContent.length <= chunkSize && chunk.metadata.tokens <= 128)
        ).toBe(true)
        if (chunkOverlap === 0) expect(result.chunks.map((chunk) => chunk.pageContent).join('')).toBe(text)
    })
})
