import { Repository } from 'typeorm'
import { KnowledgeWikiJob } from './entities'
import { KnowledgeWikiJobLeaseService } from './knowledge-wiki-job-lease.service'

describe('KnowledgeWikiJobLeaseService', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    function createHarness() {
        const jobs = { update: jest.fn().mockResolvedValue({ affected: 1 }) }
        const service = new KnowledgeWikiJobLeaseService(jobs as unknown as Repository<KnowledgeWikiJob>)
        const job = Object.assign(new KnowledgeWikiJob(), {
            id: 'job-1',
            status: 'queued',
            executionAttempt: 0,
            isCurrent: true
        })
        return { service, jobs, job }
    }

    it('does not start a heartbeat if another worker already owns the job', async () => {
        const { service, jobs, job } = createHarness()
        jobs.update.mockResolvedValue({ affected: 0 })

        expect(await service.acquire(job)).toBeNull()
        await jest.advanceTimersByTimeAsync(6 * 60_000)
        expect(jobs.update).toHaveBeenCalledTimes(1)
        expect(jest.getTimerCount()).toBe(0)
    })

    it('stops renewing when the job is no longer owned by this execution', async () => {
        const { service, jobs, job } = createHarness()
        jobs.update.mockResolvedValueOnce({ affected: 1 }).mockResolvedValue({ affected: 0 })

        const stop = await service.acquire(job)
        await jest.advanceTimersByTimeAsync(6 * 60_000)

        expect(jobs.update).toHaveBeenCalledTimes(2)
        expect(jobs.update).toHaveBeenLastCalledWith(
            { id: 'job-1', executionAttempt: 1, status: 'running', isCurrent: true },
            expect.objectContaining({ leaseExpiresAt: expect.any(Date) })
        )
        expect(jest.getTimerCount()).toBe(0)
        await stop?.()
    })

    it('waits for an in-flight heartbeat when work completes and does not schedule another', async () => {
        const { service, jobs, job } = createHarness()
        const stop = await service.acquire(job)
        let finish: (value: { affected: number }) => void
        jobs.update.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve
                })
        )
        await jest.advanceTimersByTimeAsync(60_000)
        const stopped = jest.fn()
        const closing = stop?.().then(stopped)
        await jest.advanceTimersByTimeAsync(6 * 60_000)
        expect(stopped).not.toHaveBeenCalled()
        expect(jobs.update).toHaveBeenCalledTimes(2)

        finish({ affected: 1 })
        await closing
        expect(stopped).toHaveBeenCalledTimes(1)
        expect(jest.getTimerCount()).toBe(0)
    })
})
