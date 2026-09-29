import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { withStreamingToolMessage } from './tool-message.utils'

jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn().mockResolvedValue(undefined) }))

describe('shell completion includes delivery finalization', () => {
    beforeEach(() => jest.clearAllMocks())
    it('keeps automatic output errors on the original call', async () => {
        const backend = { execute: jest.fn().mockRejectedValue(new Error('Output archival failed')) }
        await expect(withStreamingToolMessage('call', 'sandbox_shell', 'generate', backend)).rejects.toThrow(
            'Output archival failed'
        )
        const steps = jest.mocked(dispatchCustomEvent).mock.calls.map((call) => call[1])
        expect(steps).toEqual([
            expect.objectContaining({ id: 'call', status: 'running' }),
            expect.objectContaining({ id: 'call', status: 'fail' })
        ])
    })
    it('emits only the original call failure when delivery fails after a successful command', async () => {
        const backend = { execute: jest.fn().mockResolvedValue({ exitCode: 0, output: 'generated' }) }
        await expect(
            withStreamingToolMessage('call', 'sandbox_shell', 'generate', backend, undefined, async () => {
                throw new Error('Delivery failed')
            })
        ).rejects.toThrow('Delivery failed')
        const steps = jest.mocked(dispatchCustomEvent).mock.calls.map((call) => call[1])
        expect(steps).toEqual([
            expect.objectContaining({ id: 'call', status: 'running' }),
            expect.objectContaining({ id: 'call', status: 'fail', error: 'Delivery failed', output: 'generated' })
        ])
    })
    it('completes the original call once after successful finalization', async () => {
        const finalize = jest.fn().mockResolvedValue(undefined)
        await withStreamingToolMessage(
            'call',
            'sandbox_shell',
            'generate',
            { execute: jest.fn().mockResolvedValue({ exitCode: 0, output: 'ok' }) },
            undefined,
            finalize
        )
        expect(finalize).toHaveBeenCalledTimes(1)
        const steps = jest.mocked(dispatchCustomEvent).mock.calls.map((call) => call[1])
        expect(steps).toEqual([
            expect.objectContaining({ id: 'call', status: 'running' }),
            expect.objectContaining({ id: 'call', status: 'success' })
        ])
    })
    it.each([
        { exitCode: 1, output: 'failed' },
        { exitCode: 0, output: 'timeout', timedOut: true }
    ])('does not deliver unsuccessful commands: %j', async (result) => {
        const finalize = jest.fn()
        await withStreamingToolMessage(
            'call',
            'sandbox_shell',
            'generate',
            { execute: jest.fn().mockResolvedValue(result) },
            undefined,
            finalize
        )
        expect(finalize).not.toHaveBeenCalled()
    })
})

describe('bounded shell streaming', () => {
    it('caps progress output even when a provider emits unbounded lines', async () => {
        jest.clearAllMocks()
        const result = { output: 'bounded final result', exitCode: 0, truncated: true }
        const backend = {
            execute: jest.fn().mockResolvedValue(result),
            streamExecute: async (_command: string, onLine: (line: string) => void) => {
                for (let index = 0; index < 20; index++) onLine('x'.repeat(100000))
                return result
            }
        }
        await withStreamingToolMessage('bounded', 'sandbox_shell', 'verbose-command', backend, { maxOutputBytes: 4096 })
        const events = jest.mocked(dispatchCustomEvent).mock.calls.map((call) => call[1])
        for (const event of events) {
            if (typeof event === 'object' && event !== null && 'output' in event && typeof event.output === 'string') {
                expect(Buffer.byteLength(event.output)).toBeLessThanOrEqual(4096)
            }
        }
        expect(events).toContainEqual(expect.objectContaining({ status: 'success', output: result.output }))
    })
})
