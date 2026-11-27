import { previewToolValue, isToolActivity, summarizeToolActivities } from '@xpert-ai/chatkit-types'
import type { ToolDetailReference } from '@xpert-ai/chatkit-types'
import { ToolTimelineProjection } from './tool-timeline'
import { presentToolValue } from './tool-presentation'

const reference: ToolDetailReference = {
    conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    executionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    toolCallId: 'call-1',
    phase: 'output',
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    sha256: 'a'.repeat(64)
}

describe('tool timeline public projection', () => {
    it('bounds Unicode, line count, JSON depth and item count without changing values', () => {
        for (const text of ['你好🙂'.repeat(2000), 'line\n'.repeat(50)]) {
            const result = previewToolValue(text)
            expect(Buffer.byteLength(String(result.preview))).toBeLessThanOrEqual(2048)
            expect(String(result.preview).split('\n').length).toBeLessThanOrEqual(6)
            expect(result.presentation.truncated).toBe(true)
            expect(result.text).toBe(text)
            expect(String(result.preview)).not.toContain('\uFFFD')
        }
        const value = Array.from({ length: 100 }, () => ({ child: { nested: 'original' } }))
        const result = previewToolValue(value)
        expect(result.preview).toEqual(Array.from({ length: 5 }, () => ({ child: {} })))
        expect(result.presentation).toMatchObject({ itemCount: 100, truncated: true })
        expect(value[0].child.nested).toBe('original')
        for (const value of [null, false, 0, '', [], {}]) {
            expect(previewToolValue(value).preview).toEqual(value)
            expect(previewToolValue(value).presentation.truncated).toBe(false)
        }
    })

    it('rejects invalid semantics and aggregates in first occurrence order', () => {
        expect(isToolActivity({ kind: 'file', action: 'execute' })).toBe(false)
        expect(isToolActivity({ kind: 'file', action: 'read', secret: 'hidden' })).toBe(false)
        expect(
            summarizeToolActivities([
                { kind: 'file', action: 'write' },
                { kind: 'skill', action: 'read' },
                { kind: 'file', action: 'read' }
            ])
        ).toMatchObject({ kinds: ['file', 'skill'], mixed: true })
        expect(summarizeToolActivities([{ kind: 'file', action: 'read' }, undefined])).toMatchObject({
            kinds: ['file'],
            unknown: true,
            kind: undefined
        })
    })

    it('bounds complete serialized JSON while preserving the exact snapshot text', () => {
        const json = JSON.stringify(
            Array.from({ length: 200 }, (_, row) => ({ row, nested: { value: row } })),
            null,
            2
        )
        const result = previewToolValue(json)
        expect(result.text).toBe(json)
        expect(result.presentation).toMatchObject({ format: 'json', itemCount: 200, truncated: true })
        expect(result.preview).toEqual(Array.from({ length: 5 }, (_, row) => ({ row, nested: {} })))
        expect(previewToolValue('{"partial":').presentation.format).toBe('text')
        expect(previewToolValue('false').preview).toBe('false')
        expect(previewToolValue('line\n'.repeat(2000)).presentation.lineCount).toBe(2000)
        expect(previewToolValue('').presentation.lineCount).toBe(0)
        expect(previewToolValue({ empty: { child: {} } }).presentation.truncated).toBe(false)
    })

    it('persists only the authorized snapshot and leaves model input unchanged', async () => {
        const write = jest.fn().mockResolvedValue(reference)
        const projection = new ToolTimelineProjection(write)
        const original = { text: 'hello\n'.repeat(50), token: 'secret', changeSummary: 'internal' }
        const value = presentToolValue(undefined, 'input', original)
        const result = await projection.project(
            'call-1',
            'read',
            { executionId: reference.executionId },
            {
                tool: 'read',
                activity: { kind: 'file', action: 'read' }
            },
            { input: value },
            ['input'],
            { running: true }
        )
        expect(result.presentation.input.detail).toBe(reference)
        expect(write.mock.calls[0][0].text).not.toContain('secret')
        expect(write.mock.calls[0][0].text).not.toContain('changeSummary')
        expect(write.mock.calls[0][0].text).toContain('[REDACTED]')
        expect(original.token).toBe('secret')
        expect(original.changeSummary).toBe('internal')
    })

    it('stores a summary-only result once complete, freezing per-call semantics across updates', async () => {
        const write = jest.fn().mockResolvedValue(reference)
        const projection = new ToolTimelineProjection(write)
        const display = {
            tool: 'reader',
            activity: { kind: 'skill', action: 'read' },
            outputMode: 'summary',
            outputSummary: 'File read'
        }
        await projection.project('call-1', 'reader', {}, display, { input: { path: 'a' } }, ['input'])
        const running = await projection.project(
            'call-1',
            'reader',
            {},
            display,
            { output: 'private-to-model full read' },
            ['output'],
            { running: true }
        )
        expect(running.output).toBeUndefined()
        expect(write).not.toHaveBeenCalled()
        const complete = await projection.project(
            'call-1',
            'reader',
            {},
            { tool: 'reader', activity: { kind: 'file', action: 'write' } },
            { output: 'exact snapshot' },
            ['output']
        )
        expect(complete.presentation.activity).toEqual({ kind: 'skill', action: 'read' })
        expect(complete.presentation.output).toMatchObject({ mode: 'summary', detail: reference })
        expect(write.mock.calls[0][0].text).toBe('exact snapshot')
    })

    it('never falls back to private content after policy withholding or snapshot failure', async () => {
        const write = jest.fn().mockRejectedValue(new Error('unavailable'))
        const projection = new ToolTimelineProjection(write)
        const withheld = presentToolValue({ tool: 'restricted' }, 'output', { private: 'data' })
        const result = await projection.project('x', 'restricted', {}, {}, { output: withheld }, ['output'], {
            withheld: true
        })
        expect(result).toEqual({ presentation: { version: 1, output: { state: 'not-public', truncated: false } } })
        expect(write).not.toHaveBeenCalled()
        const failedStore = await projection.project('y', 'legacy', {}, undefined, { output: 'x'.repeat(10000) }, [
            'output'
        ])
        expect(failedStore.output).toHaveLength(2048)
        expect(failedStore.presentation.output.detail).toBeUndefined()
    })

    it('keeps a bounded event when a detail writer throws before returning a promise', async () => {
        const projection = new ToolTimelineProjection(() => {
            throw new Error('writer unavailable')
        })
        const result = await projection.project('sync-error', 'read', {}, undefined, { output: 'x'.repeat(10000) }, [
            'output'
        ])
        expect(result.output).toHaveLength(2048)
        expect(result.presentation.output.truncated).toBe(true)
        expect(result.presentation.output.detail).toBeUndefined()
    })

    it('allows an owner to resolve validated operation inputs and isolates executions', async () => {
        const projection = new ToolTimelineProjection()
        const display = {
            tool: 'multi',
            activity: (input: unknown) => {
                if (input && typeof input === 'object' && 'operation' in input && input.operation === 'read')
                    return { kind: 'file', action: 'read' }
                return undefined
            }
        }
        const read = await projection.project(
            'same',
            'multi',
            { executionId: 'one' },
            display,
            { input: { operation: 'read' } },
            ['input']
        )
        const invalid = await projection.project(
            'same',
            'multi',
            { executionId: 'two' },
            display,
            { input: { operation: 'invalid' } },
            ['input']
        )
        expect(read.presentation.activity).toEqual({ kind: 'file', action: 'read' })
        expect(invalid.presentation.activity).toBeUndefined()
        const inherited = await projection.project('other', 'nested', {}, display, {}, [])
        expect(inherited.presentation.activity).toBeUndefined()
    })
})
