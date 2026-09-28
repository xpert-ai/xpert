import { load } from '@langchain/core/load'
import { AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ContextCompressionHistory } from './context-compression.history'

describe('context compression message persistence', () => {
    const history = new ContextCompressionHistory()

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
