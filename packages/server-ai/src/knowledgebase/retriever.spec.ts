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
})
