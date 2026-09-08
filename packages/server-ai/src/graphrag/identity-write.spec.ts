import { EntityManager, QueryFailedError } from 'typeorm'
import {
    KnowledgeGraphEntity,
    KnowledgeGraphEntityContribution,
    KnowledgeGraphIndexJob,
    KnowledgeGraphRelation,
    KnowledgeGraphRelationContribution
} from './entities'
import { GraphragService } from './graphrag.service'

describe('Graph identity write conflicts', () => {
    function fixture() {
        const winner = Object.assign(new KnowledgeGraphEntity(), { id: 'entity', name: 'Information retrieval' })
        const duplicate = new QueryFailedError(
            'INSERT',
            [],
            Object.assign(new Error('duplicate key'), { code: '23505' })
        )
        const repository = {
            findOne: jest.fn().mockResolvedValueOnce(null).mockResolvedValue(winner),
            create: jest.fn((value: object) => value),
            save: jest.fn().mockResolvedValue(winner),
            createQueryBuilder: jest.fn(() => query),
            findOneOrFail: jest.fn().mockResolvedValue(winner),
            findOneByOrFail: jest.fn().mockResolvedValue(winner)
        }
        const query = {
            insert: jest.fn(),
            values: jest.fn(),
            orIgnore: jest.fn(),
            execute: jest.fn(async () => undefined)
        }
        query.insert.mockReturnValue(query)
        query.values.mockReturnValue(query)
        query.orIgnore.mockReturnValue(query)
        const contributionRepository = {
            findOne: jest.fn().mockResolvedValue(null),
            find: jest.fn().mockResolvedValue([]),
            create: jest.fn((value: object) => value),
            save: jest.fn().mockResolvedValue(undefined)
        }
        const manager = {
            getRepository: (entity: unknown) =>
                entity === KnowledgeGraphEntityContribution || entity === KnowledgeGraphRelationContribution
                    ? contributionRepository
                    : repository,
            transaction: async (run: (value: EntityManager) => Promise<unknown>) =>
                run(manager as unknown as EntityManager)
        }
        Object.assign(repository, { manager })
        const service = Object.assign(Object.create(GraphragService.prototype), {
            entityRepository: repository,
            relationRepository: repository,
            entityContributionRepository: contributionRepository,
            relationContributionRepository: contributionRepository
        }) as GraphragService
        const job = Object.assign(new KnowledgeGraphIndexJob(), {
            tenantId: 'tenant',
            organizationId: 'org',
            knowledgebaseId: 'kb',
            documentId: 'doc',
            sourceContentHash: 'hash',
            sourcePublicationEpoch: 1,
            revision: 0
        })
        return { service, job, repository, contributionRepository, winner, duplicate, query }
    }

    it('reuses the concurrently inserted entity and keeps this document contribution', async () => {
        const { service, job, repository, contributionRepository, winner } = fixture()
        await expect(
            service['upsertEntity'](job, { name: 'Information retrieval', type: 'Domain' }, 'shared')
        ).resolves.toBe(winner)
        expect(repository.findOne).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant',
                organizationId: 'org',
                knowledgebaseId: 'kb',
                identityId: 'shared'
            }
        })
        expect(contributionRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                entityId: 'entity',
                sourceDocumentIdSnapshot: 'doc',
                sourceContentHash: 'hash'
            })
        )
    })

    it('reuses the concurrently inserted relation and keeps this document contribution', async () => {
        const { service, job, repository, contributionRepository } = fixture()
        const relation = Object.assign(new KnowledgeGraphRelation(), { id: 'relation' })
        repository.findOne.mockReset().mockResolvedValue(relation).mockResolvedValueOnce(null)
        repository.findOneByOrFail.mockResolvedValue(relation)
        repository.findOneOrFail.mockResolvedValue(relation)
        await service['upsertRelation'](
            job,
            Object.assign(new KnowledgeGraphEntity(), { id: 'source' }),
            Object.assign(new KnowledgeGraphEntity(), { id: 'target' }),
            {
                type: 'belongs to'
            }
        )
        expect(contributionRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                relationId: 'relation',
                sourceDocumentIdSnapshot: 'doc'
            })
        )
    })

    it('does not hide a uniqueness error when no matching identity exists', async () => {
        const { service, job, repository, duplicate } = fixture()
        repository.findOne.mockReset().mockResolvedValue(null)
        repository.findOneOrFail.mockRejectedValue(duplicate)
        await expect(service['upsertEntity'](job, { name: 'Name', type: 'domain' }, 'shared')).rejects.toBe(duplicate)
    })

    it('does not treat other database errors as identity conflicts', async () => {
        const { service, job, repository, query } = fixture()
        const error = new Error('connection lost')
        query.execute.mockRejectedValue(error)
        await expect(service['upsertEntity'](job, { name: 'Name', type: 'domain' }, 'shared')).rejects.toBe(error)
        expect(repository.findOne).toHaveBeenCalledTimes(1)
    })
})
