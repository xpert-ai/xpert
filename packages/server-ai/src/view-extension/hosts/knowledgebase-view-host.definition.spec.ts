import { KnowledgebaseViewHostDefinition } from './knowledgebase-view-host.definition'

describe('KnowledgebaseViewHostDefinition', () => {
    it('resolves a host through the knowledgebase read boundary', async () => {
        const knowledgebaseService = {
            findOneByIdString: jest.fn(async () => ({
                id: 'kb-1',
                name: 'Owner knowledgebase',
                type: 'standard',
                status: 'finish',
                documentNum: 2,
                tokenNum: 10,
                chunkNum: 4,
                workspaceId: 'workspace-1',
                pipelineId: 'pipeline-1'
            }))
        }
        const definition = new KnowledgebaseViewHostDefinition(
            knowledgebaseService as unknown as ConstructorParameters<typeof KnowledgebaseViewHostDefinition>[0]
        )

        await expect(definition.resolve('kb-1')).resolves.toEqual({
            workspaceId: 'workspace-1',
            hostSnapshot: {
                id: 'kb-1',
                name: 'Owner knowledgebase',
                type: 'standard',
                status: 'finish',
                documentNum: 2,
                tokenNum: 10,
                chunkNum: 4,
                workspaceId: 'workspace-1',
                pipelineId: 'pipeline-1'
            }
        })
        expect(knowledgebaseService.findOneByIdString).toHaveBeenCalledWith(
            'kb-1',
            expect.objectContaining({ select: expect.objectContaining({ id: true, workspaceId: true }) })
        )
    })

    it('does not return a host snapshot when the knowledgebase read boundary rejects the caller', async () => {
        const accessError = new Error('denied')
        const knowledgebaseService = {
            findOneByIdString: jest.fn(async () => {
                throw accessError
            })
        }
        const definition = new KnowledgebaseViewHostDefinition(
            knowledgebaseService as unknown as ConstructorParameters<typeof KnowledgebaseViewHostDefinition>[0]
        )

        await expect(definition.resolve('victim-kb')).rejects.toBe(accessError)
    })
})
