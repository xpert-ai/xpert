import { AIMessage } from '@langchain/core/messages'
import { JsonOutputKeyToolsParser } from '@langchain/core/output_parsers/openai_tools'
import { FakeChatModel } from '@langchain/core/utils/testing'
import { QueryBus } from '@nestjs/cqrs'
import { KnowledgeGraphIndexJobStatus } from '@xpert-ai/contracts'
import { EntityManager, Repository } from 'typeorm'
import {
    buildKnowledgeIdentityDedupMessages,
    createKnowledgeIdentityDedupOutputSchema,
    KnowledgeIdentityDedupModelInput,
    KnowledgeIdentityDedupModelOutput,
    parseKnowledgeIdentityDedupOutput
} from '../knowledgebase/identity/knowledge-identity-model'
import { KnowledgeIdentityService } from '../knowledgebase/identity/knowledge-identity.service'
import {
    KnowledgeIdentityInput,
    KnowledgeIdentityRuntime,
    KnowledgeIdentitySource
} from '../knowledgebase/identity/knowledge-identity.types'
import { Knowledgebase } from '../knowledgebase/knowledgebase.entity'
import { KnowledgeGraphIndexJob } from './entities'
import { KnowledgeGraphExtractionService } from './graph-extraction.service'
import { judgeGraphIdentity } from './graph-identity-judge'
import { KnowledgeGraphProjectionWriter } from './graph-projection-writer'
import { GraphragService } from './graphrag.service'
import { TKnowledgeGraphExtraction } from './types'

const input: KnowledgeIdentityDedupModelInput = {
    candidateId: 'item',
    canonicalName: 'North Team',
    aliases: [],
    descriptor: {
        kind: 'entity',
        entityType: 'organization',
        description: 'North operations team.',
        scope: 'north',
        identifiers: []
    },
    facts: [{ text: 'North operations team.', sourceChunkIds: ['chunk'] }],
    candidates: [
        {
            id: 'existing-id',
            canonicalName: 'South Team',
            aliases: [],
            descriptor: {
                kind: 'entity',
                entityType: 'organization',
                description: 'South operations team.',
                scope: 'south',
                identifiers: []
            }
        }
    ]
}
const different = { decision: 'different', identityId: null, reason: 'Distinct teams.' }
const emptyId = { ...different, identityId: '' }
const snapshot: TKnowledgeGraphExtraction = {
    entities: [
        {
            candidateId: 'item',
            name: input.canonicalName,
            type: 'organization',
            identity: input.descriptor,
            evidence: [{ chunkId: 'chunk' }]
        }
    ],
    relations: []
}

// Keep the actual LangChain tool-output parser and model callbacks in the invocation
// pipeline. Only provider generation is replaced, so parser exceptions occur in invoke().
function modelFixture(responses: unknown[]) {
    const usage = jest.fn()
    const client = new FakeChatModel({ callbacks: [{ handleLLMEnd: usage }] })
    const generate = jest.spyOn(client, '_generate').mockImplementation(async () => {
        if (!responses.length) throw new Error('Unexpected extra model call')
        const response = responses.shift()
        const message = new AIMessage({
            content: '',
            tool_calls: [],
            additional_kwargs: {
                tool_calls: [
                    {
                        id: `call-${generate.mock.calls.length}`,
                        type: 'function',
                        function: { name: 'identity', arguments: JSON.stringify(response) }
                    }
                ]
            },
            usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 }
        })
        return { generations: [{ text: '', message }] }
    })
    const withStructuredOutput = jest.fn((schema: ReturnType<typeof createKnowledgeIdentityDedupOutputSchema>) =>
        client.pipe(
            new JsonOutputKeyToolsParser<KnowledgeIdentityDedupModelOutput>({
                keyName: 'identity',
                returnSingle: true,
                zodSchema: schema
            })
        )
    )
    const model = Object.assign(client, { withStructuredOutput })
    return { model, generate, usage, withStructuredOutput }
}

describe('Graph identity response correction', () => {
    afterEach(() => jest.restoreAllMocks())

    it('reproduces the empty-ID exception inside the structured invocation boundary', async () => {
        const h = modelFixture([emptyId])
        await expect(
            h.model
                .withStructuredOutput(createKnowledgeIdentityDedupOutputSchema(input))
                .invoke(buildKnowledgeIdentityDedupMessages(input))
        ).rejects.toMatchObject({
            lc_error_code: 'OUTPUT_PARSING_FAILURE',
            message: expect.stringContaining('identityId')
        })
        expect(h.usage).toHaveBeenCalledTimes(1)
    })

    it.each(['different', 'uncertain'])(
        'corrects an empty ID for %s without normalizing the invalid result',
        async (decision) => {
            const corrected = { ...different, decision }
            const h = modelFixture([{ ...emptyId, decision }, corrected])
            expect(await judgeGraphIdentity(h.model, input)).toEqual(corrected)
            expect(h.generate).toHaveBeenCalledTimes(2)
            expect(h.usage).toHaveBeenCalledTimes(2)
            expect(h.generate.mock.calls[1][0][0].content).toContain('previous response failed validation')
            expect(h.generate.mock.calls[1][0][0].content).toContain('must be null, never an empty string')
            expect(h.generate.mock.calls[1][0][1].content).toEqual(h.generate.mock.calls[0][0][1].content)
            expect(h.withStructuredOutput.mock.calls[0][0].safeParse(emptyId).success).toBe(false)
        }
    )

    it.each([
        { decision: 'same', identityId: 'invented-id' },
        { decision: 'same', identityId: input.candidateId },
        { decision: 'same', identityId: null },
        { decision: 'different', identityId: 'existing-id' },
        { decision: 'uncertain', identityId: 'existing-id' }
    ])('corrects an invalid identity contract: $decision / $identityId', async (invalid) => {
        const corrected = { decision: 'same', identityId: 'existing-id', reason: 'Explicit matching evidence.' }
        const h = modelFixture([{ ...invalid, reason: 'Invalid target.' }, corrected])
        expect(await judgeGraphIdentity(h.model, input)).toEqual(corrected)
        expect(h.generate).toHaveBeenCalledTimes(2)
        const schema = h.withStructuredOutput.mock.calls[0][0]
        expect(schema.safeParse({ ...corrected, identityId: 'invented-id' }).success).toBe(false)
    })

    it('does not call the model again for an already valid decision', async () => {
        const h = modelFixture([different])
        expect(await judgeGraphIdentity(h.model, input)).toEqual(different)
        expect(h.generate).toHaveBeenCalledTimes(1)
    })

    it.each([
        emptyId,
        { ...different, decision: 'same', identityId: 'foreign-id' },
        { ...different, identityId: 'existing-id' }
    ])('fails explicitly when the corrective response is still invalid: %j', async (invalid) => {
        const h = modelFixture([emptyId, invalid, different])
        await expect(judgeGraphIdentity(h.model, input)).rejects.toMatchObject({
            code: 'graph_identity_output_invalid',
            message: expect.stringContaining('after one corrective attempt'),
            cause: expect.any(Error)
        })
        expect(h.generate).toHaveBeenCalledTimes(2)
        expect(h.usage).toHaveBeenCalledTimes(2)
    })

    it.each(['Forbidden', 'Network timeout', 'Aborted'])(
        'propagates non-validation errors without a corrective call: %s',
        async (message) => {
            const error = new Error(message)
            const h = modelFixture([])
            h.generate.mockRejectedValue(error)
            await expect(judgeGraphIdentity(h.model, input)).rejects.toBe(error)
            expect(h.generate).toHaveBeenCalledTimes(1)
        }
    )

    it('preserves a provider failure during correction instead of reporting validation exhaustion', async () => {
        const h = modelFixture([emptyId])
        const generate = h.generate.getMockImplementation()
        const error = new Error('Provider unavailable')
        h.generate.mockImplementationOnce(generate).mockRejectedValueOnce(error)
        await expect(judgeGraphIdentity(h.model, input)).rejects.toBe(error)
        expect(h.generate).toHaveBeenCalledTimes(2)
    })

    function jobFixture(responses: unknown[]) {
        const h = modelFixture(responses)
        const knowledgebase = Object.assign(new Knowledgebase(), {
            id: 'kb',
            graphRag: { enabled: true },
            chatModel: { copilotId: 'provider' }
        })
        const job = Object.assign(new KnowledgeGraphIndexJob(), {
            id: 'job',
            knowledgebaseId: 'kb',
            documentId: 'doc',
            sourceContentHash: 'hash',
            sourcePublicationEpoch: 1,
            extractionId: 'saved-extraction',
            extractionSnapshot: snapshot,
            knowledgebase
        })
        const jobs = {
            findOne: jest.fn(async () => job),
            findOneOrFail: jest.fn(async () => job),
            update: jest.fn(async (_id: string, patch: Partial<KnowledgeGraphIndexJob>) => Object.assign(job, patch))
        }
        const identities = {
            resolveBatch: jest.fn(
                async (
                    _source: KnowledgeIdentitySource,
                    inputs: KnowledgeIdentityInput[],
                    runtime: KnowledgeIdentityRuntime
                ) => {
                    const answer = parseKnowledgeIdentityDedupOutput(await runtime.judge(input, 0), input)
                    return inputs.map((entity) => ({
                        candidateKey: entity.candidateKey,
                        identityId: answer.identityId ?? 'new-id'
                    }))
                }
            )
        }
        const queryBus = { execute: jest.fn(async () => h.model) }
        const extraction = new KnowledgeGraphExtractionService(
            jobs as unknown as Repository<KnowledgeGraphIndexJob>,
            queryBus as unknown as QueryBus,
            identities as unknown as KnowledgeIdentityService
        )
        const extract = jest
            .spyOn(extraction, 'extract')
            .mockRejectedValue(new Error('Must reuse the saved extraction'))
        jest.spyOn(extraction, 'assertCurrent').mockResolvedValue(undefined)
        const persist = jest.spyOn(KnowledgeGraphProjectionWriter.prototype, 'persist').mockResolvedValue([])
        const transaction = jest.fn(async (run: (manager: EntityManager) => Promise<unknown>) =>
            run({} as EntityManager)
        )
        const service = Object.create(GraphragService.prototype) as GraphragService
        Object.assign(service, {
            jobRepository: jobs,
            knowledgebaseRepository: { update: jest.fn() },
            extractionService: extraction,
            documentService: { findOne: async () => ({ contentHash: 'hash', publicationEpoch: 1 }) },
            chunkService: {
                findAll: async () => ({ items: [{ id: 'chunk', pageContent: 'North operations team.' }] })
            },
            entityRepository: { manager: { transaction } },
            clearDocument: jest.fn(),
            refreshEntityMentionCounts: jest.fn(),
            syncEntityVectors: jest.fn(),
            updateGraphStatusFromJobs: jest.fn()
        })
        return { ...h, job, jobs, service, extraction, extract, persist, transaction, queryBus }
    }

    it('continues a graph job after correction using its saved extraction', async () => {
        const h = jobFixture([emptyId, different])
        await h.service.processIndexJob(h.job.id)
        expect(h.job).toMatchObject({ status: KnowledgeGraphIndexJobStatus.SUCCESS, result: 'indexed', error: null })
        expect(h.extract).not.toHaveBeenCalled()
        expect(h.persist).toHaveBeenCalledTimes(1)
        expect(h.persist.mock.calls[0][3]).toEqual(new Map([['item', 'new-id']]))
        expect(h.generate).toHaveBeenCalledTimes(2)
        expect(h.queryBus.execute).toHaveBeenCalledTimes(1)
        expect(h.job.extractionId).toBe('saved-extraction')
        expect(h.job.extractionSnapshot).toEqual(snapshot)
    })

    it('retains a failed job and extraction after exhaustion, then reuses that extraction on retry', async () => {
        const h = jobFixture([emptyId, emptyId, different])
        await h.service.processIndexJob(h.job.id)
        expect(h.job).toMatchObject({
            status: KnowledgeGraphIndexJobStatus.FAILED,
            stage: 'persistence',
            error: expect.stringContaining('Graph identity resolution'),
            extractionId: 'saved-extraction',
            extractionSnapshot: snapshot
        })
        expect(h.job.error).toContain('after one corrective attempt')
        expect(h.generate).toHaveBeenCalledTimes(2)
        expect(h.transaction).not.toHaveBeenCalled()
        expect(h.persist).not.toHaveBeenCalled()
        // The retry handler copies this durable snapshot to the new job.
        Object.assign(h.job, { id: 'retry', status: KnowledgeGraphIndexJobStatus.QUEUED })
        await h.service.processIndexJob(h.job.id)
        expect(h.job).toMatchObject({ status: KnowledgeGraphIndexJobStatus.SUCCESS, result: 'indexed', error: null })
        expect(h.extract).not.toHaveBeenCalled()
        expect(h.generate).toHaveBeenCalledTimes(3)
        expect(h.persist).toHaveBeenCalledTimes(1)
        expect(h.job.extractionId).toBe('saved-extraction')
        expect(h.job.extractionSnapshot).toEqual(snapshot)
    })
})
