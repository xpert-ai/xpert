import { EventEmitter, getEventListeners } from 'node:events'
import type { Response } from 'express'
import { startExecutionSseKeepalive } from './execution-sse-keepalive'
import { executionRequestLifetime } from './execution-request-lifetime'
import type { ModelExecutionGrant } from './execution.entity'

function fixture() {
    const abort = new AbortController()
    const response = Object.assign(new EventEmitter(), {
        destroyed: false,
        writableEnded: false,
        writableNeedDrain: false,
        write: jest.fn<boolean, [string]>().mockReturnValue(true),
        destroy: jest.fn()
    })
    const stop = startExecutionSseKeepalive(response as unknown as Response, abort.signal)
    return { stop, response, abort }
}

describe('Responses bridge keepalive', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it.each(['close', 'finish', 'error', 'abort', 'stop'])('releases only its timer and listeners on %s', (event) => {
        const f = fixture()
        jest.advanceTimersByTime(30_000)
        expect(f.response.write).toHaveBeenCalledWith(': keep-alive\n\n')
        if (event === 'abort') f.abort.abort()
        else if (event === 'stop') f.stop()
        else f.response.emit(event)
        expect(jest.getTimerCount()).toBe(0)
        expect(f.response.eventNames()).toEqual([])
        expect(getEventListeners(f.abort.signal, 'abort')).toHaveLength(0)
        jest.advanceTimersByTime(60_000)
        expect(f.response.write).toHaveBeenCalledTimes(1)
    })

    it('skips heartbeats while the response needs drain and resumes afterward', () => {
        const f = fixture()
        f.response.write.mockImplementationOnce(() => {
            f.response.writableNeedDrain = true
            return false
        })
        jest.advanceTimersByTime(125_000)
        expect(f.response.write).toHaveBeenCalledTimes(1)
        f.response.writableNeedDrain = false
        jest.advanceTimersByTime(30_000)
        expect(f.response.write).toHaveBeenCalledTimes(2)
        f.stop()
        expect(jest.getTimerCount()).toBe(0)
    })

    it.each(['idle', 'deadline'])('does not extend the existing %s limit', (limit) => {
        const f = fixture()
        const lifetime = executionRequestLifetime(
            {
                limits: { requestIdleSeconds: limit === 'idle' ? 120 : 600 },
                absoluteExpiresAt: new Date(Date.now() + 180_000)
            } as ModelExecutionGrant,
            f.abort
        )
        try {
            jest.advanceTimersByTime(limit === 'idle' ? 120_000 : 180_000)
            expect(f.response.write.mock.calls.length).toBeGreaterThan(0)
            expect(f.abort.signal.aborted).toBe(true)
            const writes = f.response.write.mock.calls.length
            jest.advanceTimersByTime(60_000)
            expect(f.response.write).toHaveBeenCalledTimes(writes)
        } finally {
            lifetime.dispose()
            f.stop()
        }
        expect(jest.getTimerCount()).toBe(0)
    })

    it('stops the timer when a heartbeat write throws', () => {
        const f = fixture()
        f.response.write.mockImplementation(() => {
            throw new Error('closed socket')
        })
        jest.advanceTimersByTime(30_000)
        expect(f.response.destroy).toHaveBeenCalledTimes(1)
        expect(jest.getTimerCount()).toBe(0)
        expect(f.response.eventNames()).toEqual([])
    })
})
