import { ChatOpenAI } from '@langchain/openai'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import i18next from 'i18next'
import { DataSource, EntityManager } from 'typeorm'
import { KnowledgeWikiJob, KnowledgeWikiModelInvocation } from './entities'
import { KnowledgeWikiInvocationBudgetService } from './knowledge-wiki-invocation-budget.service'
import { CopilotTokenRecordCommand } from '../../copilot-user'
import { KnowledgeWikiModelInvocationService } from './knowledge-wiki-model-invocation.service'

describe('KnowledgeWikiModelInvocationService', () => {
    beforeAll(async () => {
        await i18next.init({ lng: 'en', resources: {} })
    })
    function createHarness(spendEnvelope?: KnowledgeWikiJob['spendEnvelope']) {
        const invocations: KnowledgeWikiModelInvocation[] = []
        const invocationRepository = {
            findOne: jest.fn(({ where }) =>
                Promise.resolve(invocations.find((item) => item['requestId'] === where.requestId) ?? null)
            ),
            find: jest.fn(async () => invocations),
            create: jest.fn((input: Partial<KnowledgeWikiModelInvocation>) =>
                Object.assign(new KnowledgeWikiModelInvocation(), input)
            ),
            save: jest.fn(async (invocation: KnowledgeWikiModelInvocation) => {
                invocation.id ??= `invocation-${invocations.length + 1}`
                const index = invocations.findIndex((item) => item.id === invocation.id)
                if (index < 0) invocations.push(invocation)
                else invocations[index] = invocation
                return invocation
            }),
            update: jest.fn(
                async (where: { id: string; status: string }, patch: Partial<KnowledgeWikiModelInvocation>) => {
                    const item = invocations.find((item) => item.id === where.id && item.status === where.status)
                    if (!item) return { affected: 0 }
                    Object.assign(item, patch)
                    return { affected: 1 }
                }
            )
        }
        const root = Object.assign(new KnowledgeWikiJob(), job, { spendEnvelope })
        const jobs = { findOne: jest.fn(async () => root) }
        const manager = {
            getRepository: (entity: object) => (entity === KnowledgeWikiJob ? jobs : invocationRepository)
        }
        let transactionTail = Promise.resolve()
        const dataSource = {
            transaction: (work: (manager: EntityManager) => Promise<KnowledgeWikiModelInvocation>) => {
                const result = transactionTail.then(() => work(manager as unknown as EntityManager))
                transactionTail = result.then(
                    () => undefined,
                    () => undefined
                )
                return result
            }
        }
        const budget = new KnowledgeWikiInvocationBudgetService(dataSource as unknown as DataSource)
        const invoke = jest.fn().mockImplementation(async () => ({
            pages: [
                {
                    schemaVersion: 1,
                    pageType: 'entity',
                    identity: {
                        kind: 'entity',
                        entityType: 'product',
                        description: 'An AI platform.',
                        scope: null,
                        identifiers: []
                    },
                    canonicalName: 'Xpert',
                    aliases: [],
                    summary: 'An AI platform.',
                    facts: [{ text: 'Xpert is an AI platform.', sourceChunkIds: ['chunk-1'] }],
                    suggestedLinks: []
                }
            ]
        }))
        const withStructuredOutput = jest.fn(() => ({ invoke }))
        const modelRuntime = {
            createModelClient: jest.fn().mockImplementation(async (_model, options) => {
                options.usageCallback({
                    type: 'actual',
                    promptTokens: 10,
                    completionTokens: 5,
                    totalTokens: 15
                })
                return {
                    withStructuredOutput
                }
            })
        }
        const commandBus = { execute: jest.fn().mockResolvedValue(undefined) }
        const service = new KnowledgeWikiModelInvocationService(
            invocationRepository as never,
            modelRuntime as never,
            commandBus as never,
            budget
        )
        return {
            service,
            invocations,
            invocationRepository,
            modelRuntime,
            commandBus,
            invoke,
            jobs,
            withStructuredOutput
        }
    }

    const job = {
        id: 'job-1',
        generationAttempt: 0,
        billingPrincipalId: 'billing-user'
    }
    const knowledgebase = {
        id: 'kb-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        wikiConfig: {
            enabled: true,
            extractionGranularity: 'standard',
            contentGenerationRequirements: '',
            extractionFocus: ''
        },
        wikiModel: {
            id: 'model-1',
            copilotId: 'copilot-1',
            model: 'qwen',
            modelType: AiModelTypeEnum.LLM
        }
    }

    it('resolves prefixed citations against the supplied chunks on both new and cached model results', async () => {
        const { service, invoke, commandBus } = createHarness()
        invoke.mockResolvedValue({
            pages: [
                {
                    schemaVersion: 1,
                    pageType: 'concept',
                    identity: { kind: 'concept', definition: 'A documented strategy.', domain: null, scope: null },
                    canonicalName: 'Strategy',
                    aliases: [],
                    summary: 'A documented strategy.',
                    facts: [{ text: 'The strategy has an owner.', sourceChunkIds: ['id:chunk-1'] }],
                    suggestedLinks: []
                }
            ]
        })
        const run = () =>
            service.invokeMapModel(
                job as never,
                knowledgebase as never,
                'strategy.pdf',
                [{ id: 'chunk-1', content: 'The strategy has an owner.' }],
                0
            )

        const first = await run()
        const replay = await run()

        expect(first.pages[0].facts).toEqual([{ text: 'The strategy has an owner.', sourceChunkIds: ['chunk-1'] }])
        expect(replay).toEqual(first)
        expect(invoke).toHaveBeenCalledTimes(1)
        expect(commandBus.execute).toHaveBeenCalledTimes(1)
    })

    it('reports unusable citations as a validation failure without replaying or misclassifying the model call', async () => {
        const { service, invoke, invocations, commandBus } = createHarness()
        invoke.mockResolvedValue({
            pages: [
                {
                    schemaVersion: 1,
                    pageType: 'concept',
                    identity: { kind: 'concept', definition: 'A documented strategy.', domain: null, scope: null },
                    canonicalName: 'Strategy',
                    aliases: [],
                    summary: 'A documented strategy.',
                    facts: [{ text: 'The strategy has an owner.', sourceChunkIds: ['id:foreign-chunk'] }],
                    suggestedLinks: []
                }
            ]
        })
        const run = () =>
            service.invokeMapModel(
                job as never,
                knowledgebase as never,
                'strategy.pdf',
                [{ id: 'chunk-1', content: 'The strategy has an owner.' }],
                0
            )

        await expect(run()).rejects.toThrow('Wiki citation validation failed')
        await expect(run()).rejects.toThrow('Wiki citation validation failed')
        expect(invocations[0]).toMatchObject({ status: 'succeeded', billingStatus: 'delivered' })
        expect(invoke).toHaveBeenCalledTimes(1)
        expect(commandBus.execute).toHaveBeenCalledTimes(1)
    })

    it('disables runtime token recording and delivers one durable billing command', async () => {
        const { service, invocations, modelRuntime, commandBus, invoke } = createHarness()

        const first = await service.invokeMapModel(
            job as never,
            knowledgebase as never,
            'handbook.md',
            [{ id: 'chunk-1', content: 'Xpert is an AI platform.' }],
            0
        )
        const replay = await service.invokeMapModel(
            job as never,
            knowledgebase as never,
            'handbook.md',
            [{ id: 'chunk-1', content: 'Xpert is an AI platform.' }],
            0
        )

        expect(first).toEqual(replay)
        expect(modelRuntime.createModelClient).toHaveBeenCalledWith(
            knowledgebase.wikiModel,
            expect.objectContaining({ skipTokenRecord: true, usageCallback: expect.any(Function) }),
            expect.objectContaining({ userId: 'billing-user' })
        )
        expect(invoke).toHaveBeenCalledTimes(1)
        expect(commandBus.execute).toHaveBeenCalledTimes(1)
        expect(commandBus.execute.mock.calls[0][0]).toBeInstanceOf(CopilotTokenRecordCommand)
        expect(invocations[0]).toMatchObject({ status: 'succeeded', billingStatus: 'delivered' })
    })

    it('retries only billing delivery after the model output was persisted', async () => {
        const { service, invocations, modelRuntime, commandBus } = createHarness()
        commandBus.execute.mockRejectedValueOnce(new Error('billing unavailable')).mockResolvedValueOnce(undefined)

        await expect(
            service.invokeMapModel(
                job as never,
                knowledgebase as never,
                'handbook.md',
                [{ id: 'chunk-1', content: 'Xpert is an AI platform.' }],
                0
            )
        ).rejects.toThrow('billing unavailable')
        await expect(
            service.invokeMapModel(
                job as never,
                knowledgebase as never,
                'handbook.md',
                [{ id: 'chunk-1', content: 'Xpert is an AI platform.' }],
                0
            )
        ).resolves.toMatchObject({ pages: expect.any(Array) })

        expect(modelRuntime.createModelClient).toHaveBeenCalledTimes(1)
        expect(commandBus.execute).toHaveBeenCalledTimes(2)
        expect(invocations[0]).toMatchObject({ status: 'succeeded', billingStatus: 'delivered' })
    })

    it('does not replay a running invocation whose provider outcome is unknown', async () => {
        const { service, invocations, invoke } = createHarness()
        const run = () =>
            service.invokeMapModel(
                job as never,
                knowledgebase as never,
                'handbook.md',
                [{ id: 'chunk-1', content: 'Xpert' }],
                0
            )
        await run()
        invocations[0]['status'] = 'running'
        invocations[0]['structuredOutput'] = null

        await expect(run()).rejects.toThrow(/indeterminate/i)
        expect(invoke).toHaveBeenCalledTimes(1)
    })

    it('records a local preparation failure as not executed and safely retries the same reservation', async () => {
        const { service, invocations, withStructuredOutput, invoke, commandBus } = createHarness({
            maxModelInvocations: 1,
            maxEstimatedTokens: 200_000
        })
        withStructuredOutput.mockImplementationOnce(() => {
            throw new Error('Unsupported output schema')
        })
        const run = () =>
            service.invokeMapModel(
                job as never,
                knowledgebase as never,
                'doc',
                [{ id: 'chunk-1', content: 'Xpert' }],
                0
            )

        await expect(run()).rejects.toThrow('Unsupported output schema')
        expect(invocations[0]).toMatchObject({
            status: 'failed',
            reconciliationStatus: 'not_executed',
            errorCode: 'model_preparation_failed'
        })
        expect(invoke).not.toHaveBeenCalled()
        expect(commandBus.execute).not.toHaveBeenCalled()

        await expect(run()).resolves.toMatchObject({ pages: expect.any(Array) })
        expect(invocations).toHaveLength(1)
        expect(invoke).toHaveBeenCalledTimes(1)
        expect(invocations[0]).toMatchObject({ status: 'succeeded', errorCode: null, error: null })
    })

    it('also treats model client construction errors as not executed', async () => {
        const { service, invocations, modelRuntime, invoke } = createHarness()
        modelRuntime.createModelClient.mockRejectedValueOnce(new Error('Missing model credentials'))

        await expect(service.invokeMapModel(job as never, knowledgebase as never, 'doc', [], 0)).rejects.toThrow(
            'Missing model credentials'
        )
        expect(invocations[0]).toMatchObject({ status: 'failed', reconciliationStatus: 'not_executed' })
        expect(invoke).not.toHaveBeenCalled()
    })

    it('retains charge uncertainty after a dispatched call times out and never automatically replays it', async () => {
        const { service, invocations, invoke } = createHarness()
        invoke.mockRejectedValueOnce(new Error('Request timed out'))
        const run = () => service.invokeMapModel(job as never, knowledgebase as never, 'doc', [], 0)

        await expect(run()).rejects.toThrow('Request timed out')
        expect(invocations[0]).toMatchObject({ status: 'indeterminate', reconciliationStatus: 'indeterminate' })
        await expect(run()).rejects.toThrow(/indeterminate/i)
        expect(invoke).toHaveBeenCalledTimes(1)
    })

    it.each([
        { type: 'invalid_request_error', code: null },
        { type: null, code: 'InternalError.Algo.InvalidParameter' }
    ])('records an explicit SDK parameter rejection as not executed (%j)', async (error) => {
        const { service, modelRuntime, invocations, commandBus } = createHarness()
        const fetch = jest.fn(
            async () =>
                new Response(JSON.stringify({ error: { ...error, message: 'Invalid response_format schema' } }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                })
        )
        modelRuntime.createModelClient.mockResolvedValue(
            new ChatOpenAI({
                apiKey: 'offline-test-key',
                model: 'qwen3.7-flash',
                maxRetries: 0,
                configuration: { baseURL: 'https://wiki-sdk-test.invalid/v1', fetch }
            })
        )
        const run = () => service.invokeMapModel(job as never, knowledgebase as never, 'doc', [], 0)
        await expect(run()).rejects.toThrow('Invalid response_format schema')
        expect(invocations[0]).toMatchObject({
            status: 'failed',
            reconciliationStatus: 'not_executed',
            errorCode: 'provider_request_rejected',
            billingStatus: 'delivered'
        })
        await expect(run()).rejects.toThrow('Invalid response_format schema')
        expect(fetch).toHaveBeenCalledTimes(2)
        expect(invocations).toHaveLength(1)
        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it.each([
        new Error('400 InvalidParameter'),
        Object.assign(new Error('Unknown bad request'), { status: 400 }),
        Object.assign(new Error('Server failure'), { status: 500, type: 'invalid_request_error' })
    ])('keeps ambiguous dispatched failures uncertain (%s)', async (error) => {
        const { service, invoke, invocations } = createHarness()
        invoke.mockRejectedValueOnce(error)
        await expect(service.invokeMapModel(job as never, knowledgebase as never, 'doc', [], 0)).rejects.toThrow(error)
        expect(invocations[0]).toMatchObject({ status: 'indeterminate', reconciliationStatus: 'indeterminate' })
    })

    it('sends precompiled map and reduce schemas through the real SDK using only a fake HTTP transport', async () => {
        const { service, modelRuntime } = createHarness()
        const responses = [
            { pages: [] },
            { title: 'Xpert', summary: 'An AI platform.', contentMarkdown: '## Xpert', aliases: [] }
        ]
        const fetch = jest.fn().mockImplementation(
            async () =>
                new Response(
                    JSON.stringify({
                        id: 'completion-1',
                        object: 'chat.completion',
                        created: 1,
                        model: 'qwen3.7-plus',
                        choices: [
                            {
                                index: 0,
                                finish_reason: 'stop',
                                message: { role: 'assistant', content: JSON.stringify(responses.shift()) }
                            }
                        ]
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                )
        )
        modelRuntime.createModelClient.mockResolvedValue(
            new ChatOpenAI({
                apiKey: 'offline-test-key',
                model: 'qwen3.7-plus',
                maxRetries: 0,
                configuration: { baseURL: 'https://wiki-sdk-test.invalid/v1', fetch }
            })
        )

        await expect(service.invokeMapModel(job as never, knowledgebase as never, 'doc', [], 0)).resolves.toEqual({
            pages: []
        })
        const nullableScope = {
            anyOf: [{ type: 'string', minLength: 1, maxLength: 1000 }, { type: 'null' }]
        }
        expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
            response_format: {
                type: 'json_schema',
                json_schema: {
                    schema: {
                        properties: {
                            pages: {
                                items: {
                                    properties: {
                                        identity: {
                                            anyOf: [
                                                { properties: { kind: { const: 'summary' } } },
                                                { properties: { kind: { const: 'entity' }, scope: nullableScope } },
                                                {
                                                    properties: {
                                                        kind: { const: 'concept' },
                                                        domain: nullableScope,
                                                        scope: nullableScope
                                                    }
                                                }
                                            ]
                                        },
                                        suggestedLinks: {
                                            items: { required: ['targetType', 'targetCanonicalName', 'label'] }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        })
        await expect(
            service.invokeReduceModel(
                job as never,
                knowledgebase as never,
                { pageKey: 'entity:xpert', canonicalName: 'Xpert' } as never,
                [],
                'reduce-1'
            )
        ).resolves.toEqual({ title: 'Xpert', summary: 'An AI platform.', contentMarkdown: '## Xpert' })
        expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('stops new model calls when the confirmed invocation budget has been used', async () => {
        const { service, invoke } = createHarness({ maxModelInvocations: 1, maxEstimatedTokens: 200_000 })
        const boundedJob = { ...job, spendEnvelope: { maxModelInvocations: 1, maxEstimatedTokens: 200_000 } }
        await service.invokeMapModel(
            boundedJob as never,
            knowledgebase as never,
            'doc',
            [{ id: 'chunk-1', content: 'Xpert' }],
            0
        )
        await expect(
            service.invokeMapModel(
                boundedJob as never,
                knowledgebase as never,
                'doc',
                [{ id: 'chunk-2', content: 'AI' }],
                1
            )
        ).rejects.toThrow(/budget/i)
        expect(invoke).toHaveBeenCalledTimes(1)
    })

    it('reuses saved output even when no additional calls remain in the budget', async () => {
        const { service, invoke } = createHarness({ maxModelInvocations: 1, maxEstimatedTokens: 200_000 })
        const run = () =>
            service.invokeMapModel(
                job as never,
                knowledgebase as never,
                'doc',
                [{ id: 'chunk-1', content: 'Xpert' }],
                0
            )
        const output = await run()

        await expect(run()).resolves.toEqual(output)
        expect(invoke).toHaveBeenCalledTimes(1)
    })

    it('reserves the root budget atomically across concurrent child jobs', async () => {
        const { service, invoke, jobs } = createHarness({ maxModelInvocations: 1, maxEstimatedTokens: 200_000 })
        const results = await Promise.allSettled(
            [0, 1].map((i) =>
                service.invokeMapModel(
                    { ...job, id: `child-${i}`, rootJobId: 'job-1' } as never,
                    knowledgebase as never,
                    'doc',
                    [{ id: `chunk-${i + 1}`, content: 'Xpert' }],
                    0
                )
            )
        )
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
        expect(invoke).toHaveBeenCalledTimes(1)
        expect(jobs.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                lock: { mode: 'pessimistic_write' },
                where: { id: 'job-1', knowledgebaseId: 'kb-1' }
            })
        )
    })

    it('rejects an estimate over budget before creating a model client', async () => {
        const { service, invoke, modelRuntime } = createHarness({ maxModelInvocations: 20, maxEstimatedTokens: 1000 })
        await expect(
            service.invokeMapModel(
                job as never,
                knowledgebase as never,
                'doc',
                [{ id: 'chunk-1', content: 'Xpert' }],
                0
            )
        ).rejects.toThrow(/budget/i)
        expect(modelRuntime.createModelClient).not.toHaveBeenCalled()
        expect(invoke).not.toHaveBeenCalled()
    })

    it('allows only one worker to claim the same prepared provider call', async () => {
        const { service, invoke } = createHarness()
        const results = await Promise.allSettled(
            [0, 1].map(() =>
                service.invokeMapModel(
                    job as never,
                    knowledgebase as never,
                    'doc',
                    [{ id: 'chunk-1', content: 'Xpert' }],
                    0
                )
            )
        )
        expect(results.some((result) => result.status === 'fulfilled')).toBe(true)
        expect(invoke).toHaveBeenCalledTimes(1)
    })

    it('journals and replays identity decisions without repeating the provider call or billing', async () => {
        const { service, invoke, invocations, commandBus, withStructuredOutput } = createHarness()
        invoke.mockResolvedValue({ decision: 'same', pageId: 'page-1', reason: 'Same documented team.' })
        const descriptor = {
            kind: 'entity' as const,
            entityType: 'organization' as const,
            description: 'North team.',
            scope: null,
            identifiers: []
        }
        const input = {
            candidateId: 'candidate',
            canonicalName: 'Northern Team',
            aliases: [],
            descriptor,
            facts: [],
            candidates: [{ id: 'page-1', canonicalName: 'North Team', aliases: [], descriptor }]
        }
        const first = await service.invokeDedupModel(job as never, knowledgebase as never, input, 0)
        expect(await service.invokeDedupModel(job as never, knowledgebase as never, input, 0)).toEqual(first)
        expect(invoke).toHaveBeenCalledTimes(1)
        expect(commandBus.execute).toHaveBeenCalledTimes(1)
        expect(invocations[0].stage).toBe('dedup')
        expect(withStructuredOutput).toHaveBeenCalledWith(expect.anything(), { name: 'knowledge_wiki_dedup' })
    })

    it('does not cache an out-of-candidate identity as a successful decision', async () => {
        const { service, invoke, invocations } = createHarness()
        invoke.mockResolvedValue({ decision: 'same', pageId: 'foreign', reason: 'Invalid target.' })
        const input = {
            candidateId: 'candidate',
            canonicalName: 'Concept',
            aliases: [],
            descriptor: { kind: 'concept' as const, definition: 'Definition.', domain: null, scope: null },
            facts: [],
            candidates: []
        }
        await expect(service.invokeDedupModel(job as never, knowledgebase as never, input, 0)).rejects.toMatchObject({
            code: 'knowledge_wiki_identity_invalid'
        })
        expect(invocations[0].status).not.toBe('succeeded')
        expect(invocations[0].structuredOutput).toBeUndefined()
    })
})
