import { AIMessage } from '@langchain/core/messages'
import { AGENT_WORKBENCH_SLOT, type XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { getChannelState } from '../../xpert-agent/agent'
import {
    agentChannel,
    config,
    createInputGraphFixture,
    input
} from '../../xpert-agent/commands/handlers/subgraph-input.test-fixture'
import { FileMemoryService } from './file-memory.service'
import { StandardReplyMiddleware } from './standard-reply.middleware'
import { MemoryViewProvider } from './memory-view.provider'

const question = '仓库交接清单几点归档？'
const answer = '仓库交接清单每天 18:00 归档。'
afterEach(() => jest.restoreAllMocks())

it('supplies a revised note to the normal model once an approval is invalidated', async () => {
    const memory = new FileMemoryService({
        resolve: () => {
            throw new Error('unexpected volume access')
        },
        readSnapshot: async () => {
            throw new Error('unexpected volume access')
        }
    })
    const replies = memory.standardReplies
    const resolve = jest.spyOn(replies, 'resolve')
    jest.spyOn(memory, 'standardReplies', 'get').mockReturnValue(replies)
    resolve.mockResolvedValueOnce({
        kind: 'approved',
        text: answer,
        source: { type: 'memory_reply', id: 'approval', memoryId: 'note', revision: 'old' }
    })
    const strategy = new StandardReplyMiddleware(memory, { plainText: () => question, matches: async () => true })
    const fixture = createInputGraphFixture({ middlewareStrategy: strategy })
    let graph = await fixture.compile({ inputMessageId: 'old', rootExecutionId: 'execution-1' })
    await graph.invoke({ ...input(question), inputIdentity: { id: 'old' } }, config)
    expect(fixture.model).not.toHaveBeenCalled()
    resolve.mockResolvedValue({ kind: 'inactive', current: '仓库交接清单每天 20:00 归档。' })
    graph = await fixture.compile({ inputMessageId: 'new', rootExecutionId: 'execution-1' })
    fixture.model.mockResolvedValue(new AIMessage('20:00'))
    const result = await graph.invoke({ ...input(question), inputIdentity: { id: 'new' } }, config)
    expect(fixture.model).toHaveBeenCalledTimes(1)
    expect(fixture.requests[0].some((m) => typeof m.content === 'string' && m.content.includes('20:00'))).toBe(true)
    expect(getChannelState(result, agentChannel).messages.map((m) => m.content)).toEqual([
        question,
        answer,
        question,
        '20:00'
    ])
})

it('passes an execution-only input identity through without looking up a standard reply', async () => {
    const inputs = { plainText: jest.fn(), matches: jest.fn() }
    const strategy = new StandardReplyMiddleware(new FileMemoryService(null), inputs)
    const fixture = createInputGraphFixture({ middlewareStrategy: strategy })
    const graph = await fixture.compile({ rootExecutionId: 'execution-1' })
    await graph.invoke({ ...input('hi'), inputIdentity: { id: 'execution-1' } }, config)
    expect(fixture.model).toHaveBeenCalledTimes(1)
    expect(inputs.plainText).not.toHaveBeenCalled()
    expect(inputs.matches).not.toHaveBeenCalled()
})

it('exposes the management view with only the standard reply middleware connected', () => {
    const strategy = new StandardReplyMiddleware(new FileMemoryService(null), {
        plainText: () => undefined,
        matches: async () => false
    })
    const views = new MemoryViewProvider(null)
    for (const hostType of ['agent', 'assistant-studio'] as const) {
        const context = { hostType, capabilities: { features: strategy.meta.features } } as XpertResolvedViewHostContext
        const slot = hostType === 'agent' ? AGENT_WORKBENCH_SLOT : 'assistant.studio.memory'
        expect(views.getViewManifests(context, slot).map((view) => view.key)).toEqual(['memory'])
    }
})
