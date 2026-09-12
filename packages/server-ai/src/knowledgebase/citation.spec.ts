import { createKnowledgebaseCitationFromDocument, formatKnowledgebaseRetrievalToolOutput } from './citation'

describe('knowledgebase citation', () => {
    it('does not expose embedding-only table descriptions through pure keyword evidence', () => {
        const output = formatKnowledgebaseRetrievalToolOutput(
            [
                {
                    pageContent: 'original row',
                    metadata: {
                        documentId: 'doc',
                        chunkId: 'row',
                        tableSource: { tableId: 'sheet:0', rowNumber: 2 },
                        searchContent: 'embedding-only explanation'
                    }
                }
            ],
            'kb'
        )
        expect(output).toContain('original row')
        expect(output).not.toContain('embedding-only explanation')
    })
    it('provides table meaning to answers while citing the original row', () => {
        const doc = {
            pageContent: '{"amt":10}',
            metadata: {
                documentId: 'table-doc',
                chunkId: 'row-2',
                tableSource: { tableId: 'sheet:0', rowNumber: 2 },
                tableContext: {
                    tableId: 'sheet:0',
                    resultHash: 'result',
                    sheetName: 'Orders',
                    summary: 'Sales orders',
                    columns: [{ columnId: 'A', key: 'amt', description: 'Order amount', unit: 'CNY' }]
                }
            }
        }
        const citation = createKnowledgebaseCitationFromDocument(doc, 1, 'kb-1')
        expect(citation.snippet).toBe(doc.pageContent)
        expect(citation.citationUrl).toContain('documentId=table-doc&chunkId=row-2')
        expect(formatKnowledgebaseRetrievalToolOutput([doc], 'kb-1')).toContain('Order amount')
    })
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

    it('links Wiki results to the active Wiki page and section', () => {
        const citation = createKnowledgebaseCitationFromDocument(
            {
                pageContent: 'Wiki content',
                metadata: {
                    knowledgebaseId: 'kb-1',
                    chunkId: 'wiki-vector-1',
                    contentKind: 'wiki',
                    wikiPageId: 'page-1',
                    wikiPageVersionId: 'version-1',
                    wikiPageKey: 'entity:xpert',
                    wikiPageType: 'entity',
                    wikiRevision: 1,
                    sectionAnchor: 'overview',
                    projectionStatus: 'ready'
                }
            },
            2
        )

        expect(citation.citationUrl).toBe('/xpert/knowledges/kb-1/wiki?wikiPageId=page-1&section=overview')
        expect(citation.wikiPageId).toBe('page-1')
    })
})
