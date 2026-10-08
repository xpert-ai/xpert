import { readTaskWaitPolicy } from './task-wait-policy'
import { DEFAULT_TASK_WAIT_POLICY } from './task-wait'

describe('host-owned task wait budgets', () => {
    it('provides immutable bounded defaults', () => {
        const policy = readTaskWaitPolicy({})
        expect(policy).toEqual(DEFAULT_TASK_WAIT_POLICY)
        expect(Object.isFrozen(policy)).toBe(true)
    })
    it('allows disabling inline observation without disabling durable waits', () => {
        expect(readTaskWaitPolicy({ XPERT_TASK_INLINE_WAIT_MS: '0' })).toMatchObject({
            inlineWaitMs: 0,
            maxWaitMs: 86400000
        })
    })
    it.each(['NaN', '-1', '30001'])('rejects invalid inline budgets: %s', (value) => {
        expect(() => readTaskWaitPolicy({ XPERT_TASK_INLINE_WAIT_MS: value })).toThrow()
    })
    it('requires the unknown grace period to fit inside the overall deadline', () => {
        expect(() => readTaskWaitPolicy({ XPERT_TASK_MAX_WAIT_MS: '1000' })).toThrow('unknown grace')
    })
})
