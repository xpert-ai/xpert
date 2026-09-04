import { createKnowledgebaseCitationFromDocument } from './citation'

describe('knowledgebase citation', () => {
    it('links FAQ results to their canonical FAQ entry', () => {
        const citation = createKnowledgebaseCitationFromDocument(
            {
                pageContent: '完整 FAQ 回答',
                metadata: {
                    knowledgebaseId: 'kb-1',
                    knowledgeId: 'faq-document',
                    chunkId: 'faq-1',
                    contentKind: 'faq',
                    standardQuestion: '如何重置密码？',
                    similarQuestions: [],
                    answerBlocks: ['打开设置页面。'],
                    enabled: true,
                    faqVectorIds: []
                }
            },
            1
        )

        expect(citation).toEqual(
            expect.objectContaining({
                faqId: 'faq-1',
                citationUrl: 'xpert://knowledgebase/faq?knowledgebaseId=kb-1&faqId=faq-1',
                citationMarkdown: '[⟦1⟧](xpert://knowledgebase/faq?knowledgebaseId=kb-1&faqId=faq-1)'
            })
        )
    })
})
