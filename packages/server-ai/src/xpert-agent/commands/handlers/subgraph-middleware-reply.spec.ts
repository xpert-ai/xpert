import { RequestContext } from '@xpert-ai/plugin-sdk'
import { EVENT_RUN_ORIGIN } from '../../../agent-event/agent-event-run-context'
import { AIMessage } from '@langchain/core/messages'
import { Logger } from '@nestjs/common'
import { Subscriber } from 'rxjs'
import { createMapStreamEvents, getChannelState } from '../../agent'
import { agentChannel, agentKey, config, createInputGraphFixture, input } from './subgraph-input.test-fixture'

const question = '仓库交接清单几点归档？'
const answer = '仓库交接清单每天 18:00 归档。'

describe('middleware responses in the Agent graph', () => {
    afterEach(() => jest.restoreAllMocks())
    it('only exposes the host receipt in its originating scope', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('buyer')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        const receipts: (string | undefined)[] = []
        const fixture = createInputGraphFixture({
            observeMiddleware: (context) => receipts.push(context.eventReceiptId)
        })
        const origin = {
            receiptId: 'first',
            workspaceId: 'workspace',
            userId: 'buyer',
            tenantId: 'tenant',
            organizationId: 'org',
            xpertId: 'xpert-1',
            conversationId: 'conversation-1',
            threadId: config.configurable.thread_id
        }
        await fixture.compile({ [EVENT_RUN_ORIGIN]: origin })
        await fixture.compile({ [EVENT_RUN_ORIGIN]: origin, projectId: 'another' })
        await fixture.compile({ [EVENT_RUN_ORIGIN]: origin, thread_id: 'another' })
        const fromJson = JSON.parse(JSON.stringify({ [EVENT_RUN_ORIGIN]: origin, eventReceiptId: 'first' }))
        await fixture.compile(fromJson)
        await fixture.compile()
        expect(receipts).toEqual(['first', undefined, undefined, undefined, undefined])
    })

    it.each([
        {
            scenario: 'same scope',
            originWorkspace: 'workspace',
            childWorkspace: 'workspace',
            parent: 'receipt-1',
            child: 'receipt-1'
        },
        {
            scenario: 'child leaves scope',
            originWorkspace: 'workspace',
            childWorkspace: 'other',
            parent: 'receipt-1',
            child: undefined
        },
        {
            scenario: 'parent outside scope',
            originWorkspace: 'other',
            childWorkspace: 'other',
            parent: undefined,
            child: undefined
        }
    ])(
        'passes only an authorized wake receipt through a local delegation ($scenario)',
        async ({ originWorkspace, childWorkspace, parent, child }) => {
            jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('buyer')
            jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
            const turns: { agent: string; receipt: string | undefined }[] = []
            const fixture = createInputGraphFixture({
                localFollower: { workspaceId: childWorkspace },
                middlewareStrategy: {
                    meta: { name: 'receipt-test', label: { en_US: 'Receipt test' } },
                    createMiddleware: (_options, context) => ({
                        name: 'receipt-test',
                        wrapModelCall: (request) => {
                            turns.push({ agent: context.agentKey, receipt: context.eventReceiptId })
                            if (context.agentKey === 'buyer') return new AIMessage('checked')
                            if (request.messages.at(-1)?.getType() === 'tool') return new AIMessage('done')
                            return new AIMessage({
                                content: '',
                                tool_calls: [{ id: 'handoff', name: 'buyer', args: { input: 'Check the quote' } }]
                            })
                        }
                    })
                }
            })
            const graph = await fixture.compile({
                subscriber: new Subscriber<MessageEvent>(),
                [EVENT_RUN_ORIGIN]: {
                    receiptId: 'receipt-1',
                    tenantId: 'tenant',
                    organizationId: 'org',
                    userId: 'buyer',
                    workspaceId: originWorkspace,
                    xpertId: 'xpert-1',
                    conversationId: 'conversation-1',
                    threadId: config.configurable.thread_id
                }
            })
            await graph.invoke(input('Delegate the quote check'), config)
            expect(turns).toEqual([
                { agent: agentKey, receipt: parent },
                { agent: 'buyer', receipt: child },
                { agent: agentKey, receipt: parent }
            ])
        }
    )

    it('streams a middleware answer once while running compression and normal turn hooks', async () => {
        const recall = jest.fn()
        const compress = jest.fn()
        const writeback = jest.fn()
        const fixture = createInputGraphFixture({
            middleware: {
                name: 'standard replies',
                beforeAgent: recall,
                beforeModel: (state) => {
                    if (state.messages.length >= 4) compress()
                },
                afterAgent: writeback,
                wrapModelCall: (request, next) =>
                    request.messages.at(-1)?.content === question ? new AIMessage(answer) : next(request)
            }
        })
        for (let i = 0; i < 3; i++) {
            const id = 'seed-' + i
            const graph = await fixture.compile({ inputMessageId: id, rootExecutionId: 'execution-1' })
            await graph.invoke({ ...input('hi'), inputIdentity: { id } }, config)
        }
        expect(compress).toHaveBeenCalled()
        const graph = await fixture.compile({ inputMessageId: 'hit', rootExecutionId: 'execution-1' })
        const map = createMapStreamEvents(new Logger(), new Subscriber(), { unmutes: [[agentKey, 'xpert-1']] })
        for (const fn of [recall, compress, writeback, fixture.model]) fn.mockClear()
        const text: string[] = []
        for await (const event of graph.streamEvents(
            { ...input(question), inputIdentity: { id: 'hit' } },
            { ...config, version: 'v2' }
        )) {
            const content = map(event)
            if (content?.type === 'text') text.push(content.text)
        }
        expect(text).toEqual([answer])
        const saved = getChannelState((await graph.getState(config)).values, agentChannel)
        expect(saved.messages.slice(-2).map((m) => m.content)).toEqual([question, answer])
        expect(saved.messages.length).toBe(8)
        expect(saved.inputReceipt).toEqual({ id: 'hit', status: 'consumed' })
        expect(fixture.model).not.toHaveBeenCalled()
        for (const fn of [recall, compress, writeback]) expect(fn).toHaveBeenCalledTimes(1)
        const fallback = await fixture.compile({ inputMessageId: 'miss', rootExecutionId: 'execution-1' })
        await fallback.invoke({ ...input('hi'), inputIdentity: { id: 'miss' } }, config)
        expect(fixture.model).toHaveBeenCalledTimes(1)
        expect(compress).toHaveBeenCalledTimes(2)
    })
    it('streams a regular wrapper result and allows an afterModel end jump with an afterAgent hook present', async () => {
        const after = jest.fn()
        const fixture = createInputGraphFixture({
            middleware: {
                name: 'local response',
                wrapModelCall: () => new AIMessage(answer),
                afterModel: { canJumpTo: ['end'], hook: () => ({ jumpTo: 'end' }) },
                afterAgent: after
            }
        })
        const graph = await fixture.compile({ inputMessageId: 'one' })
        const map = createMapStreamEvents(new Logger(), new Subscriber(), { unmutes: [[agentKey, 'xpert-1']] })
        const text = []
        for await (const event of graph.streamEvents(input(question), { ...config, version: 'v2' })) {
            const content = map(event)
            if (content?.type === 'text') text.push(content.text)
        }
        expect(text).toEqual([answer])
        expect(fixture.model).not.toHaveBeenCalled()
        expect(after).not.toHaveBeenCalled()
    })
})
