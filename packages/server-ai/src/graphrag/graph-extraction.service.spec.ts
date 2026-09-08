import { QueryBus } from '@nestjs/cqrs'
import { KnowledgeGraphIndexJobStatus } from '@xpert-ai/contracts'
import { EntityManager, Repository } from 'typeorm'
import { Knowledgebase } from '../knowledgebase/knowledgebase.entity'
import { KnowledgeIdentityObservation } from '../knowledgebase/identity/knowledge-identity-observation.entity'
import { KnowledgeIdentityService } from '../knowledgebase/identity/knowledge-identity.service'
import {
    KnowledgeIdentityInput,
    KnowledgeIdentityRuntime,
    KnowledgeIdentitySource
} from '../knowledgebase/identity/knowledge-identity.types'
import { KnowledgeGraphIndexJob } from './entities'
import { KnowledgeGraphExtractionService } from './graph-extraction.service'
import { TKnowledgeGraphExtraction } from './types'

describe('Graph adapter for shared identity', () => {
    it('replays a durable extraction after interruption without invoking the model again', async () => {
        const job = Object.assign(new KnowledgeGraphIndexJob(), {
            id: 'job',
            extractionId: 'extraction',
            knowledgebaseId: 'kb',
            knowledgebase: Object.assign(new Knowledgebase(), { id: 'kb', chatModel: { copilotId: 'provider' } })
        })
        const invoke = jest.fn(async () => ({
            entities: [
                {
                    candidateId: 'team',
                    name: 'Operations',
                    type: 'organization',
                    identity: {
                        kind: 'entity',
                        entityType: 'organization',
                        description: 'North team.',
                        scope: 'north',
                        identifiers: []
                    },
                    evidence: [{ chunkId: 'body' }]
                }
            ],
            relations: []
        }))
        const repository = {
            findOneOrFail: async () => job,
            update: async (_criteria: unknown, patch: Partial<KnowledgeGraphIndexJob>) => {
                Object.assign(job, patch)
                return { affected: 1 }
            }
        }
        const service = new KnowledgeGraphExtractionService(
            repository as unknown as Repository<KnowledgeGraphIndexJob>,
            { execute: async () => ({ withStructuredOutput: () => ({ invoke }) }) } as unknown as QueryBus,
            {} as KnowledgeIdentityService
        )
        const chunks = [{ id: 'body', metadata: { chunkId: 'body' }, pageContent: 'North team is Operations.' }]
        const config = {
            enabled: true,
            mode: 'hybrid' as const,
            entityTopK: 20,
            neighborHops: 1,
            communityTopK: 3,
            graphWeight: 0.5,
            extractionBatchSize: 4,
            extractionMaxCharacters: 12000
        }
        const first = await service.extractOnce(job, chunks, config)
        invoke.mockRejectedValue(new Error('The model must not run during snapshot replay'))
        expect(await service.extractOnce(job, chunks, config)).toEqual(first)
        expect(first.entities[0].candidateId).toBe('0:team')
        expect(invoke).toHaveBeenCalledTimes(1)
    })

    it('continues past an empty batch and returns candidates from later text', async () => {
        const output: TKnowledgeGraphExtraction = {
            entities: [
                {
                    candidateId: 'team',
                    name: 'Operations',
                    type: 'organization',
                    identity: {
                        kind: 'entity',
                        entityType: 'organization',
                        description: 'North team.',
                        scope: 'north',
                        identifiers: []
                    },
                    evidence: [{ chunkId: 'body' }]
                }
            ],
            relations: []
        }
        const invoke = jest.fn().mockResolvedValueOnce({ entities: [], relations: [] }).mockResolvedValueOnce(output)
        const service = new KnowledgeGraphExtractionService(
            { update: jest.fn() } as unknown as Repository<KnowledgeGraphIndexJob>,
            { execute: async () => ({ withStructuredOutput: () => ({ invoke }) }) } as unknown as QueryBus,
            {} as KnowledgeIdentityService
        )
        const result = await service.extract(
            Object.assign(new Knowledgebase(), { id: 'kb', chatModel: { copilotId: 'provider' } }),
            [
                { id: 'contents', metadata: { chunkId: 'contents' }, pageContent: 'Contents' },
                { id: 'body', metadata: { chunkId: 'body' }, pageContent: 'North team is Operations.' }
            ],
            'job',
            {
                enabled: true,
                mode: 'hybrid',
                entityTopK: 20,
                neighborHops: 1,
                communityTopK: 3,
                graphWeight: 0.5,
                extractionBatchSize: 1,
                extractionMaxCharacters: 12000
            }
        )
        expect(result.entities.map((entity) => entity.name)).toEqual(['Operations'])
        expect(result.entities[0].evidence).toEqual([{ chunkId: 'body' }])
    })

    function fixture() {
        const kb = Object.assign(new Knowledgebase(), {
            id: 'kb',
            graphRag: { enabled: true },
            graphRevision: 1,
            wikiConfig: { enabled: false },
            chatModel: { copilotId: 'provider', model: 'chat' }
        })
        const job = Object.assign(new KnowledgeGraphIndexJob(), {
            id: 'job',
            knowledgebaseId: 'kb',
            tenantId: 'tenant',
            organizationId: 'org',
            documentId: 'doc',
            sourceContentHash: 'hash',
            sourcePublicationEpoch: 3,
            revision: 1,
            status: KnowledgeGraphIndexJobStatus.RUNNING,
            knowledgebase: kb
        })
        const invoke = jest.fn(async () => ({ decision: 'same', identityId: 'shared', reason: 'Same object.' }))
        const queryBus = { execute: jest.fn(async () => ({ withStructuredOutput: jest.fn(() => ({ invoke })) })) }
        const identities = {
            assertSource: jest.fn(async () => undefined),
            resolveBatch: jest.fn(
                async (
                    _source: KnowledgeIdentitySource,
                    inputs: KnowledgeIdentityInput[],
                    runtime: KnowledgeIdentityRuntime
                ) => {
                    const input = inputs[0]
                    await runtime.judge(
                        {
                            ...input,
                            candidateId: 'candidate',
                            candidates: [
                                { id: 'shared', canonicalName: 'North Team', aliases: [], descriptor: input.descriptor }
                            ]
                        },
                        0
                    )
                    return inputs.map((input) =>
                        Object.assign(new KnowledgeIdentityObservation(), {
                            candidateKey: input.candidateKey,
                            identityId: 'shared'
                        })
                    )
                }
            )
        }
        const jobs = { findOne: jest.fn(async () => job) }
        const service = new KnowledgeGraphExtractionService(
            jobs as unknown as Repository<KnowledgeGraphIndexJob>,
            queryBus as unknown as QueryBus,
            identities as unknown as KnowledgeIdentityService
        )
        const manager = {
            getRepository: (type: object) => (type === Knowledgebase ? { findOne: async () => kb } : jobs)
        } as unknown as EntityManager
        return { service, kb, job, invoke, queryBus, identities, jobs, manager }
    }

    it('resolves graph candidates with the graph model when Wiki is disabled', async () => {
        const h = fixture()
        const extraction: TKnowledgeGraphExtraction = {
            entities: [
                {
                    candidateId: 'team',
                    name: 'Operations',
                    type: 'organization',
                    identity: {
                        kind: 'entity',
                        entityType: 'organization',
                        description: 'North team.',
                        scope: 'north',
                        identifiers: []
                    },
                    evidence: [{ chunkId: 'chunk', quote: 'North team evidence.' }]
                }
            ],
            relations: []
        }
        expect(await h.service.resolveIdentities(h.job, extraction)).toEqual(new Map([['team', 'shared']]))
        expect(h.identities.resolveBatch).toHaveBeenCalledWith(
            expect.objectContaining({ consumer: 'graph', sourcePublicationEpoch: 3 }),
            expect.arrayContaining([expect.objectContaining({ descriptor: extraction.entities[0].identity })]),
            expect.any(Object)
        )
        expect(h.queryBus.execute).toHaveBeenCalledTimes(1)
        expect(h.invoke).toHaveBeenCalledTimes(1)
    })

    it('keeps graph revision and document generation checks independent from Wiki enablement', async () => {
        const h = fixture()
        await h.service.assertCurrent(h.manager, h.job)
        expect(h.identities.assertSource).toHaveBeenCalledWith(
            h.manager,
            expect.objectContaining({ sourceContentHash: 'hash', sourcePublicationEpoch: 3 })
        )
        h.kb.graphRevision = 2
        await expect(h.service.assertCurrent(h.manager, h.job)).rejects.toMatchObject({ code: 'stale' })
    })

    it('rejects an older graph job superseded by a retry before projection writes', async () => {
        const h = fixture()
        h.jobs.findOne
            .mockResolvedValueOnce(h.job)
            .mockResolvedValueOnce(Object.assign(new KnowledgeGraphIndexJob(), h.job, { id: 'newer-job' }))
        await expect(h.service.assertCurrent(h.manager, h.job)).rejects.toMatchObject({ code: 'stale' })
        expect(h.identities.assertSource).not.toHaveBeenCalled()
    })
})
