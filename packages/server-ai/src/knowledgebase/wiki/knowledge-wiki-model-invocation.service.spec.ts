import { ChatOpenAI, ChatOpenAICompletions } from '@langchain/openai'
import { AIMessage } from '@langchain/core/messages'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { Logger } from '@nestjs/common'
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
        const textInvoke = jest.fn().mockResolvedValue(new AIMessage('SUMMARY: Summary\n\n# Page\n\nBody.'))
        const modelRuntime = {
            createModelClient: jest.fn().mockImplementation(async (_model, options) => {
                options.usageCallback({
                    type: 'actual',
                    promptTokens: 10,
                    completionTokens: 5,
                    totalTokens: 15
                })
                return {
                    withStructuredOutput,
                    invoke: textInvoke
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
            textInvoke,
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

    it('classifies every supplied page and replays grouped placements without another model call', async () => {
        const { service, invoke, withStructuredOutput, invocations, commandBus } = createHarness()
        const a = '00000000-0000-4000-8000-000000000001'
        const b = '00000000-0000-4000-8000-000000000002'
        const input = { pages: [a, b].map((id) => ({ id, title: 'Operations', summary: '', content: 'Runbook' })) }
        invoke.mockResolvedValue({
            folders: [{ name: 'Operations', description: 'Runbooks' }],
            pageFolders: { [a]: 0, [b]: 0 }
        })
        const run = () => service.invokeTaxonomyModel(job as never, knowledgebase as never, input)
        const output = {
            folders: [{ name: 'Operations', description: 'Runbooks', pageIds: [a, b] }],
            unclassifiedPageIds: []
        }
        await expect(run()).resolves.toEqual(output)
        await expect(run()).resolves.toEqual(output)
        expect(invocations[0].structuredOutput).toEqual(output)
        expect(invoke).toHaveBeenCalledTimes(1)
        expect(commandBus.execute).toHaveBeenCalledTimes(1)
        expect(withStructuredOutput).toHaveBeenCalledWith(
            expect.objectContaining({
                properties: expect.objectContaining({ pageFolders: expect.objectContaining({ required: [a, b] }) })
            }),
            { name: 'knowledge_wiki_classify' }
        )
    })

    it('records the exact invalid classification result without changing it or calling the model again', async () => {
        const { service, invoke, invocations, commandBus } = createHarness()
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
        try {
            const id = '00000000-0000-4000-8000-000000000001'
            const result = { folders: [], pageFolders: { [id]: 0 } }
            invoke.mockResolvedValue(result)
            const run = () =>
                service.invokeTaxonomyModel(job as never, knowledgebase as never, {
                    pages: [{ id, title: 'Operations', summary: '', content: 'Runbook' }]
                })
            await expect(run()).rejects.toThrow()
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown_folder_index'))
            expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({
                event: 'wiki.classification.response_invalid',
                output: result,
                detail: [id, '0']
            })
            expect(invocations[0]).toMatchObject({ status: 'failed', errorCode: 'model_response_invalid' })
            await expect(run()).rejects.toThrow()
            expect(invoke).toHaveBeenCalledTimes(1)
            expect(commandBus.execute).toHaveBeenCalledTimes(1)
        } finally {
            warn.mockRestore()
        }
    })

    it('recovers omitted relations from facts and replays both saved invocations without another charge', async () => {
        const { service, invoke, invocations, commandBus } = createHarness()
        invoke
            .mockResolvedValueOnce({
                pages: ['Knowledge management', 'Tacit knowledge'].map((name) => ({
                    schemaVersion: 1,
                    pageType: 'concept',
                    identity: { kind: 'concept', definition: name, domain: null, scope: null },
                    canonicalName: name,
                    aliases: [],
                    summary: name,
                    facts: [
                        {
                            text: 'Knowledge management includes making tacit knowledge explicit.',
                            sourceChunkIds: ['chunk-1']
                        }
                    ],
                    suggestedLinks: []
                }))
            })
            .mockResolvedValueOnce({ links: [{ sourceIndex: 0, targetIndex: 1, factIndices: [0], label: 'includes' }] })
        const run = () =>
            service.invokeMapModel(
                job as never,
                knowledgebase as never,
                'doc',
                [{ id: 'chunk-1', content: 'Knowledge management includes making tacit knowledge explicit.' }],
                0
            )
        const output = await run()
        expect(output.pages[0].suggestedLinks).toEqual([
            { targetType: 'concept', targetCanonicalName: 'Tacit knowledge', label: 'includes' }
        ])
        await expect(run()).resolves.toEqual(output)
        expect(invocations.map((item) => item.stage)).toEqual(['map', 'links'])
        expect(invoke).toHaveBeenCalledTimes(2)
        expect(commandBus.execute).toHaveBeenCalledTimes(2)
    })

    it('preserves first-generation Markdown and replays the canonical result without another call or charge', async () => {
        const { service, textInvoke, withStructuredOutput, invocations, commandBus } = createHarness()
        const original =
            '# Page\n\nBody with "a b" and literal \\n.\n\n- First\n- Second\n\n```python\nvalue = "a b"\n```'
        textInvoke.mockResolvedValue(new AIMessage(`SUMMARY: Summary\n\n${original}`))
        const run = () =>
            service.invokeReduceModel(
                job as never,
                knowledgebase as never,
                { pageKey: 'concept:page', canonicalName: 'Page' } as never,
                [],
                'format-case'
            )
        await expect(run()).resolves.toEqual({ title: 'Page', summary: 'Summary', contentMarkdown: original })
        await expect(run()).resolves.toEqual({ title: 'Page', summary: 'Summary', contentMarkdown: original })
        expect(invocations.map((item) => item.stage)).toEqual(['reduce'])
        expect(textInvoke).toHaveBeenCalledTimes(1)
        expect(withStructuredOutput).not.toHaveBeenCalled()
        expect(invocations[0].structuredOutput).toEqual({
            title: 'Page',
            summary: 'Summary',
            contentMarkdown: original
        })
        expect(commandBus.execute).toHaveBeenCalledTimes(1)
    })

    it('reads a previously stored JSON-contract result without regenerating or rewriting it', async () => {
        const { service, textInvoke, invoke, invocations, commandBus } = createHarness()
        const output = { title: 'Legacy title', summary: 'Summary', contentMarkdown: '## Old collapsed body.' }
        invocations.push(
            Object.assign(new KnowledgeWikiModelInvocation(), {
                id: 'legacy-invocation',
                requestId: 'knowledge-wiki:job-1:0:reduce:0:legacy-cache',
                status: 'succeeded',
                billingStatus: 'delivered',
                structuredOutput: output
            })
        )
        await expect(
            service.invokeReduceModel(
                job as never,
                knowledgebase as never,
                { pageKey: 'concept:page', canonicalName: 'Page' } as never,
                [],
                'legacy-cache'
            )
        ).resolves.toEqual(output)
        expect(textInvoke).not.toHaveBeenCalled()
        expect(invoke).not.toHaveBeenCalled()
        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it.each(
        [false, true].flatMap((streaming) => [
            { streaming, markdown: '# PageBody text.## DetailsMore text.', malformed: true },
            { streaming, markdown: '# Page\n\nBody "a b" and \\n.\n\n## Details\n\nMore text.', malformed: false },
            { streaming, markdown: '', malformed: true }
        ])
    )(
        'logs the original model text even when Wiki output validation fails (%j)',
        async ({ streaming, markdown, malformed }) => {
            const { service, modelRuntime, invocations } = createHarness()
            const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
            const output = { title: 'Page', summary: 'Summary', contentMarkdown: markdown }
            const raw = `SUMMARY: Summary\n\n${markdown}`
            const usage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            const fetch = jest.fn(async (_url: unknown, _init?: RequestInit) => {
                if (streaming) {
                    const events = (raw.match(/[\s\S]{1,3}/g) ?? []).map((content) => ({
                        id: 'completion-diagnostic',
                        object: 'chat.completion.chunk',
                        created: 1,
                        model: 'qwen3.7-flash',
                        choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }]
                    }))
                    const end = {
                        id: 'completion-diagnostic',
                        object: 'chat.completion.chunk',
                        created: 1,
                        model: 'qwen3.7-flash',
                        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
                        usage
                    }
                    return new Response(
                        [...events, end].map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') +
                            'data: [DONE]\n\n',
                        {
                            headers: { 'Content-Type': 'text/event-stream' }
                        }
                    )
                }
                return new Response(
                    JSON.stringify({
                        id: 'completion-diagnostic',
                        object: 'chat.completion',
                        created: 1,
                        model: 'qwen3.7-flash',
                        usage,
                        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: raw } }]
                    }),
                    { headers: { 'Content-Type': 'application/json' } }
                )
            })
            const clientOptions = {
                apiKey: 'offline-test-key',
                model: 'qwen3.7-flash',
                streaming,
                maxRetries: 0,
                configuration: { baseURL: 'https://wiki-sdk-test.invalid/v1', fetch }
            }
            const completions = new ChatOpenAICompletions(clientOptions)
            // Streaming invokes SDK token estimation; keep the fixture independent of tokenizer downloads.
            jest.spyOn(completions, 'getNumTokens').mockResolvedValue(1)
            modelRuntime.createModelClient.mockResolvedValue(new ChatOpenAI({ ...clientOptions, completions }))
            try {
                const run = () =>
                    service.invokeReduceModel(
                        job as never,
                        knowledgebase as never,
                        { id: 'page-1', pageKey: 'concept:page', canonicalName: 'Page' } as never,
                        [],
                        'diagnostic-case'
                    )
                if (malformed) {
                    await expect(run()).rejects.toThrow()
                } else {
                    await expect(run()).resolves.toEqual(output)
                    await expect(run()).resolves.toEqual(output)
                }
                const events = log.mock.calls.map(([message]) => JSON.parse(String(message)))
                const rawEvents = events.filter((event) => event.event === 'wiki.reduce.raw')
                expect(rawEvents).toHaveLength(1)
                expect(rawEvents[0]).toMatchObject({
                    knowledgebaseId: 'kb-1',
                    jobId: 'job-1',
                    generationAttempt: 0,
                    inputFingerprint: 'diagnostic-case',
                    model: 'qwen',
                    output: { generations: [[{ text: raw }]] }
                })
                const parsedEvents = events.filter((event) => event.event === 'wiki.reduce.parsed')
                if (malformed) {
                    expect(parsedEvents).toHaveLength(0)
                    expect(invocations[0]).toMatchObject({
                        status: 'failed',
                        reconciliationStatus: 'not_available',
                        errorCode: 'model_response_invalid'
                    })
                } else {
                    expect(parsedEvents).toHaveLength(2)
                    expect(parsedEvents[0]).toMatchObject({
                        knowledgebaseId: 'kb-1',
                        jobId: 'job-1',
                        pageId: 'page-1',
                        generationAttempt: 0,
                        inputFingerprint: 'diagnostic-case',
                        contentLength: markdown.length,
                        lineFeedCount: markdown.split('\n').length - 1,
                        output
                    })
                }
                expect(fetch).toHaveBeenCalledTimes(1)
                const request = JSON.parse(String(fetch.mock.calls[0][1]?.body))
                expect(request).not.toHaveProperty('response_format')
                expect(request).not.toHaveProperty('tools')
                expect(request.messages[0].content).toContain('actual line breaks')
                expect(invocations).toHaveLength(1)
            } finally {
                log.mockRestore()
            }
        }
    )

    it('bills an invalid completed response once, blocks automatic replay and permits a new explicit attempt', async () => {
        const { service, textInvoke, invocations, commandBus } = createHarness()
        textInvoke.mockResolvedValueOnce(new AIMessage('SUMMARY: Summary\n\n# PageBody without line breaks.'))
        const run = (generationAttempt = 0) =>
            service.invokeReduceModel(
                { ...job, generationAttempt } as never,
                knowledgebase as never,
                { pageKey: 'concept:page', canonicalName: 'Page' } as never,
                [],
                'invalid-response'
            )
        await expect(run()).rejects.toThrow('separate lines')
        expect(invocations[0]).toMatchObject({
            status: 'failed',
            reconciliationStatus: 'not_available',
            errorCode: 'model_response_invalid',
            billingStatus: 'delivered',
            tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
        })
        await expect(run()).rejects.toThrow('returned invalid content')
        expect(textInvoke).toHaveBeenCalledTimes(1)
        expect(commandBus.execute).toHaveBeenCalledTimes(1)
        await expect(run(1)).resolves.toEqual({ title: 'Page', summary: 'Summary', contentMarkdown: '# Page\n\nBody.' })
        expect(textInvoke).toHaveBeenCalledTimes(2)
        expect(invocations).toHaveLength(2)
    })

    it('keeps the invalid-response state when billing delivery needs to be retried', async () => {
        const { service, textInvoke, invocations, commandBus } = createHarness()
        textInvoke.mockResolvedValue(new AIMessage('No response envelope.'))
        commandBus.execute.mockRejectedValueOnce(new Error('Billing unavailable'))
        const run = () =>
            service.invokeReduceModel(
                job as never,
                knowledgebase as never,
                { pageKey: 'concept:page', canonicalName: 'Page' } as never,
                [],
                'billing-retry'
            )
        await expect(run()).rejects.toThrow('Billing unavailable')
        expect(invocations[0]).toMatchObject({
            status: 'failed',
            errorCode: 'model_response_invalid',
            billingStatus: 'failed'
        })
        await service.settleFailedResponseBilling(job as never, knowledgebase as never)
        await expect(run()).rejects.toThrow('returned invalid content')
        expect(invocations[0].billingStatus).toBe('delivered')
        expect(textInvoke).toHaveBeenCalledTimes(1)
    })

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

    it('sends structured Map and plain Markdown Reduce requests through the real SDK with fake HTTP', async () => {
        const { service, modelRuntime } = createHarness()
        const responses = [JSON.stringify({ pages: [] }), 'SUMMARY: An AI platform.\n\n# Xpert\n\nAn AI platform.']
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
                                message: { role: 'assistant', content: responses.shift() }
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
        ).resolves.toEqual({
            title: 'Xpert',
            summary: 'An AI platform.',
            contentMarkdown: '# Xpert\n\nAn AI platform.'
        })
        expect(fetch).toHaveBeenCalledTimes(2)
        const reduceRequest = JSON.parse(fetch.mock.calls[1][1].body)
        expect(reduceRequest).not.toHaveProperty('response_format')
        expect(reduceRequest).not.toHaveProperty('tools')
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
        invoke.mockResolvedValue({ decision: 'same', identityId: 'page-1', reason: 'Same documented team.' })
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
        invoke.mockResolvedValue({ decision: 'same', identityId: 'foreign', reason: 'Invalid target.' })
        const input = {
            candidateId: 'candidate',
            canonicalName: 'Concept',
            aliases: [],
            descriptor: { kind: 'concept' as const, definition: 'Definition.', domain: null, scope: null },
            facts: [],
            candidates: []
        }
        await expect(service.invokeDedupModel(job as never, knowledgebase as never, input, 0)).rejects.toMatchObject({
            code: 'invalid'
        })
        expect(invocations[0].status).not.toBe('succeeded')
        expect(invocations[0].structuredOutput).toBeUndefined()
    })
})
