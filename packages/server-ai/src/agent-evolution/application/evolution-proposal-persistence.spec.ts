import { Test } from '@nestjs/testing'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import type { ImprovementProposal } from '@xpert-ai/contracts'
import { FEEDBACK_LEARNING_STRATEGY } from '@xpert-ai/contracts'
import { AgentEvolutionStore } from './agent-evolution.store'
import * as entities from '../entities'

describe('Evolution proposal metadata persistence', () => {
    it('updates the prepared proposal row without losing its request identity', async () => {
        const proposal: ImprovementProposal = {
            strategy: {
                definition: FEEDBACK_LEARNING_STRATEGY,
                riskLevel: 'R2',
                hash: 'frozen-strategy-hash',
                providerKey: 'test.mapping',
                providerVersion: '1'
            },
            sourceKind: 'learning_events',
            proposalId: 'PROP-EVO-test',
            revision: 1,
            targetId: 'test.mapping',
            scope: { type: 'organization', key: 'org' },
            title: 'Reviewed hypothesis',
            problemStatement: 'Missing mapping',
            rootCause: 'Missing alias',
            changeHypothesis: 'Add the reviewed alias',
            riskLevel: 'R2',
            evidenceEventIds: [],
            baseVersionId: 'v1',
            status: 'draft',
            createdAt: '2026-09-08T00:00:00Z',
            createdBy: 'reviewer'
        }
        const existing = { id: 'row-1', requestId: 'request-1', value: { ...proposal, title: 'test.mapping' } }
        const repository = {
            findOne: jest.fn().mockResolvedValue(existing),
            create: jest.fn((value) => value),
            save: jest.fn((value) => value)
        }
        const module = await Test.createTestingModule({
            providers: [
                AgentEvolutionStore,
                { provide: getDataSourceToken(), useValue: {} },
                ...Object.values(entities)
                    .filter((entity) => typeof entity === 'function')
                    .map((entity) => ({
                        provide: getRepositoryToken(entity),
                        useValue: entity === entities.ImprovementProposalEntity ? repository : {}
                    }))
            ]
        }).compile()
        const saved = await module
            .get(AgentEvolutionStore)
            .saveProposal({ tenantId: 'tenant', organizationId: 'org' }, proposal)
        expect(repository.findOne).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant',
                organizationId: 'org',
                proposalId: proposal.proposalId,
                revision: 1
            }
        })
        expect(saved).toMatchObject({ id: 'row-1', requestId: 'request-1', value: { title: 'Reviewed hypothesis' } })
        await module.close()
    })
})
