jest.mock('@xpert-ai/plugin-sdk', () => ({
    ...jest.requireActual('../../../plugin-sdk/src/lib/ai-model/utils/tokenizer'),
    TextSplitterStrategy: () => () => undefined
}))

import { Document } from '@langchain/core/documents'
import { KBDocumentCategoryEnum } from '@xpert-ai/contracts'
import { countTextTokens, type ChunkMetadata } from '@xpert-ai/plugin-sdk'
import { executeKnowledgeSplitter } from './execute-splitter'
import { splitKnowledgeDocuments } from './split-documents'
import { knowledgeChunkingRevision } from './chunking-revision'
import { RecursiveCharacterStrategy } from '../knowledgebase/plugins/textsplitter-common/recursive-character.strategy'
import { MarkdownRecursiveStrategy } from '../knowledgebase/plugins/textsplitter-common/markdown-recursive.strategy'
import { StructureAwareStrategy } from '../knowledgebase/plugins/textsplitter-common/structure-aware.strategy'
import { AutoTextSplitterStrategy } from '../knowledgebase/plugins/textsplitter-common/auto.strategy'

const recursive = new RecursiveCharacterStrategy()
const structured = new StructureAwareStrategy(recursive)
const auto = new AutoTextSplitterStrategy(structured, new MarkdownRecursiveStrategy(), recursive)
const registry = { get: (name: string) => (name === 'auto' ? auto : structured) }
const input = () => [
    new Document<ChunkMetadata>({
        pageContent: '# A\n\n' + '1. instruction\n'.repeat(35),
        metadata: { chunkId: 'source', contentFormat: 'markdown' }
    })
]

it.each([
    ['auto', '# Inventory\n\n| Key | Value |\n| --- | --- |\n| A | B |', 'structure-aware'],
    ['structure-aware', '# Inventory\n\n| Key | Value |\n| --- | --- |\n| A | B |', 'structure-aware'],
    ['auto', '# Manual\n\n' + 'apple '.repeat(128), 'markdown-recursive'],
    ['auto', 'apple '.repeat(128), 'recursive-character'],
    ['structure-aware', 'apple '.repeat(128), 'recursive-character']
])('keeps cache, decisions and final chunk versions aligned (case %#)', async (provider, pageContent, resolved) => {
    const result = await executeKnowledgeSplitter(
        registry.get(provider),
        [new Document<ChunkMetadata>({ pageContent, metadata: { chunkId: 'source', contentFormat: 'markdown' } })],
        { chunkSize: 4000, chunkOverlap: 0 },
        { maxChunkTokens: 16 }
    )
    expect(result.decisions).toHaveLength(1)
    const decision = result.decisions[0]
    expect(decision.resolvedStrategy).toBe(resolved)
    expect(knowledgeChunkingRevision(provider)).toBe(`structured-${decision.algorithmVersion}`)
    // The previous table revision cached chunks that incorrectly reported algorithm version 1.
    expect(knowledgeChunkingRevision(provider)).not.toBe('structured-2')
    expect(decision.algorithmVersion).toBeGreaterThan(1)
    expect(result.chunks.length).toBeGreaterThan(0)
    for (const chunk of result.chunks) {
        expect(chunk.metadata.chunking.algorithmVersion).toBe(decision.algorithmVersion)
        expect(countTextTokens(chunk.pageContent)).toBeLessThanOrEqual(16)
    }
})

it.each(['auto', 'structure-aware'])(
    'uses identical execution for parser and pipeline configurations: %s',
    async (provider) => {
        const options = { chunkSize: 1000, chunkOverlap: 0 }
        const direct = await executeKnowledgeSplitter(registry.get(provider), input(), {
            ...options,
            maxChunkTokens: 24
        })
        const loaded = await splitKnowledgeDocuments(
            registry,
            {
                type: 'md',
                parserConfig: {
                    textSplitterType: provider,
                    textSplitter: options,
                    maxChunkTokens: 24
                }
            },
            input()
        )
        expect(direct.chunks.map((chunk) => chunk.pageContent)).toEqual(loaded.chunks.map((chunk) => chunk.pageContent))
        expect(direct.chunks.every((chunk) => countTextTokens(chunk.pageContent) <= 24)).toBe(true)
        expect(direct.decisions).toEqual(loaded.decisions)
    }
)

it('honors explicit pipeline zero over inherited limits and removes the envelope from provider options', async () => {
    const spy = jest.spyOn(structured, 'splitDocuments')
    await executeKnowledgeSplitter(
        structured,
        input(),
        { chunkSize: 1000, chunkOverlap: 0, maxChunkTokens: 0 },
        { maxChunkTokens: 8 }
    )
    expect(spy).toHaveBeenLastCalledWith(
        expect.any(Array),
        { chunkSize: 1000, chunkOverlap: 0 },
        expect.objectContaining({ maxChunkTokens: 0 })
    )
    spy.mockRestore()
})

it('validates pipeline inputs before executing and rejects sheet routing', async () => {
    const spy = jest.spyOn(structured, 'splitDocuments')
    await expect(executeKnowledgeSplitter(structured, input(), { maxChunkTokens: -1 })).rejects.toThrow()
    await expect(executeKnowledgeSplitter(structured, input(), [], {})).rejects.toThrow()
    await expect(
        executeKnowledgeSplitter(structured, input(), {}, { category: KBDocumentCategoryEnum.Sheet })
    ).rejects.toThrow()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
})

it('applies the shared final token cap when auto selects a legacy strategy', async () => {
    const result = await executeKnowledgeSplitter(
        auto,
        [
            new Document<ChunkMetadata>({
                pageContent: 'apple '.repeat(128),
                metadata: { chunkId: 'plain', contentFormat: 'text', searchContent: 'apple '.repeat(128) }
            })
        ],
        { chunkSize: 4000, chunkOverlap: 0 },
        { maxChunkTokens: 16 }
    )
    expect(result.decisions[0].resolvedStrategy).toBe('recursive-character')
    expect(result.chunks.every((chunk) => countTextTokens(chunk.pageContent) <= 16)).toBe(true)
    expect(result.chunks.every((chunk) => chunk.metadata.searchContent === chunk.pageContent)).toBe(true)
    expect(result.chunks.every((chunk) => chunk.metadata.chunking.continued)).toBe(true)
    expect(result.decisions[0].warnings).toContain('structure-split')
})

it('uses the enclosing document identity when converter fragments have no duplicate documentId', async () => {
    const fragments = [
        new Document<ChunkMetadata>({
            pageContent: '# Manual',
            metadata: { chunkId: 'title', contentFormat: 'markdown' }
        }),
        ...input()
    ]
    const result = await splitKnowledgeDocuments(
        registry,
        {
            id: 'enclosing-document',
            type: 'md',
            parserConfig: { textSplitterType: 'auto' }
        },
        fragments
    )
    expect(result.decisions).toHaveLength(1)
    expect(result.decisions[0].resolvedStrategy).toBe('structure-aware')
    expect(fragments[0].metadata.documentId).toBeUndefined()
})

it('keeps document-level zero authoritative over a stale pipeline envelope in splitter options', async () => {
    const result = await splitKnowledgeDocuments(
        registry,
        {
            type: 'md',
            parserConfig: {
                textSplitterType: 'structure-aware',
                maxChunkTokens: 0,
                textSplitter: { maxChunkTokens: 1 }
            }
        },
        input()
    )
    expect(result.chunks.some((chunk) => countTextTokens(chunk.pageContent) > 1)).toBe(true)
})

it('invalidates exact source ranges when preprocessing changes the saved evidence', async () => {
    const original = new Document<ChunkMetadata>({
        pageContent: '# A\n\nContact test@example.org before applying.',
        metadata: { chunkId: 'source', contentFormat: 'markdown' }
    })
    const result = await splitKnowledgeDocuments(
        registry,
        {
            type: 'md',
            parserConfig: {
                textSplitterType: 'structure-aware',
                removeSensitive: true,
                chunkSize: 1000,
                chunkOverlap: 0
            }
        },
        [original]
    )
    expect(original.pageContent).toContain('test@example.org')
    expect(result.chunks.every((chunk) => !chunk.pageContent.includes('test@example.org'))).toBe(true)
    expect(result.decisions[0].warnings).toContain('coarse-provenance')
    expect(result.chunks.every((chunk) => chunk.metadata.chunking.sourceRanges.length === 0)).toBe(true)
})

it('rejects parent-child inputs instead of routing them into a different structure', async () => {
    const document = input()[0]
    document.metadata.parentId = 'parent'
    await expect(executeKnowledgeSplitter(auto, [document], {})).rejects.toThrow()
})
