import Queue from 'bull'
import { randomUUID } from 'node:crypto'
import type { HandoffMessage } from '@xpert-ai/plugin-sdk'
import { HandoffQueueGatewayService } from './handoff-queue-gateway.service'
import { XPERT_HANDOFF_JOB, XPERT_HANDOFF_QUEUE_REALTIME } from '../constants'

const redisUrl = process.env.HANDOFF_TEST_REDIS_URL
const redisSuite = redisUrl ? describe : describe.skip

redisSuite('Handoff producer deduplication (real Bull and Redis)', () => {
    jest.setTimeout(30_000)
    let first: Queue.Queue<HandoffMessage>
    let second: Queue.Queue<HandoffMessage>
    let gateway: HandoffQueueGatewayService
    let other: HandoffQueueGatewayService
    const message = (overrides: Partial<HandoffMessage> = {}): HandoffMessage => ({
        id: 'stable:message:id',
        type: 'test.dispatch.v1',
        version: 1,
        tenantId: 'tenant-a',
        headers: { organizationId: 'org-a' },
        sessionKey: 'session',
        businessKey: 'business',
        attempt: 1,
        maxAttempts: 1,
        enqueuedAt: Date.now(),
        traceId: 'trace',
        payload: {},
        ...overrides
    })
    beforeEach(async () => {
        const name = `handoff-dedup-test-${randomUUID()}`
        first = new Queue<HandoffMessage>(name, redisUrl)
        second = new Queue<HandoffMessage>(name, redisUrl)
        gateway = new HandoffQueueGatewayService(first, first, first, first)
        other = new HandoffQueueGatewayService(second, second, second, second)
        await Promise.all([first.isReady(), second.isReady()])
    })
    afterEach(async () => {
        await first.obliterate({ force: true })
        await Promise.all([first.close(), second.close()])
    })
    const enqueue = (target: HandoffQueueGatewayService, value = message()) =>
        target.enqueue(XPERT_HANDOFF_QUEUE_REALTIME, value, { deduplicate: true })

    it('atomically accepts one job when independent producers concurrently retry the same envelope', async () => {
        await Promise.all(Array.from({ length: 20 }, (_, index) => enqueue(index % 2 ? gateway : other)))
        const jobs = await first.getJobs(['waiting'])
        expect(jobs).toHaveLength(1)
        expect(jobs[0].data.id).toBe('stable:message:id')
    })

    it.each(['completed', 'failed'] as const)(
        'retains deduplication after %s and a lost acknowledgement',
        async (state) => {
            let executions = 0
            const finished = new Promise<void>((resolve, reject) => {
                first.once(state, () => resolve())
                first.once('error', reject)
            })
            void first.process(XPERT_HANDOFF_JOB, async () => {
                executions++
                if (state === 'failed') throw new Error('Expected handler failure')
            })
            await enqueue(gateway)
            await finished
            // The producer saw an error after acceptance; another process retries after execution.
            await enqueue(other)
            const jobs = await first.getJobs(['waiting', 'active', 'completed', 'failed'])
            expect(jobs).toHaveLength(1)
            expect(await jobs[0].getState()).toBe(state)
            expect(jobs[0].opts.removeOnComplete).toEqual({ age: 86400 })
            expect(jobs[0].opts.removeOnFail).toEqual({ age: 86400 })
            expect(executions).toBe(1)
        }
    )

    it('keeps tenants, organizations, message types and independent IDs separate', async () => {
        await Promise.all(
            [
                message(),
                message({ tenantId: 'tenant-b' }),
                message({ headers: { organizationId: 'org-b' } }),
                message({ type: 'test.other.v1' }),
                message({ id: 'another-message' })
            ].map((value) => enqueue(gateway, value))
        )
        expect(await first.getJobs(['waiting'])).toHaveLength(5)
    })

    it('preserves the ordinary enqueue behavior for existing producers', async () => {
        await gateway.enqueue(XPERT_HANDOFF_QUEUE_REALTIME, message())
        await other.enqueue(XPERT_HANDOFF_QUEUE_REALTIME, message())
        const jobs = await first.getJobs(['waiting'])
        expect(jobs).toHaveLength(2)
        expect(jobs[0].opts.removeOnComplete).toBe(true)
        expect(jobs[0].opts.removeOnFail).toBe(false)
    })
})
