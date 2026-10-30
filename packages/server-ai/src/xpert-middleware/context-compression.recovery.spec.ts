import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { ContextCompressionMiddleware } from './context-compression.middleware'
import { estimateTokens } from './context-compression.budget'
import { createTemplateOperationPolicy } from '../xpert/template-setup/template-operation-policy'

jest.mock('@xpert-ai/plugin-sdk', () => ({
    AgentMiddlewareStrategy: () => (target: unknown) => target,
    getModelContextSize: (model: { options?: { context_size?: number } }) => model.options?.context_size
}))
jest.mock('../chat-conversation/context-evidence/context-evidence.service', () => ({
    ContextEvidenceService: class {}
}))

it('keeps original history when durable archive verification fails, without paying for a summary', async () => {
    const archive = jest.fn().mockRejectedValue(new Error('store unavailable'))
    const invoke = jest.fn()
    const context = {
        tools: new Map(),
        runtime: { createModelClient: jest.fn(async () => ({ invoke })) }
    } as unknown as IAgentMiddlewareContext
    const middleware = await new ContextCompressionMiddleware({
        bind: () => ({ archive, read: jest.fn() })
    }).createMiddleware({ maxPromptTokens: 10000, targetPromptTokens: 7000 }, context)
    middleware.tools?.forEach((tool) => context.tools.set(tool.name, tool))
    const before = typeof middleware.beforeModel === 'function' ? middleware.beforeModel : middleware.beforeModel?.hook
    if (!before) throw new Error('Missing beforeModel hook')
    const messages: BaseMessage[] = [
        new HumanMessage('Do not publish.'),
        new AIMessage({
            content: '',
            tool_calls: [{ id: 'old', name: 'shell', args: { script: 'x'.repeat(100000) } }]
        }),
        new ToolMessage({ tool_call_id: 'old', content: 'old result' }),
        new AIMessage({ content: '', tool_calls: [{ id: 'new', name: 'read', args: { path: 'latest' } }] }),
        new ToolMessage({ tool_call_id: 'new', content: 'current result' })
    ]
    const original = JSON.stringify(messages)
    const update = await before({ messages }, { configurable: { copilotModel: { options: { context_size: 200000 } } } })
    expect(archive).toHaveBeenCalledTimes(1)
    expect(update ?? {}).not.toHaveProperty('messages')
    expect(JSON.stringify(messages)).toBe(original)
    expect(invoke).not.toHaveBeenCalled()
})

const snapshot =
    '<state_snapshot><active_user_constraints>Do not publish.</active_user_constraints><file_system_state>Edited, verification pending.</file_system_state><current_plan>Run verification.</current_plan></state_snapshot>'

function updatedMessages(update: unknown): BaseMessage[] {
    if (update && typeof update === 'object' && 'messages' in update && Array.isArray(update.messages)) {
        return update.messages.filter((message): message is BaseMessage => message instanceof BaseMessage)
    }
    return []
}

function longHistory() {
    return [
        new HumanMessage({ id: 'original', content: 'Use active=false.' }),
        new AIMessage({
            content: '',
            tool_calls: [{ id: 'old', name: 'shell', args: { script: 'exact-script\n'.repeat(10000) } }]
        }),
        new ToolMessage({ tool_call_id: 'old', content: 'saved, not verified' }),
        new HumanMessage({
            id: 'correction',
            content: 'active=false ONLY for newly discovered factories. Do not publish.'
        }),
        new AIMessage({ content: '', tool_calls: [{ id: 'new', name: 'read', args: { path: 'latest' } }] }),
        new ToolMessage({ tool_call_id: 'new', content: 'current result' })
    ]
}

async function fixture(response = snapshot, operationPolicy?: IAgentMiddlewareContext['operationPolicy']) {
    const archive = jest.fn(async (_messages: BaseMessage[]) => ({
        archiveId: 'a'.repeat(64),
        records: 3,
        partial: false,
        agentKey: 'agent'
    }))
    const read = jest.fn(async () => ({ text: 'exact archived fragment', nextOffset: null }))
    const invoke = jest.fn(async () => new AIMessage(response))
    const context = {
        operationPolicy,
        tools: new Map(),
        runtime: { createModelClient: jest.fn(async () => ({ invoke })) }
    } as unknown as IAgentMiddlewareContext
    const middleware = await new ContextCompressionMiddleware({ bind: () => ({ archive, read }) }).createMiddleware(
        { maxPromptTokens: 10000, targetPromptTokens: 7000 },
        context
    )
    middleware.tools?.forEach((tool) => context.tools.set(tool.name, tool))
    const before = typeof middleware.beforeModel === 'function' ? middleware.beforeModel : middleware.beforeModel?.hook
    if (!before) throw new Error('Missing beforeModel hook')
    const runtime = { configurable: { copilotModel: { options: { context_size: 200000 } } } }
    return { middleware, before, runtime, archive, read, invoke, context }
}

it('compresses many complete cycles using bounded summary requests without losing archive record identities', async () => {
    const f = await fixture()
    const messages: BaseMessage[] = [new HumanMessage('Do not publish.')]
    for (let i = 0; i < 1000; i++) {
        messages.push(
            new AIMessage({
                content: '',
                tool_calls: [{ id: `call-${i}`, name: 'shell', args: { script: 'x'.repeat(3000) } }]
            }),
            new ToolMessage({ tool_call_id: `call-${i}`, content: `result-${i}` })
        )
    }
    const original = JSON.stringify(messages)
    const update = await f.before({ messages }, f.runtime)
    expect(updatedMessages(update).length).toBeGreaterThan(0)
    expect(await estimateTokens(updatedMessages(update))).toBeLessThan(7000)
    expect(f.invoke.mock.calls.length).toBeGreaterThan(1)
    expect(JSON.stringify(messages)).toBe(original)
})

it('reduces old parameters, keeps both user instructions verbatim, and exposes a usable recovery tool', async () => {
    const f = await fixture()
    const messages = longHistory()
    const original = JSON.stringify(messages)
    const update = await f.before({ messages }, f.runtime)
    const retained = updatedMessages(update)
    expect(f.archive).toHaveBeenCalledTimes(1)
    expect(f.archive.mock.invocationCallOrder[0]).toBeLessThan(f.invoke.mock.invocationCallOrder[0])
    expect(
        retained
            .filter((message) => ['original', 'correction'].includes(message.id ?? ''))
            .map((message) => message.content)
    ).toEqual([messages[0].content, messages[3].content])
    expect(JSON.stringify(retained)).not.toContain('exact-script\\nexact-script')
    expect(JSON.stringify(retained)).toContain('read_context_evidence')
    expect(JSON.stringify(retained)).toContain('a'.repeat(64))
    expect(JSON.stringify(retained).length).toBeLessThan(original.length / 5)
    expect(await estimateTokens(retained)).toBeLessThan((await estimateTokens(messages)) / 5)
    expect(JSON.stringify(f.archive.mock.calls[0][0])).toContain('exact-script')
    // The summary request is also bounded; moving the full script into another LLM call would not save enough.
    expect(JSON.stringify(f.invoke.mock.calls).length).toBeLessThan(original.length / 2)
    expect(JSON.stringify(messages)).toBe(original)
    const recovery = f.middleware.tools?.find((candidate) => candidate.name === 'read_context_evidence')
    if (!recovery || !('invoke' in recovery)) throw new Error('Missing recovery tool')
    const result = await recovery.invoke({ archiveId: 'a'.repeat(64), part: 'arguments', record: 1, limit: 100 })
    expect(result).toContain('exact archived fragment')
    expect(f.read).toHaveBeenCalledWith(expect.objectContaining({ record: 1, limit: 100 }))
})

it('rejects a summary without explicit constraints and pending-work sections without applying any trim', async () => {
    const f = await fixture('<state_snapshot>Everything succeeded.</state_snapshot>')
    const messages = longHistory()
    expect(await f.before({ messages }, f.runtime)).not.toHaveProperty('messages')
    expect(f.invoke).toHaveBeenCalledTimes(1)
})

it('does not call the archive or summary model below the cost trigger', async () => {
    const f = await fixture()
    await f.before({ messages: [new HumanMessage('Hello')] }, f.runtime)
    expect(f.archive).not.toHaveBeenCalled()
    expect(f.invoke).not.toHaveBeenCalled()
})

it('does not replace context when the host disabled the recovery tool', async () => {
    const f = await fixture()
    f.context.tools.delete('read_context_evidence')
    expect(await f.before({ messages: longHistory() }, f.runtime)).not.toHaveProperty('messages')
    expect(f.archive).not.toHaveBeenCalled()
    expect(f.invoke).not.toHaveBeenCalled()
})

it('keeps full history when the published execution policy denies the registered recovery tool', async () => {
    const operationPolicy = {
        default: 'deny' as const,
        rules: [{ tool: 'shell', decision: 'allow' as const, reason: 'Execution' }]
    }
    const policy = createTemplateOperationPolicy(operationPolicy)
    const handler = jest.fn()
    const f = await fixture(snapshot, operationPolicy)
    const recovery = f.middleware.tools?.find((candidate) => candidate.name === 'read_context_evidence')
    expect(recovery).toBeDefined()
    const denied = await policy.wrapToolCall!(
        {
            toolCall: { id: 'recover', name: 'read_context_evidence', args: {} },
            tool: recovery,
            state: { messages: [] },
            runtime: {}
        },
        handler
    )
    expect(denied).toMatchObject({ status: 'error' })
    expect(handler).not.toHaveBeenCalled()
    expect(await f.before({ messages: longHistory() }, f.runtime)).not.toHaveProperty('messages')
    expect(f.archive).not.toHaveBeenCalled()
    expect(f.invoke).not.toHaveBeenCalled()
})

it('requires an unconditional recovery allowance before automatic compression', async () => {
    const gated = await fixture(snapshot, { default: 'approve', rules: [] })
    expect(await gated.before({ messages: longHistory() }, gated.runtime)).not.toHaveProperty('messages')
    expect(gated.archive).not.toHaveBeenCalled()
    const allowed = await fixture(snapshot, {
        default: 'deny',
        rules: [{ tool: 'read_context_evidence', decision: 'allow', reason: 'Read archived context' }]
    })
    expect(updatedMessages(await allowed.before({ messages: longHistory() }, allowed.runtime)).length).toBeGreaterThan(
        0
    )
})

it('keeps the entire original history if a later summary batch fails', async () => {
    const f = await fixture()
    f.invoke.mockResolvedValueOnce(new AIMessage(snapshot)).mockRejectedValueOnce(new Error('Second batch failed'))
    const messages: BaseMessage[] = [new HumanMessage('Do not publish.')]
    for (let i = 0; i < 1000; i++)
        messages.push(
            new AIMessage({
                content: '',
                tool_calls: [{ id: `call-${i}`, name: 'shell', args: { script: 'x'.repeat(3000) } }]
            }),
            new ToolMessage({ tool_call_id: `call-${i}`, content: 'saved' })
        )
    const original = JSON.stringify(messages)
    expect(await f.before({ messages }, f.runtime)).not.toHaveProperty('messages')
    expect(f.invoke).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(messages)).toBe(original)
})

it('keeps manual compaction deterministic when recovery is enabled', async () => {
    const f = await fixture()
    const update = await f.before({ messages: [...longHistory(), new HumanMessage('/compact')] }, f.runtime)
    expect(updatedMessages(update).some((message) => message.additional_kwargs.compressed)).toBe(true)
    expect(f.archive).not.toHaveBeenCalled()
    expect(f.invoke).not.toHaveBeenCalled()
})
