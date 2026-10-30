import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { projectSummaryBatch, projectSummaryInput, selectRecoverableHistory } from './context-summary-policy'
import { estimateTokenCountSync } from './context-compression.budget'

describe('recoverable context selection', () => {
    it('keeps exact user corrections and an unfinished parallel group while selecting old complete work', () => {
        const system = new SystemMessage('Only authorized files.')
        const oldRequest = new HumanMessage({ id: 'old-request', content: 'Set active=false.' })
        const correction = new HumanMessage({
            id: 'correction',
            content: 'active=false applies ONLY to newly discovered factories.'
        })
        const oldCall = new AIMessage({
            content: '',
            tool_calls: [{ id: 'old', name: 'shell', args: { script: 'old script\n'.repeat(5000) } }]
        })
        const oldResult = new ToolMessage({ tool_call_id: 'old', content: 'saved' })
        const pending = new AIMessage({
            content: '',
            tool_calls: [
                { id: 'a', name: 'read', args: { path: 'a' } },
                { id: 'b', name: 'read', args: { path: 'b' } }
            ]
        })
        const oneResult = new ToolMessage({ tool_call_id: 'a', content: 'a body' })
        const selection = selectRecoverableHistory(
            [system, oldRequest, oldCall, oldResult, correction, pending, oneResult],
            2000
        )
        expect(selection.historyToCompress).toContain(oldCall)
        expect(selection.historyToCompress).toContain(oldResult)
        expect(selection.historyToKeep).toEqual([system, oldRequest, correction, pending, oneResult])
    })

    const call = (id: string) =>
        new AIMessage({ content: '', tool_calls: [{ id, name: 'opaque_tool', args: { body: 'x'.repeat(20000) } }] })
    const result = (id: string, error = false) =>
        new ToolMessage({ content: 'opaque result', tool_call_id: id, status: error ? 'error' : 'success' })

    it('keeps every explicit error in the current user turn even after later successful calls', () => {
        const old = [call('old'), result('old')]
        const current = [
            new HumanMessage('Fix the failure'),
            call('failed'),
            result('failed', true),
            call('latest'),
            result('latest')
        ]
        const selected = selectRecoverableHistory([...old, ...current], 1000)
        expect(selected.historyToCompress).toEqual([...old, current[0]])
        expect(selected.historyToKeep).toEqual(current)
    })

    it.each([
        [result('orphan')],
        [call('duplicate'), result('duplicate'), call('duplicate'), result('duplicate')],
        [call('pending'), new HumanMessage('interleaved'), result('pending')],
        [call('pending'), call('overlap'), result('overlap')]
    ])('leaves malformed call histories unchanged', (...malformed) => {
        const messages = [call('old'), result('old'), ...malformed, call('latest'), result('latest')]
        expect(selectRecoverableHistory(messages, 1)).toMatchObject({ historyToCompress: [], historyToKeep: messages })
    })

    it('archives old explicit failures as failures after a new user turn, without declaring them resolved', () => {
        const old = [call('failed'), result('failed', true)]
        const current = [new HumanMessage('Continue with a different task'), call('latest'), result('latest')]
        expect(selectRecoverableHistory([...old, ...current], 1000).historyToCompress).toEqual([...old, current[0]])
        expect(projectSummaryInput(old, 2000, 1)).toContain('"status":"error"')
    })

    it('bounds escaped summary input while preserving exact user instructions and original records', () => {
        const request = new HumanMessage('Only new factories; do not deploy.')
        const messages = [request, call('old'), result('old')]
        const original = JSON.stringify(messages)
        const text = projectSummaryInput(messages, 2000, 1.5)
        expect(estimateTokenCountSync(JSON.stringify(text)) * 1.5).toBeLessThanOrEqual(2000)
        expect(text).toContain(request.content)
        expect(text).toContain('source characters')
        expect(JSON.stringify(messages)).toBe(original)
    })

    it('fails rather than clips user instructions that cannot fit the summary input budget', () => {
        expect(() =>
            projectSummaryInput([new HumanMessage('constraint '.repeat(20000)), call('old')], 1000, 1)
        ).toThrow()
    })

    it('batches every source record exactly once, preserves complete cycles, and budgets the previous snapshot', () => {
        const messages = Array.from({ length: 60 }, (_, i) => [call(String(i)), result(String(i))]).flat()
        let start = 0
        const records: number[] = []
        let batches = 0
        while (start < messages.length) {
            const batch = projectSummaryBatch(messages, start, 2000, 1.5, 'Prior pending verification.')
            expect(estimateTokenCountSync(JSON.stringify(batch.text)) * 1.5).toBeLessThanOrEqual(2000)
            expect(batch.text).toContain('Prior pending verification.')
            expect(batch.end % 2).toBe(0)
            records.push(
                ...batch.text
                    .split('\n')
                    .filter((line) => line.startsWith('{'))
                    .map((line) => JSON.parse(line).record)
            )
            start = batch.end
            batches++
        }
        expect(batches).toBeGreaterThan(1)
        expect(records).toEqual(Array.from({ length: 120 }, (_, i) => i))
    })

    it('never splits a parallel group even when a smaller prefix could fit', () => {
        const parallel = new AIMessage({
            content: '',
            tool_calls: [
                { id: 'a', name: 'read', args: { path: 'a' } },
                { id: 'b', name: 'read', args: { path: 'b' } }
            ]
        })
        const messages = [call('old'), result('old'), parallel, result('b'), result('a')]
        const batch = projectSummaryBatch(messages, 0, 250, 1, '')
        expect(batch.end).toBe(2)
        expect(projectSummaryBatch(messages, batch.end, 1000, 1, '').end).toBe(5)
    })
})
