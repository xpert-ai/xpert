jest.mock('@xpert-ai/server-core', () => ({ RedisEphemeralService: class RedisEphemeralService {} }))

import { TSandboxConfigurable } from '@xpert-ai/contracts'
import { Observable, Subject } from 'rxjs'
import { SandboxExecutionLeaseService } from './sandbox-execution-lease.service'

describe('execution sandbox retention', () => {
    const sandbox: TSandboxConfigurable = { provider: 'docker-sandbox', containerId: 'container-a' }
    let owners: Map<string, Map<string, number>>
    let ephemeral: {
        touchActivity: jest.Mock
        releaseActivity: jest.Mock
        activityRemainingMs: jest.Mock
    }
    let service: SandboxExecutionLeaseService

    beforeEach(() => {
        jest.useFakeTimers()
        owners = new Map()
        ephemeral = {
            touchActivity: jest.fn(async (resource: string, owner: string, ttlMs: number) => {
                const activities = owners.get(resource) ?? new Map<string, number>()
                activities.set(owner, Date.now() + ttlMs)
                owners.set(resource, activities)
            }),
            releaseActivity: jest.fn(async (resource: string, owner: string) => {
                owners.get(resource)?.delete(owner)
            }),
            activityRemainingMs: jest.fn(async (resource: string) =>
                Math.max(0, ...[...(owners.get(resource)?.values() ?? [])].map((until) => until - Date.now()))
            )
        }
        service = new SandboxExecutionLeaseService(ephemeral as never)
    })

    afterEach(() => jest.useRealTimers())

    async function isRetained(containerId = 'container-a'): Promise<boolean> {
        return (await ephemeral.activityRemainingMs(`sandbox:${containerId}`)) > 0
    }

    it('retains the acquired container while execution waits, independently of later context changes', async () => {
        const acquired = { ...sandbox }
        const thinking = new Subject<string>()
        const stream = await service.run(async (retain) => {
            await retain(acquired)
            return thinking
        })
        const subscription = stream.subscribe()
        acquired.containerId = 'container-b'

        expect(await isRetained('container-a')).toBe(true)
        expect(await isRetained('container-b')).toBe(false)
        subscription.unsubscribe()
        await jest.advanceTimersByTimeAsync(0)
        expect(await isRetained('container-a')).toBe(false)
    })

    it('renews retention during long model waits without shell activity', async () => {
        const stream = await service.run(async (retain) => {
            await retain(sandbox)
            return new Subject<string>()
        })
        const subscription = stream.subscribe()

        await jest.advanceTimersByTimeAsync(300_000)

        expect(await isRetained()).toBe(true)
        expect(ephemeral.touchActivity.mock.calls.length).toBeGreaterThan(1)
        subscription.unsubscribe()
    })

    it('releases only its own activity while another invocation retains the same container', async () => {
        const secondApi = new SandboxExecutionLeaseService(ephemeral as never)
        const streams = await Promise.all(
            [service, secondApi].map((api) =>
                api.run(async (retain) => {
                    await retain(sandbox)
                    return new Subject<string>()
                })
            )
        )
        const subscriptions = streams.map((stream) => stream.subscribe())

        subscriptions[0].unsubscribe()
        await jest.advanceTimersByTimeAsync(0)
        expect(await isRetained()).toBe(true)

        subscriptions[1].unsubscribe()
        await jest.advanceTimersByTimeAsync(0)
        expect(await isRetained()).toBe(false)
    })

    it('releases retention when graph preparation fails before a stream is returned', async () => {
        await expect(
            service.run(async (retain) => {
                await retain(sandbox)
                throw new Error('Graph compile failed')
            })
        ).rejects.toThrow('Graph compile failed')
        expect(await isRetained()).toBe(false)
        expect(jest.getTimerCount()).toBe(0)
    })

    it('stops retention on cancellation while graph preparation has not returned a stream', async () => {
        const controller = new AbortController()
        let finishPreparation: (stream: Subject<string>) => void = () => {
            throw new Error('Preparation not started')
        }
        const preparation = service.run(async (retain) => {
            await retain(sandbox)
            return new Promise<Subject<string>>((resolve) => {
                finishPreparation = resolve
            })
        }, controller.signal)
        const settled = preparation.catch((error: unknown) => error)
        await jest.advanceTimersByTimeAsync(0)

        controller.abort()
        await jest.advanceTimersByTimeAsync(0)
        const activeAfterCancel = await isRetained()
        finishPreparation(new Subject<string>())
        const result = await settled
        if (result instanceof Observable) {
            result.subscribe().unsubscribe()
        }

        expect(activeAfterCancel).toBe(false)
        expect(result).toMatchObject({ name: 'AbortError' })
        expect(jest.getTimerCount()).toBe(0)
    })

    it('does not acquire a lease for an execution that was already canceled', async () => {
        const controller = new AbortController()
        controller.abort()
        const prepare = jest.fn(async (retain: (sandbox: TSandboxConfigurable) => Promise<void>) => {
            await retain(sandbox)
            return new Subject<string>()
        })
        await expect(service.run(prepare, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
        expect(prepare).not.toHaveBeenCalled()
        expect(ephemeral.touchActivity).not.toHaveBeenCalled()
    })

    it('releases an initial Redis registration that finishes after cancellation', async () => {
        const controller = new AbortController()
        const touch = ephemeral.touchActivity.getMockImplementation()!
        let finishRegistration: () => void = () => {
            throw new Error('Registration not started')
        }
        ephemeral.touchActivity.mockImplementationOnce((resource: string, owner: string, ttlMs: number) =>
            new Promise<void>((resolve) => {
                finishRegistration = resolve
            }).then(() => touch(resource, owner, ttlMs))
        )
        const preparation = service.run(async (retain) => {
            await retain(sandbox)
            return new Subject<string>()
        }, controller.signal)
        const canceled = expect(preparation).rejects.toMatchObject({ name: 'AbortError' })
        controller.abort()
        finishRegistration()
        await canceled

        expect(await isRetained()).toBe(false)
        expect(ephemeral.releaseActivity).toHaveBeenCalledTimes(1)
        expect(jest.getTimerCount()).toBe(0)
    })

    it('expires retention after the API process loses its heartbeat', async () => {
        const stream = await service.run(async (retain) => {
            await retain(sandbox)
            return new Subject<string>()
        })
        const subscription = stream.subscribe()
        jest.clearAllTimers()
        await jest.advanceTimersByTimeAsync(121_000)

        expect(await isRetained()).toBe(false)
        subscription.unsubscribe()
    })

    it.each(['complete', 'error', 'unsubscribe'] as const)('releases its activity on stream %s', async (ending) => {
        const events = new Subject<string>()
        const stream = await service.run(async (retain) => {
            await retain(sandbox)
            return events
        })
        const subscription = stream.subscribe({ error: () => undefined })
        if (ending === 'complete') events.complete()
        if (ending === 'error') events.error(new Error('Graph failed'))
        if (ending === 'unsubscribe') subscription.unsubscribe()
        await jest.advanceTimersByTimeAsync(0)

        expect(await isRetained()).toBe(false)
        expect(jest.getTimerCount()).toBe(0)
    })

    it('waits for a pending heartbeat before releasing so it cannot recreate abandoned activity', async () => {
        const stream = await service.run(async (retain) => {
            await retain(sandbox)
            return new Subject<string>()
        })
        const subscription = stream.subscribe()
        const touch = ephemeral.touchActivity.getMockImplementation()!
        let finishRenewal: () => void = () => {
            throw new Error('Heartbeat was not started')
        }
        ephemeral.touchActivity.mockImplementationOnce((resource: string, owner: string, ttlMs: number) =>
            new Promise<void>((resolve) => {
                finishRenewal = resolve
            }).then(() => touch(resource, owner, ttlMs))
        )
        await jest.advanceTimersByTimeAsync(30_000)
        subscription.unsubscribe()
        finishRenewal()
        await jest.advanceTimersByTimeAsync(0)

        expect(await isRetained()).toBe(false)
    })

    it('refuses to start unprotected execution if initial retention cannot be registered', async () => {
        ephemeral.touchActivity.mockRejectedValueOnce(new Error('Redis unavailable'))
        const started = jest.fn()
        await expect(
            service.run(async (retain) => {
                await retain(sandbox)
                started()
                return new Subject<string>()
            })
        ).rejects.toThrow('Redis unavailable')
        expect(started).not.toHaveBeenCalled()
        expect(jest.getTimerCount()).toBe(0)
    })

    it('preserves other sandbox providers without applying Docker retention', async () => {
        for (const provider of ['local-shell-sandbox', 'nsjail-sandbox']) {
            const stream = await service.run(async (retain) => {
                await retain({ provider })
                return new Subject<string>()
            })
            stream.subscribe().unsubscribe()
        }
        expect(ephemeral.touchActivity).not.toHaveBeenCalled()
    })
})
