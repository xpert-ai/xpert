import type { IKnowledgebase, IKnowledgeDocument } from '@xpert-ai/contracts'
import { validate as validateUuid } from 'uuid'
import { buildFAQVectorWrite, buildFAQVectorWriteFromMetadata } from './faq-vector'

describe('FAQ vector writes', () => {
    const knowledgebase = { id: 'knowledgebase-id' } as IKnowledgebase
    const document = { id: 'document-id', knowledgebaseId: knowledgebase.id } as IKnowledgeDocument

    it('uses stable UUIDs for every physical embedding part', () => {
        const input = {
            knowledgebase,
            document,
            faqId: 'faq-id',
            faq: {
                standardQuestion: 'How does splitting work?',
                answerBlocks: ['A deliberately longer answer.']
            },
            config: {
                indexMode: 'question_answer' as const,
                questionIndexMode: 'separate' as const
            },
            embeddingContextSize: 8
        }

        const first = buildFAQVectorWrite(input)
        const second = buildFAQVectorWrite(input)

        expect(first.ids.length).toBeGreaterThan(2)
        expect(new Set(first.ids).size).toBe(first.ids.length)
        expect(first.ids.every(validateUuid)).toBe(true)
        expect(first.ids).toEqual(second.ids)
        expect(first.chunks.every((chunk) => chunk.metadata.chunkId === input.faqId)).toBe(true)
        expect(first.chunks.map((chunk) => chunk.metadata.faqVectorId)).toEqual(first.ids)
    })

    it('preserves negative questions when rebuilding vectors from canonical metadata', () => {
        const result = buildFAQVectorWriteFromMetadata({
            knowledgebase,
            document,
            faqId: 'faq-id',
            metadata: {
                chunkId: 'faq-id',
                contentKind: 'faq',
                standardQuestion: 'What is Xpert?',
                similarQuestions: ['Describe Xpert'],
                negativeQuestions: ['What does the word xpert mean?'],
                answerBlocks: ['Xpert is an agent platform.'],
                enabled: true,
                faqVectorIds: [],
                vectorSyncStatus: 'ready'
            },
            config: {
                indexMode: 'question_answer',
                questionIndexMode: 'separate',
                negativeMatchMode: 'exact'
            },
            embeddingContextSize: 128
        })

        expect(
            result.chunks.every((chunk) => chunk.metadata.negativeQuestions?.[0] === 'What does the word xpert mean?')
        ).toBe(true)
    })
})
