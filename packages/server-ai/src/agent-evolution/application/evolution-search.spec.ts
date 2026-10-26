import { Test, TestingModule } from '@nestjs/testing'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import { AgentEvolutionStore } from './agent-evolution.store'
import { AGENT_EVOLUTION_ENTITIES } from '../entities'

describe('evolution business search before pagination', () => {
    let module: TestingModule
    let store: AgentEvolutionStore
    const query = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0])
    }
    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                AgentEvolutionStore,
                { provide: getDataSourceToken(), useValue: {} },
                ...AGENT_EVOLUTION_ENTITIES.map((entity) => ({
                    provide: getRepositoryToken(entity),
                    useValue: { createQueryBuilder: () => query }
                }))
            ]
        }).compile()
        store = module.get(AgentEvolutionStore)
    })
    afterAll(() => module.close())
    beforeEach(() => jest.clearAllMocks())

    it.each([
        ['listTargets', 'target', 'displayName'],
        ['listLearningEvents', 'event', 'finalOutcomeSummary'],
        ['listCandidates', 'candidate', 'candidateId'],
        ['listEvaluations', 'evaluation', 'runId'],
        ['listDeployments', 'deployment', 'releasePackageId']
    ] as const)('%s filters display fields and keeps tenant/organization constraints', async (method, alias, field) => {
        await store[method]({ tenantId: 't', organizationId: 'o' }, { search: ' needle%_! ', page: 2, pageSize: 20 })
        expect(query.where).toHaveBeenCalledWith(`${alias}.tenantId = :tenantId`, { tenantId: 't' })
        expect(query.andWhere).toHaveBeenCalledWith(`${alias}.organizationId = :organizationId`, {
            organizationId: 'o'
        })
        expect(query.andWhere).toHaveBeenCalledWith(expect.stringContaining(field), { search: '%needle!%!_!!%' })
        expect(query.skip).toHaveBeenCalledWith(20)
        expect(query.take).toHaveBeenCalledWith(20)
        expect(query.andWhere.mock.invocationCallOrder.at(-1)).toBeLessThan(query.take.mock.invocationCallOrder[0])
    })

    it('keeps mechanism and strategy restrictions on evaluation results and does not change blank search', async () => {
        await store.listEvaluations({ tenantId: 't' }, {})
        expect(query.innerJoin).toHaveBeenCalled()
        expect(query.andWhere).toHaveBeenCalledWith("evaluation.value ->> 'evaluatorKind' = :mechanism", {
            mechanism: 'golden_replay'
        })
        expect(query.andWhere).toHaveBeenCalledWith('evaluation.organizationId IS NULL')
        expect(query.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('ILIKE'), expect.anything())
    })
})
