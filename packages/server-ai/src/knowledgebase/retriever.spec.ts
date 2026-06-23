import { QueryBus } from '@nestjs/cqrs'
import { createKnowledgeRetriever } from './retriever'
import { KnowledgebaseGetOneQuery } from './queries'

describe('KnowledgeRetriever', () => {
    it('selects workspace scope fields when building a knowledgebase tool', async () => {
        const execute = jest.fn().mockResolvedValue({
            id: 'knowledgebase-1',
            name: 'Docs',
            description: 'Knowledgebase docs',
            metadataSchema: []
        })
        const queryBus = { execute } as unknown as QueryBus
        const retriever = createKnowledgeRetriever(queryBus, 'knowledgebase-1')

        await retriever.toTool()

        expect(execute).toHaveBeenCalledWith(expect.any(KnowledgebaseGetOneQuery))
        const query = execute.mock.calls[0]?.[0]
        expect(query).toBeInstanceOf(KnowledgebaseGetOneQuery)
        if (!(query instanceof KnowledgebaseGetOneQuery)) {
            throw new Error('Expected knowledgebase query')
        }
        expect(query.input.options?.select).toEqual(
            expect.objectContaining({
                id: true,
                name: true,
                description: true,
                metadataSchema: true,
                workspaceId: true,
                tenantId: true,
                organizationId: true
            })
        )
    })

    it('returns citation-aware JSON from the knowledgebase tool', async () => {
        const execute = jest
            .fn()
            .mockResolvedValueOnce({
                id: 'knowledgebase-1',
                name: 'Docs',
                description: 'Knowledgebase docs',
                metadataSchema: []
            })
            .mockResolvedValueOnce([
                {
                    id: 'chunk-1',
                    pageContent: '质量控制内容',
                    metadata: {
                        chunkId: 'chunk-1',
                        knowledgeId: 'doc-1',
                        score: 0.89,
                        relevanceScore: 0.93
                    },
                    document: {
                        id: 'doc-1',
                        name: '质量手册.pdf',
                        fileUrl: 'https://files.local/doc-1.pdf',
                        mimeType: 'application/pdf'
                    }
                }
            ])
        const queryBus = { execute } as unknown as QueryBus
        const retriever = createKnowledgeRetriever(queryBus, 'knowledgebase-1')

        const knowledgeTool = await retriever.toTool()
        const output = await knowledgeTool.invoke({ input: '质量' })
        const parsed = JSON.parse(String(output))

        expect(execute).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                input: expect.objectContaining({
                    knowledgebases: ['knowledgebase-1'],
                    query: '质量'
                })
            })
        )
        expect(parsed.chunks).toEqual([
            expect.objectContaining({
                index: 1,
                chunkId: 'chunk-1',
                documentId: 'doc-1',
                knowledgebaseId: 'knowledgebase-1',
                documentName: '质量手册.pdf',
                fileUrl: 'https://files.local/doc-1.pdf',
                content: '质量控制内容',
                citationLabel: '⟦1⟧',
                citationUrl:
                    'xpert://knowledgebase/chunk?knowledgebaseId=knowledgebase-1&documentId=doc-1&chunkId=chunk-1',
                citationMarkdown:
                    '[⟦1⟧](xpert://knowledgebase/chunk?knowledgebaseId=knowledgebase-1&documentId=doc-1&chunkId=chunk-1)'
            })
        ])
        expect(parsed.citations).toEqual([
            expect.objectContaining({
                chunkId: 'chunk-1',
                documentId: 'doc-1',
                citationMarkdown:
                    '[⟦1⟧](xpert://knowledgebase/chunk?knowledgebaseId=knowledgebase-1&documentId=doc-1&chunkId=chunk-1)'
            })
        ])
    })
})
