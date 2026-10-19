import { lastValueFrom, of, throwError, toArray } from 'rxjs'
import { persistBeforeTermination } from './persist-before-termination'

describe('durable finalization', () => {
    it.each([false, true])('awaits persistence before forwarding termination (error=%s)', async (failed) => {
        let commit: () => void = () => {}
        const gate = new Promise<void>((resolve) => {
            commit = resolve
        })
        const persistence = jest.fn(() => gate)
        let ended = false
        const source = failed ? throwError(() => new Error('runtime lost')) : of('complete content')
        const pending = lastValueFrom(source.pipe(persistBeforeTermination(persistence), toArray())).then(
            () => {
                ended = true
            },
            () => {
                ended = true
            }
        )
        await Promise.resolve()
        expect(ended).toBe(false)
        expect(persistence).toHaveBeenCalledTimes(1)
        commit()
        await pending
        expect(ended).toBe(true)
    })
})
