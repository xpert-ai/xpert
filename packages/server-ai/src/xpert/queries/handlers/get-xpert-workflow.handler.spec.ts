import { GetXpertWorkflowQuery } from '../get-xpert-workflow.query'
import { GetXpertWorkflowHandler } from './get-xpert-workflow.handler'

describe('GetXpertWorkflowHandler', () => {
    it('loads the xpert with runtime workspace access', async () => {
        const graph = {
            nodes: [],
            connections: []
        }
        const service = {
            findOneForRuntime: jest.fn().mockResolvedValue({
                id: 'xpert-1',
                tenantId: 'tenant-1',
                graph,
                agent: null,
                agents: [],
                executors: []
            })
        }
        const handler = new GetXpertWorkflowHandler(
            service as unknown as ConstructorParameters<typeof GetXpertWorkflowHandler>[0],
            {
                translate: jest.fn()
            } as unknown as ConstructorParameters<typeof GetXpertWorkflowHandler>[1],
            {
                execute: jest.fn()
            } as unknown as ConstructorParameters<typeof GetXpertWorkflowHandler>[2]
        )

        await expect(handler.execute(new GetXpertWorkflowQuery('xpert-1'))).resolves.toEqual({ graph })
        expect(service.findOneForRuntime).toHaveBeenCalledWith(
            'xpert-1',
            expect.objectContaining({
                relations: expect.arrayContaining(['agent', 'knowledgebases', 'toolsets'])
            })
        )
    })
})
