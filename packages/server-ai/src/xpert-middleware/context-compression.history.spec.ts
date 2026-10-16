import { load } from '@langchain/core/load'
import {
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
    isAIMessage,
    isToolMessage
} from '@langchain/core/messages'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ContextCompressionHistory, selectCompressionHistory } from './context-compression.history'

describe('long task compression boundaries', () => {
    const request = new HumanMessage({
        id: 'request',
        content: 'Write taskId=exact-id. Preserve source citations. Do not publish.'
    })
    const cycle = (id: string, count = 1): BaseMessage[] => [
        new AIMessage({
            content: '',
            tool_calls: Array.from({ length: count }, (_, index) => ({
                id: `${id}-${index}`,
                name: 'sandbox_append_file',
                args: { path: 'chapter.md', content: id.repeat(4000) }
            }))
        }),
        ...Array.from(
            { length: count },
            (_, index) =>
                new ToolMessage({
                    tool_call_id: `${id}-${index}`,
                    name: 'sandbox_append_file',
                    content: `Saved ${id}-${index}`
                })
        )
    ]
    const select = (messages: BaseMessage[], automatic = true) => selectCompressionHistory(messages, 0.7, 1, automatic)

    function expectPaired(messages: BaseMessage[]) {
        const pending = new Set<string>()
        for (const message of messages) {
            if (isAIMessage(message)) {
                expect(pending.size).toBe(0)
                for (const call of message.tool_calls ?? []) {
                    if (!call.id) throw new Error('Missing tool call ID')
                    pending.add(call.id)
                }
            } else if (isToolMessage(message)) {
                expect(pending.delete(message.tool_call_id)).toBe(true)
            }
        }
        expect(pending.size).toBe(0)
    }

    it('summarizes old write arguments in one user turn and retains the exact request and newest cycle', () => {
        const system = new SystemMessage('Only use authorized project files.')
        const latest = cycle('latest')
        const messages = [system, request, ...cycle('old-a'), ...cycle('old-b'), ...cycle('old-c'), ...latest]
        const original = JSON.stringify(messages)
        const result = select(messages)

        expect(result.historyToCompress).toContain(messages[2])
        expect(result.historyToKeep.slice(0, 2)).toEqual([system, request])
        expect(result.historyToKeep.at(1)).toBe(request)
        expect(result.historyToKeep.slice(-latest.length)).toEqual(latest)
        expect(result.historyToKeep).not.toContain(messages[2])
        expectPaired(result.historyToCompress)
        expectPaired(result.historyToKeep)
        expect(JSON.stringify(messages)).toBe(original)
    })

    it('keeps complete parallel call groups on each side of the split', () => {
        const messages = [request, ...cycle('first', 3), ...cycle('second', 2), ...cycle('third', 3)]
        const result = select(messages)
        expect(result.historyToCompress.length).toBeGreaterThan(1)
        expectPaired(result.historyToCompress)
        expectPaired(result.historyToKeep)
    })

    it('keeps a pending parallel group together with its already received result', () => {
        const pending = cycle('pending', 2).slice(0, 2)
        const result = select([request, ...cycle('first'), ...cycle('second'), ...pending])
        expectPaired(result.historyToCompress)
        expect(result.historyToKeep.slice(-pending.length)).toEqual(pending)
    })

    it('does not split a single cycle or split across a missing result', () => {
        const single = [request, ...cycle('only', 3)]
        expect(select(single).historyToCompress).toEqual([])
        const incomplete = [request, ...cycle('unfinished', 2).slice(0, 2), ...cycle('later')]
        expect(select(incomplete).historyToCompress).toEqual([])
    })

    it('does not summarize a huge pinned request merely to remove a small tool cycle', () => {
        const messages = [new HumanMessage('Exact source text. '.repeat(50000)), ...cycle('first'), ...cycle('second')]
        expect(select(messages).historyToCompress).toEqual([])
    })

    it('retains manual whole-turn behavior and ordinary short latest turns', () => {
        const single = [request, ...cycle('first'), ...cycle('second')]
        expect(select(single, false).historyToCompress).toEqual([])
        const recent = new HumanMessage('Stop and report the current result.')
        const multi = [...single, recent, new AIMessage('Stopped.')]
        expect(select(multi)).toEqual(select(multi, false))
        expect(select(multi).historyToKeep).toEqual(multi.slice(-2))
    })

    it('can compress again after checkpoint serialization without losing the original request', async () => {
        const history = new ContextCompressionHistory()
        const first = select([request, ...cycle('first'), ...cycle('second'), ...cycle('third')])
        const restored = await load<BaseMessage[]>(
            JSON.stringify(
                history.buildNewHistory(
                    '<state_snapshot>Earlier work saved to chapter.md.</state_snapshot>',
                    first.historyToKeep,
                    'compression-1',
                    7,
                    20000
                )
            )
        )
        const second = select([...restored, ...cycle('fourth'), ...cycle('fifth')])
        expect(second.historyToCompress.length).toBeGreaterThan(0)
        expect(second.historyToKeep.filter((message) => message.id === request.id)).toHaveLength(1)
        expect(second.historyToKeep.find((message) => message.id === request.id)?.content).toBe(request.content)
        expectPaired(second.historyToKeep)
    })
})

describe('context compression message persistence', () => {
    const history = new ContextCompressionHistory()

    it('keeps a short tool receipt when a truncation reference would be larger, even at zero budget', async () => {
        const receipt = new ToolMessage({ tool_call_id: 'write', name: 'sandbox_append_file', content: 'Saved.' })
        const messages = [receipt]
        expect(await history.truncateHistoryToBudget(messages, 0)).toBe(messages)
    })

    it('keeps repeated usage invalidation bounded across message serialization and restoration', async () => {
        const source = new AIMessage({
            id: 'answer-1',
            name: 'assistant',
            content: [{ type: 'text', text: 'Inspecting the file' }],
            tool_calls: [{ id: 'call-1', name: 'read_file', args: { path: '/workspace/input.txt' } }],
            invalid_tool_calls: [{ name: 'read_file', args: '{', error: 'Invalid JSON' }],
            additional_kwargs: { reasoning_content: 'Need the source before editing' },
            response_metadata: { model_name: 'test-model', usage: { total_tokens: 1100 } }
        })
        let messages: BaseMessage[] = history.invalidateHistoryUsage([source])
        const first = JSON.stringify(messages)

        for (let round = 0; round < 20; round++) {
            const restored = await load<BaseMessage[]>(JSON.stringify(messages))
            messages = history.invalidateHistoryUsage(restored)
        }

        expect(JSON.stringify(messages)).toBe(first)
        expect(first).not.toMatch(/"lc_kwargs"|"lcKwargs"/)
        expect(messages[0]).toMatchObject({
            id: source.id,
            name: source.name,
            content: source.content,
            tool_calls: source.tool_calls,
            invalid_tool_calls: source.invalid_tool_calls,
            response_metadata: source.response_metadata,
            additional_kwargs: { ...source.additional_kwargs, contextCompressionUsageInvalidated: true }
        })
        expect(source.additional_kwargs.contextCompressionUsageInvalidated).toBeUndefined()
    })

    it('preserves provider usage when invalidating its history anchor', () => {
        const source = new AIMessage({
            content: 'answer',
            usage_metadata: { input_tokens: 1000, output_tokens: 100, total_tokens: 1100 }
        })
        const [message] = history.invalidateHistoryUsage([source])

        expect(message).toMatchObject({
            usage_metadata: source.usage_metadata,
            additional_kwargs: { contextCompressionUsageInvalidated: true }
        })
    })

    const toolResult = () =>
        new ToolMessage({
            id: 'result-1',
            name: 'read_file',
            tool_call_id: 'call-1',
            content: 'ORIGINAL_OUTPUT_START\n' + 'large output\n'.repeat(10000),
            status: 'success',
            metadata: { workspacePath: '/workspace/input.txt' },
            artifact: { type: 'image', data: 'data:image/png;base64,dGVzdA==' },
            additional_kwargs: { custom: { lc_kwargs: 'application-owned value' } },
            response_metadata: { duration: 12 }
        })

    function expectToolFields(message: BaseMessage, source: ToolMessage) {
        expect(message).toBeInstanceOf(ToolMessage)
        expect(message).toMatchObject({
            id: source.id,
            name: source.name,
            tool_call_id: source.tool_call_id,
            status: source.status,
            metadata: source.metadata,
            artifact: source.artifact,
            response_metadata: source.response_metadata,
            additional_kwargs: source.additional_kwargs
        })
    }

    it('removes pruned output from the entire serialized message while preserving tool fields', async () => {
        const source = toolResult()
        const { messages, prunedTokens } = await history.pruneOldToolOutputs([source], {
            pruneProtectTokens: 0,
            pruneMinimumTokens: 0,
            protectedUserTurns: 0
        })
        const serialized = JSON.stringify(messages[0])

        expect(prunedTokens).toBeGreaterThan(0)
        expect(serialized.length).toBeLessThan(2000)
        expect(serialized).not.toContain('ORIGINAL_OUTPUT_START')
        expect(messages[0].additional_kwargs.pruned).toBe(true)
        expectToolFields(messages[0], source)
        expectToolFields(await load<ToolMessage>(serialized), source)
        expect(source.content).toContain('ORIGINAL_OUTPUT_START')
    })

    it('stores a truncated output in its referenced file without retaining it in constructor arguments', async () => {
        const directory = await mkdtemp(path.join(os.tmpdir(), 'compression-history-test-'))
        const tempDir = jest.spyOn(history, 'getTempDir').mockReturnValue(directory)
        const source = toolResult()

        try {
            const [message] = await history.truncateHistoryToBudget([source], 256)
            const serialized = JSON.stringify(message)
            const originalFile = message.additional_kwargs.originalFile

            expect(serialized.length).toBeLessThan(3000)
            expect(serialized).not.toContain('ORIGINAL_OUTPUT_START')
            expect(message.additional_kwargs.truncated).toBe(true)
            expectToolFields(message, source)
            expectToolFields(await load<ToolMessage>(serialized), source)
            if (typeof originalFile !== 'string') throw new Error('Missing original output reference')
            expect(await readFile(originalFile, 'utf8')).toBe(source.content)
        } finally {
            tempDir.mockRestore()
            await rm(directory, { recursive: true, force: true })
        }
    })
})
