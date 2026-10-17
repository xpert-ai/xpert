import { Test } from '@nestjs/testing'
import { CqrsModule, QueryBus } from '@nestjs/cqrs'
import { PublishedXpertAccessService } from '../published-xpert-access.service'
import { ResolvePublishedAgentHandler, ResolvePublishedAgentQuery } from './resolve-published-agent.query'

describe('published Agent CQRS wiring', () => {
    it('dispatches through an injected authorization service and propagates denial', async () => {
        const access = { getAccessiblePublishedXpert: jest.fn().mockRejectedValue(Error('scope denied')) }
        const module = await Test.createTestingModule({
            imports: [CqrsModule.forRoot()],
            providers: [ResolvePublishedAgentHandler, { provide: PublishedXpertAccessService, useValue: access }]
        }).compile()
        await module.init()
        try {
            await expect(
                module
                    .get(QueryBus)
                    .execute(
                        new ResolvePublishedAgentQuery({
                            requesterXpertId: 'requester',
                            expectation: { pluginName: 'bid', templateKey: 'company-material', agentKey: 'Company' }
                        })
                    )
            ).rejects.toThrow('scope denied')
            expect(access.getAccessiblePublishedXpert).toHaveBeenCalledWith('requester')
        } finally {
            await module.close()
        }
    })
})
