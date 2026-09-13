import {
    IDocChunkMetadata,
    IKnowledgeDocument,
    IKnowledgeDocumentChunk,
    KnowledgeChunkQuestions
} from '@xpert-ai/contracts'
import { buildQuestionVectors, isCurrentQuestionVector } from './question-vectors'
import { questionSourceHash } from './question-generation'
import { mergeQuestionProjectionIds } from './question-rebuild'

it('guards question embeddings while retaining original evidence and tracks projection ids across rebuilds', () => {
    const document = { id: 'doc', knowledgebaseId: 'kb' } as IKnowledgeDocument
    const chunk: IKnowledgeDocumentChunk<IDocChunkMetadata> = {
        id: 'row',
        pageContent: 'Original source',
        metadata: { chunkId: 'logical', parentId: 'parent' }
    }
    const state: KnowledgeChunkQuestions = {
        status: 'ready',
        generationId: 'generation',
        inputHash: 'input',
        sourceHash: questionSourceHash(chunk),
        updatedAt: new Date().toISOString(),
        questions: [{ id: 'q1', question: 'Why '.repeat(100) }],
        vectorIds: []
    }
    const original = buildQuestionVectors(document, chunk, state, 8192)
    const current = { ...state, vectorIds: original.ids, questions: original.questions }
    const rebuilt = buildQuestionVectors(document, chunk, current, 100)
    expect(rebuilt.ids.length).toBeGreaterThan(original.ids.length)
    expect(new Set(rebuilt.ids).size).toBe(rebuilt.ids.length)
    for (const part of rebuilt.chunks) {
        expect(part.pageContent).toBe('Original source')
        expect(part.metadata.chunkId).toBe('logical')
        expect(part.metadata.parentId).toBe('parent')
        expect(part.metadata.searchContent.length).toBeLessThanOrEqual(75)
    }
    const merged = mergeQuestionProjectionIds(current, rebuilt)
    expect(merged.vectorIds).toEqual(expect.arrayContaining([...original.ids, ...rebuilt.ids]))
    expect(merged.questions[0].vectorIds).toEqual(merged.vectorIds)
    chunk.metadata.questionGeneration = merged
    expect(isCurrentQuestionVector(rebuilt.chunks[0].metadata, chunk)).toBe(true)
    chunk.pageContent = 'Changed source'
    expect(isCurrentQuestionVector(rebuilt.chunks[0].metadata, chunk)).toBe(false)
})
