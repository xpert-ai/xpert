import { invocationStartupHeartbeat } from './invocation-startup-heartbeat'

describe('bounded startup heartbeat', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('renews only while active and caps the final lease at the ten minute deadline', async () => {
        const renew = jest.fn().mockResolvedValue(true)
        const heartbeat = invocationStartupHeartbeat(renew, 120_000)
        await jest.advanceTimersByTimeAsync(570_000)
        expect(renew).toHaveBeenLastCalledWith(30_000)
        await jest.advanceTimersByTimeAsync(30_000)
        expect(heartbeat.active()).toBe(false)
        expect(renew).toHaveBeenCalledTimes(19)
        await heartbeat.stop()
        expect(jest.getTimerCount()).toBe(0)
    })

    it.each([false, new Error('storage offline')])('stops on loss of ownership or persistence failure: %s', async (result) => {
        const renew = jest.fn(() => result instanceof Error ? Promise.reject(result) : Promise.resolve(result))
        const heartbeat = invocationStartupHeartbeat(renew, 120_000)
        await jest.advanceTimersByTimeAsync(180_000)
        expect(renew).toHaveBeenCalledTimes(1)
        expect(heartbeat.active()).toBe(false)
        expect(jest.getTimerCount()).toBe(0)
        await heartbeat.stop()
    })

    it('renews a short lease before its actual expiry', async () => {
        let expiresAt = Date.now() + 9_000
        const renew = jest.fn(async (leaseMs: number) => {
            if (Date.now() >= expiresAt) return false
            expiresAt = Date.now() + leaseMs
            return true
        })
        const heartbeat = invocationStartupHeartbeat(renew, 9_000)
        await jest.advanceTimersByTimeAsync(31_000)
        expect(heartbeat.active()).toBe(true)
        expect(expiresAt).toBeGreaterThan(Date.now())
        await heartbeat.stop()
        expect(jest.getTimerCount()).toBe(0)
    })

    it('serializes renewal and waits for an in-flight renewal when stopped', async () => {
        let resolve: (value: boolean) => void
        const renew = jest.fn(() => new Promise<boolean>((done) => { resolve = done }))
        const heartbeat = invocationStartupHeartbeat(renew, 120_000)
        await jest.advanceTimersByTimeAsync(120_000)
        expect(renew).toHaveBeenCalledTimes(1)
        const stopped = jest.fn()
        const stopping = heartbeat.stop().then(stopped)
        expect(stopped).not.toHaveBeenCalled()
        resolve(true)
        await stopping
        expect(stopped).toHaveBeenCalledTimes(1)
        expect(jest.getTimerCount()).toBe(0)
    })
})
