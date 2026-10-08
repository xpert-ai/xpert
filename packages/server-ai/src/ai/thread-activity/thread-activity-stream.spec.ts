import { firstValueFrom } from 'rxjs'
import type { ThreadActivitySnapshot } from '@xpert-ai/contracts'
import { threadActivityStream } from './thread-activity-stream'

const snapshot: ThreadActivitySnapshot = {
    version: 1,
    threadId: 'thread',
    cards: [],
    runs: [
        {
            id: 'short-run',
            status: 'success',
            createdAt: '2026-10-06T00:00:00Z',
            updatedAt: '2026-10-06T00:00:01Z',
            messageRevision: '1'
        }
    ]
}
describe('durable thread discovery', () => {
    afterEach(() => jest.useRealTimers())
    it('includes already completed runs on both initial subscription and reconnect', async () => {
        const read = jest.fn().mockResolvedValue(snapshot)
        const first = await firstValueFrom(threadActivityStream(read))
        const recovered = await firstValueFrom(threadActivityStream(read))
        expect(first.type).toBe('thread.snapshot')
        expect(recovered).toEqual(first)
        expect(first.data.runs[0].status).toBe('success')
    })
    it('keeps observing after completion and rechecks authorization without overlapping reads', async () => {
        jest.useFakeTimers()
        const read = jest
            .fn()
            .mockResolvedValueOnce(snapshot)
            .mockResolvedValueOnce(snapshot)
            .mockRejectedValueOnce(new Error('access revoked'))
        const next = jest.fn(),
            error = jest.fn()
        const subscription = threadActivityStream(read, 10).subscribe({ next, error })
        await jest.advanceTimersByTimeAsync(25)
        expect(next).toHaveBeenCalledTimes(1)
        expect(read).toHaveBeenCalledTimes(3)
        expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'access revoked' }))
        subscription.unsubscribe()
    })
    it('discards a late snapshot after closing the subscription', async () => {
        let resolve: (value: ThreadActivitySnapshot) => void
        const read = () =>
            new Promise<ThreadActivitySnapshot>((done) => {
                resolve = done
            })
        const next = jest.fn()
        const subscription = threadActivityStream(read).subscribe(next)
        subscription.unsubscribe()
        resolve(snapshot)
        await Promise.resolve()
        expect(next).not.toHaveBeenCalled()
    })
})
