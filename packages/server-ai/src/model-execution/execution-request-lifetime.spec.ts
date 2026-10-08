import { executionRequestLifetime } from './execution-request-lifetime'
import type { ModelExecutionGrant } from './execution.entity'

describe('execution request lifetime', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())
    function fixture() {
        const abort = new AbortController()
        const grant = {
            limits: { requestIdleSeconds: 600 },
            absoluteExpiresAt: new Date(Date.now() + 3600_000)
        } as ModelExecutionGrant
        return { abort, lifetime: executionRequestLifetime(grant, abort) }
    }
    it('keeps a live stream beyond ten minutes, but honors the explicit execution deadline', () => {
        const f = fixture()
        for (let i = 0; i < 7; i++) {
            jest.advanceTimersByTime(300_000)
            f.lifetime.activity()
        }
        expect(f.abort.signal.aborted).toBe(false)
        for (let i = 0; i < 5; i++) {
            jest.advanceTimersByTime(300_000)
            f.lifetime.activity()
        }
        expect(f.abort.signal.aborted).toBe(true)
        f.lifetime.dispose()
    })
    it('ends an idle request and releases all timers after completion', () => {
        const f = fixture()
        jest.advanceTimersByTime(600_000)
        expect(f.abort.signal.aborted).toBe(true)
        f.lifetime.dispose()
        expect(jest.getTimerCount()).toBe(0)
        const completed = fixture()
        completed.lifetime.dispose()
        jest.advanceTimersByTime(3600_000)
        expect(completed.abort.signal.aborted).toBe(false)
    })
})
